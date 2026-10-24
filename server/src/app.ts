import express, { type Express } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env';
import { apiLimiter } from './middleware/rateLimit';
import { csrfGuard } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error';
import { health } from './controllers/health.controller';
import routes from './routes';
import { logger } from './utils/logger';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'self'"],
          'object-src': ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin/non-browser requests have no Origin header.
        if (!origin) return callback(null, true);
        if (env.CLIENT_ORIGINS.includes(origin) || env.CLIENT_ORIGINS.includes('*')) return callback(null, true);
        logger.warn(`Blocked CORS origin: ${origin}`);
        return callback(new Error('Origin not allowed by CORS policy'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge: 86_400,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(csrfGuard);

  if (!env.isProd) {
    morgan.token('user', (req) => (req as express.Request).user?.id ?? 'anon');
    app.use(morgan(':method :url :status :response-time[1]ms user=:user'));
  }

  app.get('/api/health', health);
  app.use('/api', apiLimiter, routes);

  // Optional single-service deployment: serve the built SPA when present.
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders: (res, filePath) => {
          if (/\.(js|css|woff2?|png|jpg|svg)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get(/^\/(?!api).*/, (req, res, next) => {
      // A missing hashed asset must 404, never return HTML: a stale cached
      // index.html would otherwise leave the app rendering a blank page.
      const last = req.path.split('/').pop() ?? '';
      if (/\.[a-z0-9]{2,8}$/i.test(last)) return next();
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
    logger.info(`Serving client build from ${clientDist}`);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
