import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

let memoryServer: { getUri: () => string; stop: () => Promise<boolean> } | null = null;

/**
 * Connects to MongoDB Atlas when MONGODB_URI is provided.
 * Otherwise (development only) boots an ephemeral MongoDB via
 * mongodb-memory-server so the project is runnable with zero credentials.
 * Production refuses to start without MONGODB_URI.
 */
export async function connectDatabase(): Promise<{ uri: string; ephemeral: boolean }> {
  mongoose.set('strictQuery', true);
  // NOTE: we deliberately do NOT enable the global `sanitizeFilter` option: it
  // rewrites every operator object (e.g. { $gte }) into an $eq wrapper and
  // breaks legitimate range queries. Injection is prevented instead by
  // validating every request with Zod and by never passing raw req.query
  // objects into a Mongo filter (see controllers).

  let uri = env.MONGODB_URI;
  let ephemeral = false;

  if (!uri) {
    if (env.isProd) {
      throw new Error(
        '[db] MONGODB_URI is required in production. Create a free cluster at https://cloud.mongodb.com and paste the SRV string into .env',
      );
    }
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create({ instance: { dbName: env.MONGODB_DB } });
    memoryServer = server as unknown as typeof memoryServer;
    uri = server.getUri(env.MONGODB_DB);
    ephemeral = true;
    logger.warn(
      'MONGODB_URI is empty — started an ephemeral in-memory MongoDB. Data is lost on restart. Set MONGODB_URI in server/.env to use MongoDB Atlas.',
    );
  }

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', err));

  await mongoose.connect(uri, {
    dbName: env.MONGODB_DB,
    serverSelectionTimeoutMS: 15_000,
    maxPoolSize: 20,
    autoIndex: true,
  });

  return { uri: uri.replace(/\/\/[^@]*@/, '//***:***@'), ephemeral };
}

export async function disconnectDatabase() {
  await mongoose.connection.close().catch(() => undefined);
  if (memoryServer) await memoryServer.stop().catch(() => undefined);
}

export const isDbReady = () => mongoose.connection.readyState === 1;
