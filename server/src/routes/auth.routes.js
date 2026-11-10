import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { loginHandler, logoutHandler, meHandler, signupHandler } from '../controllers/auth.controller.js';

const router = Router();
router.post('/signup', authLimiter, signupHandler);
router.post('/login', authLimiter, loginHandler);
router.post('/logout', logoutHandler);
router.get('/me', requireAuth, meHandler);

export default router;
