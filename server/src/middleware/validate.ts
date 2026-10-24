import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

interface Parts {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Zod validation for request parts. Parsed values replace the originals so
 * controllers always operate on coerced, whitelisted data (never raw input).
 */
export function validate(parts: Parts) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (parts.body) req.body = parts.body.parse(req.body);
      if (parts.query) req.query = parts.query.parse(req.query) as typeof req.query;
      if (parts.params) req.params = parts.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      next(err);
    }
  };
}
