import { createPlanter, listPlanters, toPublicPlanter } from '../services/planter.service.js';

export async function createPlanterHandler(req, res, next) {
  try {
    const planter = await createPlanter(req.userId, req.body ?? {});
    res.status(201).json({ planter: toPublicPlanter(planter) });
  } catch (err) {
    next(err);
  }
}

export async function listPlantersHandler(req, res, next) {
  try {
    const planters = await listPlanters(req.userId);
    res.json({ planters: planters.map(toPublicPlanter) });
  } catch (err) {
    next(err);
  }
}
