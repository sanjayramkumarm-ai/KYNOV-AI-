import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { aiLimiter } from '../middleware/rateLimit';
import { command, parseOnly } from '../controllers/voice.controller';
import { voiceCommandSchema } from '../validators/schemas';

const router = Router();
router.use(requireAuth);

router.post('/command', aiLimiter, validate({ body: voiceCommandSchema }), command);
router.get('/parse', parseOnly);

export default router;
