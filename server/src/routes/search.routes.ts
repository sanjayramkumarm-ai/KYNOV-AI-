import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { searchSchema } from '../validators/schemas';
import { emailsOnly, filesOnly, semantic, unified } from '../controllers/search.controller';

const router = Router();
router.use(requireAuth);

router.get('/', validate({ query: searchSchema }), unified);
router.get('/files', validate({ query: searchSchema }), filesOnly);
router.get('/emails', validate({ query: searchSchema }), emailsOnly);
router.get('/semantic', validate({ query: searchSchema }), semantic);

export default router;
