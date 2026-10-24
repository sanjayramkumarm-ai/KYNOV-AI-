import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import {
  changePassword,
  deleteAccount,
  login,
  logout,
  me,
  refresh,
  signup,
  updateProfile,
} from '../controllers/auth.controller';
import { googleSignInCallback, startGoogleSignIn } from '../controllers/google.controller';
import { changePasswordSchema, deleteAccountSchema, loginSchema, signupSchema, updateProfileSchema } from '../validators/schemas';

const router = Router();

router.post('/signup', authLimiter, validate({ body: signupSchema }), signup);
router.post('/login', authLimiter, validate({ body: loginSchema }), login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, validate({ body: updateProfileSchema }), updateProfile);
router.post('/change-password', requireAuth, authLimiter, validate({ body: changePasswordSchema }), changePassword);
router.delete('/me', requireAuth, validate({ body: deleteAccountSchema }), deleteAccount);

router.get('/google/start', startGoogleSignIn);
router.get('/google/callback', googleSignInCallback);

export default router;
