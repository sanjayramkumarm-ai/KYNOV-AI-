import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const json = (message: string) => ({
  success: false,
  error: { code: 'RATE_LIMITED', message },
});

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many requests. Please slow down and try again shortly.'),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: json('Too many authentication attempts. Try again in a few minutes.'),
});

export const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('You are sending messages very quickly. Pause for a moment.'),
});

export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Upload limit reached for this minute. Please retry shortly.'),
});
