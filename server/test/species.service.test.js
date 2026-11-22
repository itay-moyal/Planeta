import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';

// Perenual is mocked: these tests must never spend the real 100 requests a day.
process.env.PERENUAL_API_KEY = 'test-key';
const { getCareData } = await import('../src/services/species.service.js');
const { SpeciesCache } = await import('../src/models/speciesCache.model.js');

const TEST_URI = process.env.MONGODB_TEST_URI;
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);

const res = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const details = { id: 1, common_name: 'x', scientific_name: ['Foo bar'], watering: 'Average', sunlight: ['full sun'], poisonous_to_pets: false };
const answering = (list, det) => vi.fn(async (url) => (String(url).includes('/species-list') ? list : det));
const foundFetch = () => answering(res(200, { data: [{ id: 1, scientific_name: ['Foo bar'] }] }), res(200, details));

describe.skipIf(!dbTestsEnabled)('species cache with a test database', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await SpeciesCache.syncIndexes();
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('asks Perenual once, then answers from the cache (case-insensitive)', async () => {
    const f = foundFetch();
    const first = await getCareData('Foo bar', f);
    expect(first.status).toBe('found');
    expect(f).toHaveBeenCalledTimes(2);

    const second = await getCareData('  FOO   bar ', f);
    expect(second).toEqual(first);
    expect(f).toHaveBeenCalledTimes(2); // no new request

    const doc = await SpeciesCache.findOne({ key: 'foo bar' });
    expect(doc).toMatchObject({ scientificName: 'Foo bar', source: 'perenual', status: 'found' });
    expect(doc.data.watering).toBe('Average');
  });

  it('caches "not found" and "restricted" too, so they never cost another request', async () => {
    const none = answering(res(200, { data: [] }), res(200, details));
    expect((await getCareData('No such plant', none)).status).toBe('not_found');
    await getCareData('No such plant', none);
    expect(none).toHaveBeenCalledTimes(1);

    const blocked = answering(res(200, { data: [{ id: 9000, scientific_name: ['Paid plant'] }] }), res(429, 'Please Upgrade Plan'));
    expect((await getCareData('Paid plant', blocked)).status).toBe('restricted');
    await getCareData('Paid plant', blocked);
    expect(blocked).toHaveBeenCalledTimes(2); // search + details, once
  });

  it('does not call Perenual or cache anything for a non-Latin name', async () => {
    const f = foundFetch();
    expect(await getCareData('נענע', f)).toEqual({ status: 'not_found', data: null });
    expect(f).not.toHaveBeenCalled();
    expect(await SpeciesCache.countDocuments({ scientificName: 'נענע' })).toBe(0);
  });

  it('does not cache a temporary failure', async () => {
    const down = answering(res(500, 'boom'), res(200, details));
    await expect(getCareData('Temp fail', down)).rejects.toMatchObject({ code: 'CARE_UNAVAILABLE' });
    expect(await SpeciesCache.countDocuments({ key: 'temp fail' })).toBe(0);
    const f = answering(res(200, { data: [{ id: 2, scientific_name: ['Temp fail'] }] }), res(200, details));
    expect((await getCareData('Temp fail', f)).status).toBe('found'); // the next try works normally
  });

  it('refreshes an expired entry', async () => {
    await SpeciesCache.updateOne({ key: 'foo bar' }, { fetchedAt: new Date('2000-01-01') });
    const f = foundFetch();
    await getCareData('Foo bar', f);
    expect(f).toHaveBeenCalledTimes(2);
    const doc = await SpeciesCache.findOne({ key: 'foo bar' });
    expect(doc.fetchedAt.getFullYear()).toBeGreaterThan(2020);
  });

  it('serves the old entry when it is expired and Perenual is down', async () => {
    await SpeciesCache.updateOne({ key: 'foo bar' }, { fetchedAt: new Date('2000-01-01') });
    const down = answering(res(500, 'boom'), res(500, 'boom'));
    const out = await getCareData('Foo bar', down);
    expect(out.status).toBe('found');
    expect(out.data.watering).toBe('Average');
  });

  it('keeps one entry per species even when two lookups race', async () => {
    const f = answering(res(200, { data: [{ id: 3, scientific_name: ['Race plant'] }] }), res(200, details));
    await Promise.all([getCareData('Race plant', f), getCareData('Race plant', f)]);
    expect(await SpeciesCache.countDocuments({ key: 'race plant' })).toBe(1);
  });
});
