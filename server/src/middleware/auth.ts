import type { NextFunction, Request, Response } from 'express';
import { User } from '../models';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { ACCESS_COOKIE, verifyAccessToken } from '../services/authTokens';

export interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[ACCESS_COOKIE];
  return cookie ?? null;
}

/** Every user-scoped query must filter by req.user.id — enforced in controllers. */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Sign in to continue.');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Your session has expired. Refreshing…');
  }

  const exists = await User.exists({ _id: payload.sub });
  if (!exists) throw ApiError.unauthorized('Account no longer exists.');

  req.user = { id: payload.sub, email: payload.email, role: payload.role };
  next();
});

export const optionalAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      /* anonymous */
    }
  }
  next();
});

export function requireRole(role: 'admin') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== role) return next(ApiError.forbidden('Administrator access required.'));
    next();
  };
}

/** Small helper used by controllers to guarantee ownership filters. */
export function ownerFilter(req: Request, extra: Record<string, unknown> = {}) {
  if (!req.user) throw ApiError.unauthorized();
  return { user: req.user.id, ...extra };
}
