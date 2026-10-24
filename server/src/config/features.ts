import { env } from './env';

/**
 * Feature capability matrix. The API exposes this to the client so the UI can
 * render an honest "not configured" state instead of pretending an integration
 * works. Nothing here is ever hard-coded to `true`.
 */
export const features = {
  /** LLM chat + summaries require an OpenAI-compatible provider key. */
  get ai() {
    return Boolean(env.AI_API_KEY);
  },
  /** Remote embeddings; the local deterministic embedder always works. */
  get remoteEmbeddings() {
    return Boolean(env.AI_API_KEY);
  },
  get embeddingStrategy(): 'remote' | 'local' {
    return env.AI_API_KEY ? 'remote' : 'local';
  },
  get gmail() {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  },
  get googleSignIn() {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  },
  get s3() {
    return env.STORAGE_DRIVER === 's3' && Boolean(env.S3_BUCKET && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
  },
  get storageDriver() {
    return this.s3 ? 's3' : 'local';
  },
  get vectorIndex() {
    return Boolean(env.MONGODB_URI && env.MONGODB_VECTOR_INDEX);
  },
} as const;

export function publicFeatureFlags() {
  return {
    ai: features.ai,
    embeddings: features.embeddingStrategy,
    gmail: features.gmail,
    googleSignIn: features.googleSignIn,
    storageDriver: features.storageDriver,
    vectorSearch: features.vectorIndex ? 'atlas' : 'in-process',
    chatModel: features.ai ? env.AI_CHAT_MODEL : null,
    maxFileSizeMb: env.MAX_FILE_SIZE_MB,
  };
}

export function requireFeature(flag: keyof typeof features, message: string) {
  // Accessor properties are booleans; anything else (e.g. storageDriver) is truthy-checked.
  const value = features[flag] as unknown;
  if (!value || value === 'local') {
    const err: any = new Error(message);
    err.statusCode = 503;
    err.code = 'FEATURE_NOT_CONFIGURED';
    throw err;
  }
}
