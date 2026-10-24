import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { aiLimiter } from '../middleware/rateLimit';
import {
  attachment,
  cachedList,
  capabilities,
  disconnect,
  draftReply,
  emailTasks,
  inbox,
  message,
  search,
  send,
  status,
  summarizeEmail,
} from '../controllers/gmail.controller';
import { gmailOAuthCallback, startGmailConnect } from '../controllers/google.controller';
import { draftReplySchema, gmailListQuery, gmailSendSchema } from '../validators/schemas';

const router = Router();

/* OAuth callback must be reachable without a bearer token (top-level redirect) */
router.get('/oauth/callback', gmailOAuthCallback);

router.use(requireAuth);
router.get('/status', status);
router.get('/capabilities', capabilities);
router.get('/oauth/start', startGmailConnect);
router.post('/disconnect', disconnect);
router.get('/inbox', validate({ query: gmailListQuery }), inbox);
router.get('/search', search);
router.get('/cached', cachedList);
router.get('/messages/:id', message);
router.get('/messages/:id/attachment/:attachmentId', attachment);
router.get('/messages/:id/summary', summarizeEmail);
router.get('/messages/:id/tasks', aiLimiter, emailTasks);
router.post('/messages/:id/draft-reply', aiLimiter, validate({ body: draftReplySchema }), draftReply);
router.post('/send', aiLimiter, validate({ body: gmailSendSchema }), send);

export default router;
