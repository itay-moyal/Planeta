import { config } from '../config.js';
import { AppError } from '../errors.js';

// Source: https://my.plantnet.org/doc/api/identify
// POST https://my-api.plantnet.org/v2/identify/all?api-key=...
// multipart fields: images (file), organs ("auto" if unknown)
const BASE_URL = 'https://my-api.plantnet.org/v2/identify/all';
const TOP_K = 3;

export async function identifyPlant({ buffer, mimetype }, fetchFn = fetch) {
  if (!config.plantnetApiKey) throw new AppError('UPSTREAM_FAILED');

  const form = new FormData();
  form.append('images', new Blob([buffer], { type: mimetype }), 'plant');
  form.append('organs', 'auto');

  const params = new URLSearchParams({
    'api-key': config.plantnetApiKey,
    lang: 'he',
    'nb-results': String(TOP_K),
    'include-related-images': 'true',
  });

  let res;
  try {
    res = await fetchFn(`${BASE_URL}?${params}`, { method: 'POST', body: form });
  } catch {
    throw new AppError('UPSTREAM_FAILED'); // network down / DNS / timeout
  }

  // Documented: 404 = no plant detected, 429 = daily quota exceeded
  if (res.status === 404) throw new AppError('NOT_A_PLANT');
  if (res.status === 429) throw new AppError('QUOTA_REACHED');
  if (!res.ok) throw new AppError('UPSTREAM_FAILED');

  const data = await res.json();
  return {
    candidates: (data.results ?? []).slice(0, TOP_K).map(toCandidate),
    remainingIdentificationRequests: data.remainingIdentificationRequests ?? null,
  };
}

function toCandidate(r) {
  // Related-image field structure is not documented on the identify page;
  // read defensively and verify against a real response.
  const images = (r.images ?? [])
    .map((img) => img?.url?.m ?? img?.url?.s ?? null)
    .filter(Boolean);
  return {
    scientificName: r.species?.scientificNameWithoutAuthor ?? null,
    commonNames: r.species?.commonNames ?? [],
    family: r.species?.family?.scientificNameWithoutAuthor ?? null,
    score: r.score,
    referenceImages: images.slice(0, 2),
  };
}
