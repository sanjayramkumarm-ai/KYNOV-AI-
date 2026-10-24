import type { Request, Response } from 'express';
import { Folder, User, UserPreference } from '../models';
import { env } from '../config/env';
import { features } from '../config/features';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import { notify } from '../services/notifications';
import { hashToken, setAuthCookies, signAccessToken, signRefreshToken } from '../services/authTokens';
import {
  buildConsentUrl,
  exchangeCode,
  GMAIL_READ_SCOPES,
  GMAIL_SEND_SCOPE,
  saveGoogleConnection,
  SIGNIN_SCOPES,
} from '../services/google';
import { createState, verifyState } from '../services/oauthState';

const clientBase = env.CLIENT_ORIGINS[0] ?? 'http://localhost:5173';

function failRedirect(res: Response, target: string, message: string) {
  const url = new URL(target, clientBase);
  url.searchParams.set('error', message.slice(0, 300));
  return res.redirect(url.toString());
}

/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Google sign-in Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */

/** Absolute callback URL for the Google sign-in flow (separate from Gmail). */
function signinRedirectUri(_req: Request) {
  const explicit = process.env.GOOGLE_SIGNIN_REDIRECT_URI;
  if (explicit) return explicit;
  const gmailCallback = env.GOOGLE_REDIRECT_URI || 'http://localhost:' + env.PORT + '/api/gmail/oauth/callback';
  try {
    const base = new URL(gmailCallback);
    return base.protocol + '//' + base.host + '/api/auth/google/callback';
  } catch {
    return 'http://localhost:' + env.PORT + '/api/auth/google/callback';
  }
}
export const startGoogleSignIn = asyncHandler(async (req: Request, res: Response) => {
  if (!features.googleSignIn) {
    throw ApiError.notConfigured(
      'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env.',
      { envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
    );
  }
  const state = createState(res, 'signin');
  const url = buildConsentUrl({ scopes: SIGNIN_SCOPES, state, redirectUri: signinRedirectUri(req) });
  if (req.query.redirect === 'true') return res.redirect(url);
  return res.json({ success: true, data: { url } });
});

export const googleSignInCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) return failRedirect(res, '/login', `Google sign-in was cancelled (${error}).`);
  if (!code) return failRedirect(res, '/login', 'Google did not return an authorization code.');
  try {
    verifyState(req, res, state);
    const { tokens, profile } = await exchangeCode(code, signinRedirectUri(req));
    if (!profile.email) return failRedirect(res, '/login', 'Google did not share an email address.');

    const email = profile.email.toLowerCase();
    let user = await User.findOne({ $or: [{ googleId: profile.id }, { email }] });
    if (!user) {
      user = await User.create({
        name: profile.name || email.split('@')[0],
        email,
        googleId: profile.id,
        avatarUrl: profile.picture,
        authProvider: 'google',
        emailVerified: true,
      });
      await UserPreference.create({ user: user._id });
      await Folder.create({ user: user._id, name: 'Documents', parent: null, path: '/Documents' });
      await notify({
        userId: String(user._id),
        type: 'system',
        title: 'Welcome to KYNOV AI',
        body: 'Your workspace is ready. Upload a document or connect Gmail.',
        link: '/dashboard',
      });
    } else {
      user.googleId = profile.id ?? user.googleId;
      user.authProvider = user.authProvider === 'local' ? 'both' : user.authProvider;
      user.emailVerified = true;
      if (!user.avatarUrl && profile.picture) user.avatarUrl = profile.picture;
      await user.save();
    }

    if (tokens.refresh_token) {
      await saveGoogleConnection(user, tokens, { email, name: profile.name });
    } else {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            'google.connected': true,
            'google.email': email,
            'google.scopes': (tokens.scope ?? GMAIL_READ_SCOPES.join(' ')).split(' '),
            'google.connectedAt': new Date(),
          },
        },
      );
    }

    const accessToken = signAccessToken(user);
    const { token: refreshToken, jti } = signRefreshToken(String(user._id));
    await User.updateOne(
      { _id: user._id },
      {
        $push: {
          sessions: {
            $each: [
              {
                tokenHash: hashToken(jti),
                userAgent: req.get('user-agent') ?? '',
                ip: req.ip,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * 86_400_000),
              },
            ],
            $slice: -8,
          },
        },
        $set: { lastLoginAt: new Date() },
      },
    );
    setAuthCookies(res, accessToken, refreshToken);
    return res.redirect(`${clientBase}/dashboard?welcome=1`);
  } catch (err: any) {
    logger.error('Google sign-in callback failed', err?.message);
    return failRedirect(res, '/login', err?.message ?? 'Google sign-in failed.');
  }
});

/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Gmail connection Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */

export const startGmailConnect = asyncHandler(async (req: Request, res: Response) => {
  if (!features.gmail) {
    throw ApiError.notConfigured(
      'Google is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env, enable the Gmail API in Google Cloud, then restart the API.',
      { envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] },
    );
  }
  const wantsSend = req.query.mode === 'send';
  const scopes = wantsSend ? [...GMAIL_READ_SCOPES, GMAIL_SEND_SCOPE] : GMAIL_READ_SCOPES;
  const state = createState(res, wantsSend ? 'gmail_send' : 'gmail_read', req.user!.id);
  const url = buildConsentUrl({ scopes, state, loginHint: (await User.findById(req.user!.id))?.google?.email ?? undefined });
  return res.json({ success: true, data: { url, scopes } });
});

export const gmailOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) return failRedirect(res, '/settings', `Google connection cancelled (${error}).`);
  if (!code) return failRedirect(res, '/settings', 'Google did not return an authorization code.');
  try {
    const payload = verifyState(req, res, state);
    if (!payload.userId) return failRedirect(res, '/settings', 'This connection link is no longer valid. Start again from Settings.');
    const user = await User.findById(payload.userId);
    if (!user) return failRedirect(res, '/settings', 'Account not found.');

    const { tokens, profile } = await exchangeCode(code);
    if (!tokens.refresh_token) {
      return failRedirect(
        res,
        '/settings',
        'Google did not return a refresh token. Remove KYNOV from your Google account permissions and connect again.',
      );
    }
    await saveGoogleConnection(user, tokens, { email: profile.email ?? user.google.email, name: profile.name });
    await notify({
      userId: String(user._id),
      type: 'system',
      title: 'Gmail connected',
      body: `${profile.email ?? 'Your Google account'} is linked. Reading is enabled; sending requires the extra permission.`,
      link: '/gmail',
    });
    return res.redirect(`${clientBase}/settings?gmail=connected`);
  } catch (err: any) {
    logger.error('Gmail OAuth callback failed', err?.message);
    return failRedirect(res, '/settings', err?.message ?? 'Could not connect Gmail.');
  }
});
