import { describe, it, expect, beforeEach, vi } from 'vitest';

// Perenual is mocked: these tests must never spend the real 100 requests a day.
process.env.PERENUAL_API_KEY = 'test-key';

// The service keeps a "paused" flag in module state, so every test gets a fresh copy of it.
let mod;
beforeEach(async () => {
  vi.resetModules();
  process.env.PERENUAL_API_KEY = 'test-key';
  mod = await import('../src/services/perenual.service.js');
});

const res = (status, body, headers = {}) => ({
  ok: status < 400,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

// A fake fetch that answers the two endpoints and counts calls.
function fakeFetch({ list, details }) {
  const fn = vi.fn(async (url) => (String(url).includes('/species-list') ? list : details));
  return fn;
}

const listOf = (...rows) => res(200, { data: rows });
const row = (id, ...names) => ({ id, common_name: 'x', scientific_name: names });
const detailsBody = {
  id: 2468, common_name: 'dumb cane', scientific_name: ['Dieffenbachia seguine'], type: 'Herb', cycle: 'Herbaceous Perennial',
  watering: 'Average', watering_general_benchmark: { value: '"7-10"', unit: 'days' }, sunlight: ['filtered shade', 'part sun/part shade'],
  indoor: true, poisonous_to_humans: true, poisonous_to_pets: true, care_level: 'Medium', maintenance: 'Moderate',
  growth_rate: 'Moderate', hardiness: { min: '10', max: '12' }, other_images: [{ original_url: 'https://x/y.jpg' }],
};

describe('fetchCareData', () => {
  it('finds the species and keeps only the care fields', async () => {
    const f = fakeFetch({ list: listOf(row(2468, 'Dieffenbachia seguine')), details: res(200, detailsBody) });
    const out = await mod.fetchCareData('Dieffenbachia seguine', f);
    expect(out.status).toBe('found');
    expect(out.data).toEqual({
      perenualId: 2468, commonName: 'dumb cane', scientificName: 'Dieffenbachia seguine', type: 'Herb', cycle: 'Herbaceous Perennial',
      watering: 'Average', wateringDays: { min: 7, max: 10 }, sunlight: ['filtered shade', 'part sun/part shade'],
      indoor: true, poisonousToHumans: true, poisonousToPets: true, careLevel: 'Medium', maintenance: 'Moderate',
      growthRate: 'Moderate', hardiness: { min: 10, max: 12 },
    });
    expect(JSON.stringify(out)).not.toMatch(/other_images|y\.jpg/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('matches the scientific name case-insensitively', async () => {
    const f = fakeFetch({ list: listOf(row(1, 'Dieffenbachia seguine')), details: res(200, detailsBody) });
    expect((await mod.fetchCareData('dieffenbachia SEGUINE', f)).status).toBe('found');
  });

  it('handles a missing watering benchmark', async () => {
    const f = fakeFetch({ list: listOf(row(1, 'A b')), details: res(200, { ...detailsBody, watering_general_benchmark: { value: null, unit: 'days' } }) });
    expect((await mod.fetchCareData('A b', f)).data.wateringDays).toBeNull();
  });

  it('reports not_found when only a cultivar matches, without asking for details', async () => {
    const f = fakeFetch({ list: listOf(row(5193, "Mentha spicata 'Kentucky Colonel'")), details: res(200, detailsBody) });
    expect((await mod.fetchCareData('Mentha spicata', f)).status).toBe('not_found');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('reports not_found for an empty result', async () => {
    const f = fakeFetch({ list: listOf(), details: res(200, detailsBody) });
    expect((await mod.fetchCareData('Nothing here', f)).status).toBe('not_found');
  });

  it('reports restricted when the plan does not include the species (plain-text 429)', async () => {
    const f = fakeFetch({ list: listOf(row(8386, 'Zamioculcas zamiifolia')), details: res(429, 'Please Upgrade Plan - https://perenual.com/subscription-api-pricing. Sorry') });
    expect((await mod.fetchCareData('Zamioculcas zamiifolia', f)).status).toBe('restricted');
  });

  it('treats a real rate limit as unavailable and then stops calling for a while', async () => {
    const limited = fakeFetch({ list: res(429, 'Too Many Requests'), details: res(200, detailsBody) });
    await expect(mod.fetchCareData('A b', limited)).rejects.toMatchObject({ code: 'CARE_UNAVAILABLE' });
    const next = fakeFetch({ list: listOf(row(1, 'A b')), details: res(200, detailsBody) });
    await expect(mod.fetchCareData('A b', next)).rejects.toMatchObject({ code: 'CARE_UNAVAILABLE' });
    expect(next).not.toHaveBeenCalled();
  });

  it('stops calling once the daily quota is nearly used up, but still returns the answer in hand', async () => {
    const low = { 'x-ratelimit-remaining': '5' };
    const f = fakeFetch({ list: res(200, { data: [row(1, 'A b')] }, low), details: res(200, detailsBody, low) });
    expect((await mod.fetchCareData('A b', f)).status).toBe('found');
    const next = fakeFetch({ list: listOf(), details: res(200, detailsBody) });
    await expect(mod.fetchCareData('C d', next)).rejects.toMatchObject({ code: 'CARE_UNAVAILABLE' });
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps calling while plenty of quota is left', async () => {
    const ok = { 'x-ratelimit-remaining': '90' };
    const f = fakeFetch({ list: res(200, { data: [row(1, 'A b')] }, ok), details: res(200, detailsBody, ok) });
    await mod.fetchCareData('A b', f);
    await expect(mod.fetchCareData('A b', f)).resolves.toMatchObject({ status: 'found' });
  });

  it.each([[500], [401], [403]])('maps HTTP %i to unavailable', async (status) => {
    const f = fakeFetch({ list: res(status, 'nope'), details: res(200, detailsBody) });
    await expect(mod.fetchCareData('A b', f)).rejects.toMatchObject({ code: 'CARE_UNAVAILABLE' });
  });

  it('maps a bad JSON answer to unavailable', async () => {
    const f = fakeFetch({ list: res(200, 'not json at all'), details: res(200, detailsBody) });
    await expect(mod.fetchCareData('A b', f)).rejects.toMatchObject({ code: 'CARE_UNAVAILABLE' });
  });

  it('maps a network failure to unavailable', async () => {
    const down = async () => { throw new Error('offline'); };
    await expect(mod.fetchCareData('A b', down)).rejects.toMatchObject({ code: 'CARE_UNAVAILABLE' });
  });

  it('is unavailable without an API key, and never calls out', async () => {
    vi.resetModules();
    delete process.env.PERENUAL_API_KEY;
    const noKey = await import('../src/services/perenual.service.js');
    const f = fakeFetch({ list: listOf(), details: res(200, detailsBody) });
    await expect(noKey.fetchCareData('A b', f)).rejects.toMatchObject({ code: 'CARE_UNAVAILABLE' });
    expect(f).not.toHaveBeenCalled();
  });

  it('never puts the API key in an error', async () => {
    const f = fakeFetch({ list: res(500, 'boom'), details: res(200, detailsBody) });
    const err = await mod.fetchCareData('A b', f).catch((e) => e);
    expect(JSON.stringify({ message: err.message, code: err.code, userMessage: err.userMessage })).not.toMatch(/test-key/);
  });
});

describe('parseBenchmark', () => {
  it.each([
    [{ value: '"7-10"', unit: 'days' }, { min: 7, max: 10 }],
    [{ value: '7-10', unit: 'days' }, { min: 7, max: 10 }],
    [{ value: '5', unit: 'days' }, { min: 5, max: 5 }],
    [{ value: null, unit: 'days' }, null],
    [{ value: 'soon', unit: 'days' }, null],
    [{ value: '7-10', unit: 'weeks' }, null],
    [null, null],
  ])('%j -> %j', (input, expected) => {
    expect(mod.parseBenchmark(input)).toEqual(expected);
  });
});

describe('isLatinName', () => {
  it.each([
    ['Mentha spicata', true],
    ["Epipremnum aureum 'Neon'", true],
    ['Mentha × piperita', true],
    ['נענע', false],
    ['Mentha נענע', false],
    ['', false],
    ['a', false],
    [null, false],
  ])('%j -> %s', (input, expected) => {
    expect(mod.isLatinName(input)).toBe(expected);
  });
});
