import { Router } from 'express';
import authRoutes from './auth.routes';
import filesRoutes, { folderRouter } from './files.routes';
import chatRoutes from './chat.routes';
import searchRoutes from './search.routes';
import gmailRoutes from './gmail.routes';
import tasksRoutes from './tasks.routes';
import voiceRoutes from './voice.routes';
import { metaRouter, notificationsRouter, preferencesRouter } from './misc.routes';
import { config } from '../controllers/health.controller';

const router = Router();

router.use('/auth', authRoutes);
router.use('/files', filesRoutes);
router.use('/folders', folderRouter);
router.use('/chat', chatRoutes);
router.use('/search', searchRoutes);
router.use('/gmail', gmailRoutes);
router.use('/tasks', tasksRoutes);
router.use('/voice', voiceRoutes);
router.use('/notifications', notificationsRouter);
router.use('/preferences', preferencesRouter);
router.use('/meta', metaRouter);
router.get('/config', config);

export default router;
