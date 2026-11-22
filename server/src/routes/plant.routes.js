import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createPlantHandler, deletePlantHandler, generateCareHandler, getCareHandler, listPlantsHandler, updatePlantHandler,
} from '../controllers/plant.controller.js';

const router = Router();
router.use(requireAuth);
router.post('/', createPlantHandler);
router.get('/', listPlantsHandler);
router.get('/:id/care', getCareHandler);
router.post('/:id/care', generateCareHandler);
router.patch('/:id', updatePlantHandler);
router.delete('/:id', deletePlantHandler);

export default router;
