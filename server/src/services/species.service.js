import { config } from '../config.js';
import { AppError } from '../errors.js';
import { SpeciesCache } from '../models/speciesCache.model.js';
import { fetchCareData, isLatinName } from './perenual.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Care data for a species: cache first, Perenual only on a miss. Perenual allows 100 requests a day
// for everyone, so every answer (including "not found" and "restricted") is cached.
// Returns { status: 'found' | 'not_found' | 'restricted', data }. Throws CARE_UNAVAILABLE when
// Perenual is temporarily unusable and we have nothing cached at all.
export async function getCareData(scientificName, fetchFn = fetch) {
  const name = String(scientificName ?? '').trim().replace(/\s+/g, ' ');
  if (!isLatinName(name)) return { status: 'not_found', data: null }; // no request, nothing to cache

  const key = name.toLowerCase();
  const cached = await SpeciesCache.findOne({ key });
  const fresh = cached && Date.now() - cached.fetchedAt.getTime() < config.careCacheDays * DAY_MS;
  if (fresh) return { status: cached.status, data: cached.data };

  let result;
  try {
    result = await fetchCareData(name, fetchFn);
  } catch (err) {
    // An old answer is better than none while Perenual is down.
    if (cached && err instanceof AppError && err.code === 'CARE_UNAVAILABLE') return { status: cached.status, data: cached.data };
    throw err;
  }

  await SpeciesCache.findOneAndUpdate(
    { key },
    { key, scientificName: name, source: 'perenual', status: result.status, data: result.data, fetchedAt: new Date() },
    { upsert: true },
  );
  return result;
}
