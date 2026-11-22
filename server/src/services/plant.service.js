import mongoose from 'mongoose';
import { AppError } from '../errors.js';
import { Plant } from '../models/plant.model.js';
import { Planter } from '../models/planter.model.js';

export const MAX_PLANTS = 100;
const WINDOW = ['N', 'E', 'S', 'W'];
const LIGHT = ['low', 'medium', 'high'];
const SUN = ['full', 'partial', 'shade'];

const bad = () => new AppError('INVALID_INPUT');
const isStr = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;

export function toPublicPlant(p) {
  return {
    id: p._id.toString(),
    name: p.name,
    species: { scientificName: p.species.scientificName, commonNames: p.species.commonNames },
    identificationSource: p.identificationSource,
    identificationConfidence: p.identificationConfidence,
    referenceImageUrl: p.referenceImageUrl,
    placement: JSON.parse(JSON.stringify(p.placement)),
    planterId: p.planterId ? p.planterId.toString() : null,
    createdAt: p.createdAt,
  };
}

// Builds a clean placement object. Fields belonging to the other location are rejected.
export function validatePlacement(p) {
  if (!p || typeof p !== 'object') throw bad();
  if (p.location === 'indoor') {
    if (p.sunExposure !== undefined || p.potSizeNotes !== undefined) throw bad();
    const out = { location: 'indoor' };
    if (p.windowDirection !== undefined) {
      if (!WINDOW.includes(p.windowDirection)) throw bad();
      out.windowDirection = p.windowDirection;
    }
    if (p.lightLevel !== undefined) {
      if (!LIGHT.includes(p.lightLevel)) throw bad();
      out.lightLevel = p.lightLevel;
    }
    return out;
  }
  if (p.location === 'balcony') {
    if (p.windowDirection !== undefined || p.lightLevel !== undefined) throw bad();
    const out = { location: 'balcony' };
    if (p.sunExposure !== undefined) {
      if (!SUN.includes(p.sunExposure)) throw bad();
      out.sunExposure = p.sunExposure;
    }
    if (p.potSizeNotes !== undefined) {
      if (typeof p.potSizeNotes !== 'string' || p.potSizeNotes.length > 200) throw bad();
      out.potSizeNotes = p.potSizeNotes.trim();
    }
    return out;
  }
  if (p.location === 'garden') {
    // In the ground: sun exposure only (no window, no light level, no pot size).
    if (p.windowDirection !== undefined || p.lightLevel !== undefined || p.potSizeNotes !== undefined) throw bad();
    const out = { location: 'garden' };
    if (p.sunExposure !== undefined) {
      if (!SUN.includes(p.sunExposure)) throw bad();
      out.sunExposure = p.sunExposure;
    }
    return out;
  }
  throw bad();
}

function validateSpecies(s) {
  if (!s || !isStr(s.scientificName, 100)) throw bad();
  const commonNames = s.commonNames ?? [];
  if (!Array.isArray(commonNames) || commonNames.length > 10 || !commonNames.every((n) => isStr(n, 100))) throw bad();
  return { scientificName: s.scientificName.trim(), commonNames: commonNames.map((n) => n.trim()) };
}

// The planter must belong to the same user. Someone else's id looks the same as a missing one.
async function assertOwnPlanter(userId, planterId) {
  if (!mongoose.isValidObjectId(planterId)) throw new AppError('NOT_FOUND');
  const found = await Planter.exists({ _id: planterId, userId });
  if (!found) throw new AppError('NOT_FOUND');
}

function validateName(name) {
  if (!isStr(name, 60)) throw bad();
  return name.trim();
}

export async function createPlant(userId, input) {
  const species = validateSpecies(input.species);
  const placement = validatePlacement(input.placement);

  const source = input.identificationSource;
  if (!['candidate', 'manual'].includes(source)) throw bad();
  let confidence = null;
  if (source === 'candidate') {
    confidence = input.identificationConfidence;
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) throw bad();
  }

  let referenceImageUrl = '';
  if (input.referenceImageUrl !== undefined && input.referenceImageUrl !== '') {
    const u = input.referenceImageUrl;
    if (typeof u !== 'string' || u.length > 500 || !u.startsWith('https://')) throw bad();
    referenceImageUrl = u;
  }

  const name = input.name !== undefined ? validateName(input.name) : species.commonNames[0] ?? species.scientificName;

  let planterId = null;
  if (input.planterId !== undefined && input.planterId !== null) {
    if (placement.location === 'indoor') throw bad(); // only outdoor plants (balcony, garden) can share a planter
    await assertOwnPlanter(userId, input.planterId);
    planterId = input.planterId;
  }

  if ((await Plant.countDocuments({ userId })) >= MAX_PLANTS) throw new AppError('LIMIT_REACHED');

  return Plant.create({
    userId, name, species, identificationSource: source, identificationConfidence: confidence,
    referenceImageUrl, placement, planterId,
  });
}

export async function listPlants(userId) {
  return Plant.find({ userId }).sort({ createdAt: -1 });
}

export async function findOwnPlant(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('NOT_FOUND');
  const plant = await Plant.findOne({ _id: id, userId });
  if (!plant) throw new AppError('NOT_FOUND');
  return plant;
}

// Editable: name, placement, planterId. The species is NOT editable (it is the confirmed identification).
export async function updatePlant(userId, id, input) {
  const plant = await findOwnPlant(userId, id);

  if (input.name !== undefined) plant.name = validateName(input.name);
  if (input.placement !== undefined) plant.placement = validatePlacement(input.placement);
  if (input.planterId !== undefined) {
    if (input.planterId === null) {
      plant.planterId = null;
    } else {
      await assertOwnPlanter(userId, input.planterId);
      plant.planterId = input.planterId;
    }
  }
  // A plant moved indoors cannot stay in a planter.
  if (plant.placement.location === 'indoor' && plant.planterId) {
    if (input.planterId !== undefined && input.planterId !== null) throw bad();
    plant.planterId = null;
  }
  await plant.save();
  return plant;
}

export async function deletePlant(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('NOT_FOUND');
  const res = await Plant.deleteOne({ _id: id, userId });
  if (res.deletedCount === 0) throw new AppError('NOT_FOUND');
}
