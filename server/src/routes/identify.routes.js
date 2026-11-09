import { Router } from 'express';
import { identifyLimiter } from '../middleware/rateLimit.js';
import { uploadImage } from '../middleware/upload.js';
import { identify } from '../controllers/identify.controller.js';

const router = Router();
// Order matters: rate limit first, then parse the upload, then the controller.
router.post('/', identifyLimiter, uploadImage, identify);

export default router;
