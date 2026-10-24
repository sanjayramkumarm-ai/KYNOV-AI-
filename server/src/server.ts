import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/db';
import { publicFeatureFlags } from './config/features';
import { logger } from './utils/logger';

async function main() {
  const db = await connectDatabase();
  const app = createApp();

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    const flags = publicFeatureFlags();
    logger.info(`KYNOV AI API listening on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
    logger.info(
      `capabilities → ai:${flags.ai ? 'on' : 'off'} gmail:${flags.gmail ? 'on' : 'off'} storage:${flags.storageDriver} vector:${flags.vectorSearch} db:${db.ephemeral ? 'in-memory' : 'atlas'}`,
    );
    if (!flags.ai) logger.warn('AI provider not configured — chat will return retrieval-only results. Set AI_API_KEY in server/.env.');
    if (!flags.gmail) logger.warn('Google OAuth not configured — Gmail features disabled. Set GOOGLE_CLIENT_ID/SECRET in server/.env.');
  });

  server.headersTimeout = 65_000;
  server.requestTimeout = 120_000;

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 12_000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', reason));
  process.on('uncaughtException', (err) => logger.error('Uncaught exception', err));
}

main().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
