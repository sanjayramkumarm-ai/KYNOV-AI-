import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { aiLimiter } from '../middleware/rateLimit';
import {
  ask,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  sendMessageHandler,
  updateConversation,
} from '../controllers/chat.controller';
import { askSchema, chatSendSchema, conversationCreateSchema, conversationUpdateSchema, idParam } from '../validators/schemas';

const router = Router();
router.use(requireAuth);

router.get('/conversations', listConversations);
router.post('/conversations', validate({ body: conversationCreateSchema }), createConversation);
router.get('/conversations/:id', validate({ params: idParam }), getConversation);
router.patch('/conversations/:id', validate({ params: idParam, body: conversationUpdateSchema }), updateConversation);
router.delete('/conversations/:id', validate({ params: idParam }), deleteConversation);

router.post('/message', aiLimiter, validate({ body: chatSendSchema }), sendMessageHandler);
router.post('/ask', aiLimiter, validate({ body: askSchema }), ask);

export default router;
