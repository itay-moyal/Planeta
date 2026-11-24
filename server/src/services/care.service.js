import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { Plant } from '../models/plant.model.js';
import { SpeciesCache } from '../models/speciesCache.model.js';
import { findOwnPlant } from './plant.service.js';
import { getCareData } from './species.service.js';
import { generateCarePlan } from './llm.service.js';
import { consumeLlmCall } from './usage.service.js';
import { computeWarnings } from './warnings.js';

const LOCK_MS = 2 * 60 * 1000; // a crashed request cannot block a plant for longer than this

// A fingerprint of everything the plan was written from. Edit the placement and the fingerprint changes.
export function placementKey(placement) {
  const p = placement ?? {};
  const parts = [p.location, p.windowDirection, p.lightLevel, p.sunExposure, p.potSizeNotes].map((v) => v ?? '');
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

const keyOf = (name) => String(name).trim().replace(/\s+/g, ' ').toLowerCase();

// Cached care data only: reading never calls Perenual, so GET and the planter-mate check cost nothing.
async function cachedCareData(names) {
  const keys = [...new Set(names.map(keyOf))];
  const docs = await SpeciesCache.find({ key: { $in: keys }, status: 'found' });
  return new Map(docs.map((d) => [d.key, d.data]));
}

// What the client gets: the stored plan, whether it is stale, the care data, and the code-made warnings.
async function buildView(plant) {
  const mates = plant.planterId ? await Plant.find({ userId: plant.userId, planterId: plant.planterId, _id: { $ne: plant._id } }) : [];
  const data = await cachedCareData([plant.species.scientificName, ...mates.map((m) => m.species.scientificName)]);
  const careData = data.get(keyOf(plant.species.scientificName)) ?? null;
  const care = plant.care ?? {};
  const generating = Boolean(care.generatingSince && Date.now() - care.generatingSince.getTime() < LOCK_MS);
  return {
    status: care.status ?? 'none',
    plan: care.status === 'ready' ? care.plan : null,
    stale: care.status === 'ready' && care.placementKey !== placementKey(plant.placement),
    generating,
    generatedAt: care.generatedAt ?? null,
    careData,
    warnings: computeWarnings({
      careData,
      mates: mates.map((m) => ({ name: m.name, careData: data.get(keyOf(m.species.scientificName)) ?? null })),
    }),
  };
}

export async function getCare(userId, plantId) {
  return buildView(await findOwnPlant(userId, plantId));
}

// Idempotent: a plan that already matches the placement is returned as it is, at no cost.
export async function generateCare(userId, plantId) {
  const plant = await findOwnPlant(userId, plantId);
  const key = placementKey(plant.placement);
  if (plant.care?.status === 'ready' && plant.care.placementKey === key) return buildView(plant);

  // Care data (cache first). Without data there is nothing to ground a plan on, so no LLM call.
  const found = await getCareData(plant.species.scientificName);
  if (found.status !== 'found') {
    await Plant.updateOne({ _id: plant._id, userId }, { $set: { 'care.status': 'no_data', 'care.plan': null, 'care.placementKey': key, 'care.generatedAt': new Date() } });
    return buildView(await findOwnPlant(userId, plantId));
  }

  // Switched off for everyone: stop before anything is locked or counted, so a blocked attempt costs the user nothing.
  if (config.llmKillSwitch) throw new AppError('LLM_DISABLED');

  // Take the lock in one atomic step. Only one of several simultaneous requests gets it.
  const now = new Date();
  const locked = await Plant.findOneAndUpdate(
    { _id: plant._id, userId, $or: [{ 'care.generatingSince': null }, { 'care.generatingSince': { $lt: new Date(now.getTime() - LOCK_MS) } }] },
    { $set: { 'care.generatingSince': now } },
  );
  if (!locked) throw new AppError('CARE_IN_PROGRESS');

  try {
    await consumeLlmCall(userId); // counted before the call, like identifications
    const { plan, model, usage } = await generateCarePlan({
      species: { scientificName: plant.species.scientificName, commonName: plant.species.commonNames[0] ?? null },
      careData: found.data,
      placement: plant.placement,
    });
    await Plant.updateOne({ _id: plant._id, userId }, {
      $set: {
        'care.status': 'ready', 'care.plan': plan, 'care.model': model, 'care.inputTokens': usage.inputTokens, 'care.outputTokens': usage.outputTokens,
        'care.placementKey': key, 'care.generatedAt': new Date(),
      },
    });
  } finally {
    await Plant.updateOne({ _id: plant._id, userId }, { $set: { 'care.generatingSince': null } });
  }
  return buildView(await findOwnPlant(userId, plantId));
}
