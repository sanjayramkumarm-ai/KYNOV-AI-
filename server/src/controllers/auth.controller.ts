import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { Conversation, Folder, KynovFile, Message, Notification, Task, User, UserPreference } from '../models';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/http';
import { logger } from '../utils/logger';
import { notify } from '../services/notifications';
import {
  clearAuthCookies,
  hashToken,
  REFRESH_COOKIE,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../services/authTokens';
import { features, publicFeatureFlags } from '../config/features';
import { getStorage } from '../services/storage';
import { deleteFilePermanently } from '../services/files';
import { revokeGoogle } from '../services/google';

const BCRYPT_ROUNDS = 12;
const MAX_SESSIONS = 8;

async function issueSession(res: Response, user: { _id: any; email: string; role: 'user' | 'admin' }, req: Request) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, jti } = signRefreshToken(String(user._id));
  const expiresAt = new Date(Date.now() + 30 * 86_400_000);

  await User.updateOne(
    { _id: user._id },
    {
      $push: {
        sessions: {
          $each: [{ tokenHash: hashToken(jti), userAgent: req.get('user-agent') ?? '', ip: req.ip, createdAt: new Date(), expiresAt }],
          $slice: -MAX_SESSIONS,
        },
      },
      $set: { lastLoginAt: new Date() },
    },
  );

  setAuthCookies(res, accessToken, refreshToken);
  return { accessToken, refreshToken };
}

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body as { name: string; email: string; password: string };

  const existing = await User.exists({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists. Try signing in instead.');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ name, email, passwordHash, authProvider: 'local', emailVerified: false });

  await UserPreference.create({ user: user._id });
  await Folder.create({ user: user._id, name: 'Documents', parent: null, path: '/Documents' });
  await notify({
    userId: String(user._id),
    type: 'system',
    title: 'Welcome to KYNOV AI',
    body: 'Upload your first document to unlock AI search across your workspace.',
    link: '/files',
  });

  await issueSession(res, user, req);
  logger.info(`New account created: ${user.email}`);
  return ok(res, { user, preferences: await UserPreference.findOne({ user: user._id }) }, 201);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await User.findOne({ email }).select('+passwordHash');
  // Constant-ish response time whether or not the account exists.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const valid = await bcrypt.compare(password, hash);
  if (!user || !user.passwordHash || !valid) {
    throw ApiError.unauthorized('Email or password is incorrect.');
  }
  await issueSession(res, user, req);
  return ok(res, { user, preferences: await UserPreference.findOne({ user: user._id }) });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No session found.');
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Your session expired. Please sign in again.');
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Account not found.');
  }
  const session = user.sessions.find((s) => s.tokenHash === hashToken(payload.jti));
  if (!session) throw ApiError.unauthorized('This session was signed out. Please sign in again.');

  // Rotate the refresh token on every use.
  await User.updateOne({ _id: user._id }, { $pull: { sessions: { tokenHash: hashToken(payload.jti) } } });
  await issueSession(res, user, req);
  return ok(res, { user, preferences: await UserPreference.findOne({ user: user._id }) });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await User.updateOne({ _id: payload.sub }, { $pull: { sessions: { tokenHash: hashToken(payload.jti) } } });
    } catch {
      /* already invalid */
    }
  }
  clearAuthCookies(res);
  return ok(res, { message: 'Signed out.' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.unauthorized('Account not found.');
  const preferences = await UserPreference.findOneAndUpdate(
    { user: user._id },
    { $setOnInsert: { user: user._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return ok(res, {
    user,
    preferences,
    features: publicFeatureFlags(),
    google: {
      configured: features.gmail,
      connected: Boolean(user.google?.connected),
      email: user.google?.email ?? null,
      scopes: user.google?.scopes ?? [],
      canSend: (user.google?.scopes ?? []).includes('https://www.googleapis.com/auth/gmail.send'),
    },
  });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name, avatarUrl } = req.body as { name?: string; avatarUrl?: string | null };
  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { $set: { ...(name ? { name } : {}), ...(avatarUrl !== undefined ? { avatarUrl } : {}) } },
    { new: true, runValidators: true },
  );
  if (!user) throw ApiError.notFound('Account not found.');
  return ok(res, { user });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found.');
  if (!user.passwordHash) {
    throw ApiError.badRequest('This account signs in with Google. Set a password from the Google account instead.');
  }
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw ApiError.unauthorized('Current password is incorrect.');
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.sessions = []; // sign out other devices
  await user.save();
  clearAuthCookies(res);
  return ok(res, { message: 'Password updated. Please sign in again with your new password.' });
});

/** Irreversible: removes files from object storage, embeddings and all records. */
export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const { confirm, password } = req.body as { confirm: string; password?: string };
  if (confirm !== 'DELETE') throw ApiError.badRequest('Type DELETE to confirm account deletion.');

  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found.');
  if (user.passwordHash) {
    if (!password) throw ApiError.badRequest('Enter your password to delete the account.');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw ApiError.unauthorized('Password is incorrect.');
  }

  const files = await KynovFile.find({ user: user._id }).lean();
  for (const file of files) {
    await deleteFilePermanently(String(user._id), String(file._id)).catch((err) =>
      logger.warn(`Could not purge file ${file._id} during account deletion`, err),
    );
  }
  await revokeGoogle(String(user._id)).catch(() => undefined);

  await Promise.all([
    Conversation.deleteMany({ user: user._id }),
    Message.deleteMany({ user: user._id }),
    Folder.deleteMany({ user: user._id }),
    Task.deleteMany({ user: user._id }),
    Notification.deleteMany({ user: user._id }),
    UserPreference.deleteOne({ user: user._id }),
  ]);
  await user.deleteOne();
  clearAuthCookies(res);
  logger.info(`Account deleted: ${user.email}`);
  return ok(res, { message: 'Your account and all associated data have been deleted.' });
});

export const storageStatusHandler = asyncHandler(async (_req: Request, res: Response) => {
  const storage = getStorage();
  return ok(res, { driver: storage.driver });
});
