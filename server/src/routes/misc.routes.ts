import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { preferencesSchema } from '../validators/schemas';
import { get as getPreferences, update as updatePreferences } from '../controllers/preferences.controller';
import { list as listNotifications, markAllRead, markRead, remove as removeNotification } from '../controllers/notifications.controller';
import { ok } from '../utils/http';
import { publicFeatureFlags } from '../config/features';
import { idParam } from '../validators/schemas';

export const preferencesRouter = Router();
preferencesRouter.use(requireAuth);
preferencesRouter.get('/', getPreferences);
preferencesRouter.put('/', validate({ body: preferencesSchema }), updatePreferences);

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
notificationsRouter.get('/', listNotifications);
notificationsRouter.post('/read-all', markAllRead);
notificationsRouter.post('/:id/read', validate({ params: idParam }), markRead);
notificationsRouter.delete('/:id', validate({ params: idParam }), removeNotification);

export const metaRouter = Router();
metaRouter.get('/features', (_req, res) => ok(res, publicFeatureFlags()));
