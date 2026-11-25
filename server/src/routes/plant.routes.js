import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  answerWateringHandler, createPlantHandler, deletePlantHandler, generateCareHandler, getCareHandler, listDueHandler,
  listPlantsHandler, setIntervalHandler, updatePlantHandler,
} from '../controllers/plant.controller.js';

const router = Router();
router.use(requireAuth);
router.post('/', createPlantHandler);
router.get('/', listPlantsHandler);
router.get('/due', listDueHandler);
router.post('/:id/water', answerWateringHandler);
router.put('/:id/interval', setIntervalHandler);
router.get('/:id/care', getCareHandler);
router.post('/:id/care', generateCareHandler);
router.patch('/:id', updatePlantHandler);
router.delete('/:id', deletePlantHandler);

export default router;
