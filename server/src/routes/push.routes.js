import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pushTestLimiter } from '../middleware/rateLimit.js';
import { statusHandler, subscribeHandler, testHandler, unsubscribeHandler } from '../controllers/push.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/status', statusHandler);
router.post('/subscribe', subscribeHandler);
router.delete('/subscribe', unsubscribeHandler);
router.post('/test', pushTestLimiter, testHandler);

export default router;
