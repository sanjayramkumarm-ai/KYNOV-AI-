import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { Response } from 'express';
import { env } from '../config/env';

export interface AccessPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
  typ: 'access';
}
export interface RefreshPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
}

export const ACCESS_COOKIE = 'kynov_at';
export const REFRESH_COOKIE = 'kynov_rt';

export function signAccessToken(user: { _id: unknown; email: string; role: 'user' | 'admin' }) {
  const payload: AccessPayload = { sub: String(user._id), email: user.email, role: user.role, typ: 'access' };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'kynov-ai',
    audience: 'kynov-web',
  });
}

export function signRefreshToken(userId: string) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: userId, jti, typ: 'refresh' } as RefreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'kynov-ai',
    audience: 'kynov-web',
  });
  return { token, jti };
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'kynov-ai',
    audience: 'kynov-web',
  }) as AccessPayload;
  if (decoded.typ !== 'access') throw new Error('Invalid token type');
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: 'kynov-ai',
    audience: 'kynov-web',
  }) as RefreshPayload;
  if (decoded.typ !== 'refresh') throw new Error('Invalid token type');
  return decoded;
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const baseCookie = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
};

function ttlToMs(ttl: string, fallbackMs: number): number {
  const m = /^(\d+)\s*([smhd])$/i.exec(ttl.trim());
  if (!m) return fallbackMs;
  const value = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === 's' ? 1_000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return value * mult;
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...baseCookie, maxAge: ttlToMs(env.ACCESS_TOKEN_TTL, 30 * 60_000) });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...baseCookie, maxAge: ttlToMs(env.REFRESH_TOKEN_TTL, 30 * 86_400_000) });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, baseCookie);
  res.clearCookie(REFRESH_COOKIE, baseCookie);
}
