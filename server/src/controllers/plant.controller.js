import { createPlant, deletePlant, listPlants, toPublicPlant, updatePlant } from '../services/plant.service.js';
import { generateCare, getCare } from '../services/care.service.js';

export async function createPlantHandler(req, res, next) {
  try {
    const plant = await createPlant(req.userId, req.body ?? {});
    res.status(201).json({ plant: toPublicPlant(plant) });
  } catch (err) {
    next(err);
  }
}

export async function listPlantsHandler(req, res, next) {
  try {
    const plants = await listPlants(req.userId);
    res.json({ plants: plants.map(toPublicPlant) });
  } catch (err) {
    next(err);
  }
}

export async function updatePlantHandler(req, res, next) {
  try {
    const plant = await updatePlant(req.userId, req.params.id, req.body ?? {});
    res.json({ plant: toPublicPlant(plant) });
  } catch (err) {
    next(err);
  }
}

export async function getCareHandler(req, res, next) {
  try {
    res.json({ care: await getCare(req.userId, req.params.id) });
  } catch (err) {
    next(err);
  }
}

export async function generateCareHandler(req, res, next) {
  try {
    res.json({ care: await generateCare(req.userId, req.params.id) });
  } catch (err) {
    next(err);
  }
}

export async function deletePlantHandler(req, res, next) {
  try {
    await deletePlant(req.userId, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
