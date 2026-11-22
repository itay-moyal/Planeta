import { config } from '../config.js';
import { AppError } from '../errors.js';

// Sources: https://perenual.com/docs/api and https://perenual.com/subscription-api-pricing
// GET /api/v2/species-list?key=...&q=NAME          -> { data: [{ id, common_name, scientific_name: [..] }] }
// GET /api/v2/species/details/{id}?key=...         -> one species with the care fields below
// Free plan: 100 requests per day, and only species ids 1-3000. Observed against the real API:
// details for an id above that answer HTTP 429 with the plain text "Please Upgrade Plan ...".
const BASE_URL = 'https://perenual.com/api/v2';
const TIMEOUT_MS = 8000;
const LOW_QUOTA = 5; // stop calling Perenual when this few of today's requests are left
const RATE_LIMIT_PAUSE_MS = 15 * 60 * 1000;

let pausedUntil = 0; // while paused we do not call Perenual at all

const unavailable = () => new AppError('CARE_UNAVAILABLE');
const nextUtcMidnight = () => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
};

// Perenual only knows scientific (Latin) names. A typed Hebrew name would waste one of the 100 daily requests.
export function isLatinName(name) {
  return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9 .'×-]{1,99}$/.test(name.trim());
}

// Perenual sends the watering benchmark as {"value":"\"7-10\"","unit":"days"} (stray quotes), or null.
export function parseBenchmark(b) {
  if (!b || b.unit !== 'days' || b.value == null) return null;
  const text = String(b.value).replace(/["']/g, '').trim();
  const range = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = text.match(/^(\d+)$/);
  return single ? { min: Number(single[1]), max: Number(single[1]) } : null;
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const bool = (v) => (typeof v === 'boolean' ? v : v === 1 ? true : v === 0 ? false : null);

// Keep only what Planeta uses (no image URLs or licenses).
function toCareData(b) {
  const hMin = Number(b.hardiness?.min);
  const hMax = Number(b.hardiness?.max);
  return {
    perenualId: b.id,
    commonName: str(b.common_name),
    scientificName: Array.isArray(b.scientific_name) ? str(b.scientific_name[0]) : str(b.scientific_name),
    type: str(b.type),
    cycle: str(b.cycle),
    watering: str(b.watering), // a category such as "Average"
    wateringDays: parseBenchmark(b.watering_general_benchmark),
    sunlight: Array.isArray(b.sunlight) ? b.sunlight.filter((s) => typeof s === 'string') : [],
    indoor: bool(b.indoor),
    poisonousToHumans: bool(b.poisonous_to_humans),
    poisonousToPets: bool(b.poisonous_to_pets),
    careLevel: str(b.care_level),
    maintenance: str(b.maintenance),
    growthRate: str(b.growth_rate),
    hardiness: Number.isFinite(hMin) && Number.isFinite(hMax) && b.hardiness?.min != null ? { min: hMin, max: hMax } : null,
  };
}

async function call(path, params, fetchFn) {
  if (!config.perenualApiKey) throw unavailable();
  const url = `${BASE_URL}${path}?${new URLSearchParams({ ...params, key: config.perenualApiKey })}`;
  let res;
  let text = '';
  try {
    res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    text = await res.text();
  } catch {
    throw unavailable(); // network down / DNS / timeout
  }
  const remaining = res.headers?.get?.('x-ratelimit-remaining');
  if (remaining != null && remaining !== '' && Number(remaining) <= LOW_QUOTA) pausedUntil = nextUtcMidnight();
  return { status: res.status, text };
}

// Same HTTP code as a real rate limit, but this one means "your plan does not include this species".
const isPlanBlock = (r) => r.status === 429 && /upgrade/i.test(r.text);

function failure(r) {
  if (r.status === 429) pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS; // a real rate limit: back off
  else console.error('Perenual request failed with status', r.status); // status only, never the URL (it holds the key)
  return unavailable();
}

function parseJson(text) {
  try {
    const body = JSON.parse(text);
    if (body && typeof body === 'object') return body;
  } catch {
    // fall through
  }
  throw unavailable();
}

// Returns { status: 'found', data } | { status: 'not_found' } | { status: 'restricted' }.
// Throws CARE_UNAVAILABLE for anything temporary (rate limit, network, server error): never cache that.
export async function fetchCareData(scientificName, fetchFn = fetch) {
  const name = scientificName.trim();
  // The pause only gates a NEW lookup, never the second request of one already under way.
  if (Date.now() < pausedUntil) throw unavailable();

  const search = await call('/species-list', { q: name }, fetchFn);
  if (isPlanBlock(search)) return { status: 'restricted', data: null };
  if (search.status !== 200) throw failure(search);
  const searchBody = parseJson(search.text);
  const rows = Array.isArray(searchBody.data) ? searchBody.data : [];

  // Exact scientific name only. A cultivar such as "Mentha spicata 'Kentucky Colonel'" is a different plant.
  const match = rows.find((r) => (r.scientific_name ?? []).some((s) => typeof s === 'string' && s.toLowerCase() === name.toLowerCase()));
  if (!match) return { status: 'not_found', data: null };

  const details = await call(`/species/details/${match.id}`, {}, fetchFn);
  if (isPlanBlock(details)) return { status: 'restricted', data: null };
  if (details.status !== 200) throw failure(details);
  return { status: 'found', data: toCareData(parseJson(details.text)) };
}
