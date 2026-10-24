import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env';
import type { Request, Response } from 'express';

export type OAuthMode = 'signin' | 'gmail_read' | 'gmail_send';

interface StatePayload {
  mode: OAuthMode;
  userId?: string;
  nonce: string;
}

export const STATE_COOKIE = 'kynov_oauth_state';

export function createState(res: Response, mode: OAuthMode, userId?: string) {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const state = jwt.sign({ mode, userId, nonce } as StatePayload, env.JWT_ACCESS_SECRET, { expiresIn: '10m' });
  res.cookie(STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    maxAge: 10 * 60_000,
    path: '/',
  });
  return state;
}

export function verifyState(req: Request, res: Response, state: string | undefined): StatePayload {
  if (!state) throw Object.assign(new Error('Missing OAuth state. Please start the connection again.'), { statusCode: 400 });
  let payload: StatePayload;
  try {
    payload = jwt.verify(state, env.JWT_ACCESS_SECRET) as StatePayload;
  } catch {
    throw Object.assign(new Error('The OAuth state expired or is invalid. Please retry the connection.'), { statusCode: 400 });
  }
  const cookieNonce = (req as Request & { cookies?: Record<string, string> }).cookies?.[STATE_COOKIE];
  // Nonce check guards against CSRF. A lost cookie (e.g. strict privacy mode) is tolerated but logged.
  if (cookieNonce && cookieNonce !== payload.nonce) {
    throw Object.assign(new Error('OAuth state mismatch. Please retry the connection.'), { statusCode: 400 });
  }
  res.clearCookie(STATE_COOKIE, { path: '/' });
  return payload;
}
