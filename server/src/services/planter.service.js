import { AppError } from '../errors.js';
import { Planter } from '../models/planter.model.js';

export const MAX_PLANTERS = 20;
const SUN = ['full', 'partial', 'shade'];

export function toPublicPlanter(p) {
  return { id: p._id.toString(), name: p.name, sunExposure: p.sunExposure, sizeNotes: p.sizeNotes };
}

export function validatePlanter(input) {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 60) {
    throw new AppError('INVALID_INPUT');
  }
  const out = { name: input.name.trim() };
  if (input.sunExposure !== undefined) {
    if (!SUN.includes(input.sunExposure)) throw new AppError('INVALID_INPUT');
    out.sunExposure = input.sunExposure;
  }
  if (input.sizeNotes !== undefined) {
    if (typeof input.sizeNotes !== 'string' || input.sizeNotes.length > 200) throw new AppError('INVALID_INPUT');
    out.sizeNotes = input.sizeNotes.trim();
  }
  return out;
}

export async function createPlanter(userId, input) {
  const data = validatePlanter(input);
  if ((await Planter.countDocuments({ userId })) >= MAX_PLANTERS) throw new AppError('LIMIT_REACHED');
  return Planter.create({ ...data, userId });
}

export async function listPlanters(userId) {
  return Planter.find({ userId }).sort({ createdAt: 1 });
}
