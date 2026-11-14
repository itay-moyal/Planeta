import { Router } from 'express';
import { identifyLimiter, visitorDailyLimiter } from '../middleware/rateLimit.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { uploadImage } from '../middleware/upload.js';
import { claim, identify } from '../controllers/identify.controller.js';

const router = Router();
// Order matters: find out who it is, rate limit, then parse the upload, then the controller.
router.post('/', optionalAuth, identifyLimiter, visitorDailyLimiter, uploadImage, identify);
router.post('/claim', requireAuth, claim);

export default router;
