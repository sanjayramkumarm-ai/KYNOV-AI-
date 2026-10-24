import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadFields } from '../middleware/upload';
import { uploadLimiter } from '../middleware/rateLimit';
import {
  content,
  detail,
  emptyTrash,
  list,
  recent,
  reindex,
  remove,
  restore,
  storage,
  summarize,
  trash,
  update,
  upload,
} from '../controllers/files.controller';
import { fileListQuery, fileUpdateSchema, idParam } from '../validators/schemas';
import { create as createFolder, list as listFolders, remove as removeFolder, update as updateFolder } from '../controllers/folders.controller';
import { folderCreateSchema, folderUpdateSchema } from '../validators/schemas';

const router = Router();
router.use(requireAuth);

router.get('/', validate({ query: fileListQuery }), list);
router.get('/recent', recent);
router.get('/storage', storage);
router.get('/trash', trash);
router.delete('/trash', emptyTrash);
router.post('/', uploadLimiter, uploadFields, upload);
router.post('/bulk', uploadLimiter, uploadFields, upload);
router.post('/upload', uploadLimiter, uploadFields, upload);

router.get('/:id', validate({ params: idParam }), detail);
router.get('/:id/content', validate({ params: idParam }), content);
router.patch('/:id', validate({ params: idParam, body: fileUpdateSchema }), update);
router.post('/:id/restore', validate({ params: idParam }), restore);
router.post('/:id/reindex', validate({ params: idParam }), reindex);
router.post('/:id/summarize', validate({ params: idParam }), summarize);
router.delete('/:id', validate({ params: idParam }), remove);

/* Folder routes live under /api/folders but are defined here for cohesion */
export const folderRouter = Router();
folderRouter.use(requireAuth);
folderRouter.get('/', listFolders);
folderRouter.post('/', validate({ body: folderCreateSchema }), createFolder);
folderRouter.patch('/:id', validate({ params: idParam, body: folderUpdateSchema }), updateFolder);
folderRouter.delete('/:id', validate({ params: idParam }), removeFolder);

export default router;
