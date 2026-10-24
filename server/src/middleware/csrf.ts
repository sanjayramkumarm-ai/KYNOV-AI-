import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie-authenticated state changes must carry a custom header. Browsers
 * cannot set custom headers from plain HTML forms or cross-origin <img>/<form>
 * attacks, and combined with SameSite=Lax cookies this blocks CSRF.
 * Bearer-token clients (API integrations) are exempt.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const usingBearer = req.headers.authorization?.startsWith('Bearer ');
  if (usingBearer) return next();
  const hasCookies = Boolean((req as Request & { cookies?: Record<string, string> }).cookies?.kynov_at);
  if (!hasCookies) return next();
  if (req.get('x-requested-with') !== 'kynov-web') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Missing CSRF header. The KYNOV client sends X-Requested-With automatically.' },
    });
  }
  next();
}
