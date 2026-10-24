import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { features } from '../config/features';
import { User, type UserDoc } from '../models';
import { ApiError } from '../utils/ApiError';
import { decryptSecret, encryptSecret } from '../utils/crypto';
import { logger } from '../utils/logger';

export const GMAIL_READ_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const SIGNIN_SCOPES = ['openid', 'email', 'profile'];

export function assertGoogleConfigured() {
  if (!features.gmail) {
    throw ApiError.notConfigured(
      'Google is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env (Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID), then restart the API.',
      { envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] },
    );
  }
}

export function createOAuthClient(redirectUri = env.GOOGLE_REDIRECT_URI): OAuth2Client {
  assertGoogleConfigured();
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
}

export function buildConsentUrl(opts: { scopes: string[]; state: string; redirectUri?: string; loginHint?: string }) {
  const client = createOAuthClient(opts.redirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: opts.scopes,
    state: opts.state,
    include_granted_scopes: true,
    ...(opts.loginHint ? { login_hint: opts.loginHint } : {}),
  });
}

/**
 * Returns an OAuth2 client bound to the user's stored (encrypted) refresh token.
 * Refreshed access tokens are persisted, never returned to the browser.
 */
export async function getAuthorizedClient(userId: string): Promise<OAuth2Client> {
  assertGoogleConfigured();
  const user = await User.findById(userId).select('+google.accessToken +google.refreshToken');
  if (!user?.google?.connected || !user.google.refreshToken) {
    throw ApiError.forbidden(
      'This Google account is not connected (or the connection expired). Connect Gmail from Settings → Integrations.',
    );
  }
  const refreshToken = decryptSecret(user.google.refreshToken);
  const client = createOAuthClient();
  client.setCredentials({
    refresh_token: refreshToken,
    access_token: user.google.accessToken ? decryptSecret(user.google.accessToken) : undefined,
    expiry_date: user.google.expiryDate,
    scope: user.google.scopes.join(' '),
  });

  client.on('tokens', async (tokens) => {
    try {
      const update: Record<string, unknown> = { 'google.lastSyncedAt': new Date() };
      if (tokens.access_token) update['google.accessToken'] = encryptSecret(tokens.access_token);
      if (tokens.expiry_date) update['google.expiryDate'] = tokens.expiry_date;
      if (tokens.refresh_token) update['google.refreshToken'] = encryptSecret(tokens.refresh_token);
      if (tokens.scope) {
        const merged = new Set([...user.google.scopes, ...tokens.scope.split(' ')]);
        update['google.scopes'] = [...merged];
      }
      await User.updateOne({ _id: userId }, { $set: update });
    } catch (err) {
      logger.error('Failed to persist refreshed Google tokens', err);
    }
  });

  return client;
}

export async function exchangeCode(code: string, redirectUri = env.GOOGLE_REDIRECT_URI) {
  const client = createOAuthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token && !tokens.refresh_token) {
    throw ApiError.integration('Google did not return usable tokens. Please try connecting again.');
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  let profile: { email?: string; name?: string; picture?: string; id?: string } = {};
  try {
    const me = await oauth2.userinfo.get();
    profile = {
      email: me.data.email ?? undefined,
      name: me.data.name ?? undefined,
      picture: me.data.picture ?? undefined,
      id: me.data.id ?? undefined,
    };
  } catch (err) {
    logger.warn('Could not read Google profile after token exchange', err);
  }
  return { tokens, profile, client };
}

export async function saveGoogleConnection(
  user: UserDoc,
  tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null; scope?: string | null },
  profile: { email?: string; name?: string },
) {
  const scopes = tokens.scope ? tokens.scope.split(' ') : [...GMAIL_READ_SCOPES];
  user.google = {
    connected: true,
    email: profile.email ?? user.google.email,
    name: profile.name ?? user.google.name,
    scopes,
    accessToken: tokens.access_token ? encryptSecret(tokens.access_token) : user.google.accessToken,
    refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : user.google.refreshToken,
    expiryDate: tokens.expiry_date ?? undefined,
    connectedAt: user.google.connectedAt ?? new Date(),
    lastSyncedAt: new Date(),
  };
  await user.save();
  return user.google;
}

/** Revoke the grant at Google and wipe every stored token. */
export async function revokeGoogle(userId: string) {
  const user = await User.findById(userId).select('+google.accessToken +google.refreshToken');
  if (!user) throw ApiError.notFound('Account not found.');
  const token = user.google?.refreshToken ? decryptSecret(user.google.refreshToken) : null;
  let revoked = false;
  if (token) {
    try {
      const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      revoked = res.ok;
    } catch (err) {
      logger.warn('Google token revocation request failed', err);
    }
  }
  user.google = { connected: false, scopes: [] };
  await user.save();
  return { revoked };
}

export function googleStatus(user: UserDoc) {
  const scopes = user.google?.scopes ?? [];
  return {
    configured: features.gmail,
    connected: Boolean(user.google?.connected),
    email: user.google?.email ?? null,
    name: user.google?.name ?? null,
    scopes,
    canSend: scopes.includes(GMAIL_SEND_SCOPE),
    canRead: scopes.includes(GMAIL_READ_SCOPES[0]),
    connectedAt: user.google?.connectedAt ?? null,
    lastSyncedAt: user.google?.lastSyncedAt ?? null,
  };
}
