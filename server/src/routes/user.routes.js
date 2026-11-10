import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { updateMeHandler } from '../controllers/user.controller.js';

const router = Router();
router.patch('/', requireAuth, updateMeHandler);

export default router;
