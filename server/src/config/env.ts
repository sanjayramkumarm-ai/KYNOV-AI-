import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import crypto from 'node:crypto';

/**
 * Load order: server/.env  →  repo .env  →  process.env (highest priority)
 * dotenv never overrides already-defined variables.
 */
const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
];
for (const file of candidates) {
  if (fs.existsSync(file)) dotenv.config({ path: file });
}

const str = (key: string, fallback = ''): string => {
  const v = process.env[key];
  return v === undefined || v === null ? fallback : String(v).trim();
};
const num = (key: string, fallback: number): number => {
  const n = Number(str(key, ''));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const bool = (key: string, fallback = false): boolean => {
  const v = str(key, '').toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v);
};

const NODE_ENV = str('NODE_ENV', 'development');
const isProd = NODE_ENV === 'production';

/** A generated secret is only acceptable for local development. */
function devSecret(name: string): string {
  if (isProd) {
    throw new Error(
      `[env] ${name} must be set in production. Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
    );
  }
  // Stable per-process-pair secret so dev sessions survive a restart of the same checkout.
  const seed = crypto.createHash('sha256').update(`${name}:${process.cwd()}`).digest('hex');
  // eslint-disable-next-line no-console
  console.warn(`[env] ${name} not set — using an ephemeral development secret. Set it in .env for stable sessions.`);
  return seed;
}

export const env = {
  NODE_ENV,
  isProd,
  PORT: num('PORT', 4000),
  CLIENT_ORIGINS: str('CLIENT_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  MONGODB_URI: str('MONGODB_URI'),
  MONGODB_DB: str('MONGODB_DB', 'kynov'),
  MONGODB_VECTOR_INDEX: str('MONGODB_VECTOR_INDEX'),

  JWT_ACCESS_SECRET: str('JWT_ACCESS_SECRET') || devSecret('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: str('JWT_REFRESH_SECRET') || devSecret('JWT_REFRESH_SECRET'),
  ACCESS_TOKEN_TTL: str('ACCESS_TOKEN_TTL', '30m'),
  REFRESH_TOKEN_TTL: str('REFRESH_TOKEN_TTL', '30d'),
  TOKEN_ENCRYPTION_KEY: str('TOKEN_ENCRYPTION_KEY'),
  COOKIE_SECURE: bool('COOKIE_SECURE', isProd),
  COOKIE_DOMAIN: str('COOKIE_DOMAIN') || undefined,

  GOOGLE_CLIENT_ID: str('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: str('GOOGLE_CLIENT_SECRET'),
  GOOGLE_REDIRECT_URI: str('GOOGLE_REDIRECT_URI', 'http://localhost:4000/api/gmail/oauth/callback'),
  GOOGLE_OAUTH_SUCCESS_REDIRECT: str('GOOGLE_OAUTH_SUCCESS_REDIRECT', 'http://localhost:5173/gmail'),

  STORAGE_DRIVER: (str('STORAGE_DRIVER', 'local').toLowerCase() as 'local' | 's3'),
  LOCAL_STORAGE_DIR: path.resolve(process.cwd(), str('LOCAL_STORAGE_DIR', './.data/storage')),
  MAX_FILE_SIZE_MB: num('MAX_FILE_SIZE_MB', 25),
  AWS_REGION: str('AWS_REGION', 'ap-south-1'),
  AWS_ACCESS_KEY_ID: str('AWS_ACCESS_KEY_ID'),
  AWS_SECRET_ACCESS_KEY: str('AWS_SECRET_ACCESS_KEY'),
  S3_BUCKET: str('S3_BUCKET'),
  S3_ENDPOINT: str('S3_ENDPOINT'),
  S3_FORCE_PATH_STYLE: bool('S3_FORCE_PATH_STYLE', false),

  AI_PROVIDER: str('AI_PROVIDER', 'openai'),
  AI_API_KEY: str('AI_API_KEY'),
  AI_BASE_URL: str('AI_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, ''),
  AI_CHAT_MODEL: str('AI_CHAT_MODEL', 'gpt-4o-mini'),
  AI_EMBEDDING_MODEL: str('AI_EMBEDDING_MODEL', 'text-embedding-3-small'),
  RAG_CHUNK_SIZE: num('RAG_CHUNK_SIZE', 1100),
  RAG_CHUNK_OVERLAP: num('RAG_CHUNK_OVERLAP', 180),
  RAG_TOP_K: num('RAG_TOP_K', 6),

  RATE_LIMIT_WINDOW_MS: num('RATE_LIMIT_WINDOW_MS', 60_000),
  RATE_LIMIT_MAX: num('RATE_LIMIT_MAX', 240),
  AUTH_RATE_LIMIT_MAX: num('AUTH_RATE_LIMIT_MAX', 20),

  /** Local deterministic embedding dimension (used when no AI provider is configured). */
  LOCAL_EMBEDDING_DIM: num('LOCAL_EMBEDDING_DIM', 384),
};

export type AppEnv = typeof env;
