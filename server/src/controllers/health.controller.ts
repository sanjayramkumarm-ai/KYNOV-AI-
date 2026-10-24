import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { publicFeatureFlags } from '../config/features';
import { ok } from '../utils/http';
import { storageStatus } from '../services/storage';
import { ragStatus } from '../services/rag';

const startedAt = Date.now();

export function health(_req: Request, res: Response) {
  const dbState = mongoose.connection.readyState;
  const dbOk = dbState === 1;
  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    data: {
      status: dbOk ? 'ok' : 'degraded',
      service: 'kynov-ai-api',
      version: '1.0.0',
      env: env.NODE_ENV,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      database: { connected: dbOk, name: mongoose.connection.name ?? null },
      features: publicFeatureFlags(),
      storage: storageStatus(),
      rag: ragStatus(),
      timestamp: new Date().toISOString(),
    },
  });
}

export const config = async (_req: Request, res: Response) => {
  return ok(res, {
    features: publicFeatureFlags(),
    storage: storageStatus(),
    rag: ragStatus(),
    auth: { sessionCookies: true, providers: ['password', 'google'] },
  });
};
