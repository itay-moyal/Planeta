import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createPlanterHandler, listPlantersHandler } from '../controllers/planter.controller.js';

const router = Router();
router.use(requireAuth);
router.post('/', createPlanterHandler);
router.get('/', listPlantersHandler);

export default router;
