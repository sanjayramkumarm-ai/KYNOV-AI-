import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { ZodError } from 'zod';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
}

/** Centralised error handler — a single, predictable JSON error shape. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let code = 'INTERNAL';
  let message = 'Something went wrong on our side.';
  let details: unknown;

  if (err instanceof ApiError) {
    status = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed.';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err && typeof err === 'object') {
    const e = err as Record<string, any>;
    if (e.name === 'ValidationError' && e.errors) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'The submitted data is invalid.';
      details = Object.values(e.errors).map((x: any) => ({ path: x.path, message: x.message }));
    } else if (e.name === 'CastError') {
      status = 400;
      code = 'BAD_REQUEST';
      message = `Invalid value for ${e.path}.`;
    } else if (e.code === 11000) {
      status = 409;
      code = 'CONFLICT';
      message = 'That record already exists.';
      details = e.keyValue;
    } else if (e.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = `File exceeds the ${env.MAX_FILE_SIZE_MB} MB upload limit.`;
    } else if (e.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request body too large.';
    } else if (e.message) {
      message = env.isProd && status >= 500 ? 'Something went wrong on our side.' : e.message;
    }
  }

  if (status >= 500) logger.error(`${req.method} ${req.originalUrl} → ${status}`, err);

  res.status(status).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
}
