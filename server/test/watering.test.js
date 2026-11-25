import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

// The LLM is mocked and Perenual is never called (the species cache is seeded): no real spend.
vi.mock('../src/services/llm.service.js', () => ({
  generateCarePlan: vi.fn(async () => ({
    plan: { summary: 'תוכנית', watering: 'מים', light: 'אור', placementTips: [], unknown: [] },
    model: 'claude-haiku-5-5', usage: { inputTokens: 1, outputTokens: 1 },
  })),
}));

process.env.JWT_SECRET = 'test-secret-not-for-production';
vi.setConfig({ testTimeout: 60000 }); // the test database is remote
const { app } = await import('../src/app.js');
const { suggestInterval, SNOOZE_DAYS } = await import('../src/services/watering.service.js');
const { SpeciesCache } = await import('../src/models/speciesCache.model.js');

const TEST_URI = process.env.MONGODB_TEST_URI;
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);
const DAY = 24 * 60 * 60 * 1000;
const near = (date, expectedMs, slack = 60_000) => Math.abs(new Date(date).getTime() - expectedMs) < slack;

describe('suggestInterval', () => {
  it.each([
    [{ wateringDays: { min: 7, max: 10 } }, 9],
    [{ wateringDays: { min: 3, max: 4 } }, 4],
    [{ wateringDays: { min: 5, max: 5 } }, 5],
    [{ wateringDays: null, watering: 'Average' }, null], // a category alone never becomes a number
    [{ wateringDays: { min: 0, max: 0 } }, null],
    [{ wateringDays: { min: 1, max: 1000 } }, null],
    [null, null],
  ])('%j -> %s', (careData, expected) => {
    expect(suggestInterval(careData)).toBe(expected);
  });
});

const plantBody = (scientificName, name = scientificName) => ({
  name, species: { scientificName, commonNames: [] }, identificationSource: 'manual', placement: { location: 'balcony', sunExposure: 'full' },
});
const seed = (name, data) => SpeciesCache.create({ key: name.toLowerCase(), scientificName: name, source: 'perenual', status: 'found', data, fetchedAt: new Date() });

describe('watering routes without login', () => {
  it.each([['get', '/api/plants/due'], ['post', '/api/plants/abc/water'], ['put', '/api/plants/abc/interval']])('%s %s returns 401', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });
});

describe.skipIf(!dbTestsEnabled)('watering with a test database', () => {
  let A;
  let B;
  const Plant = () => mongoose.model('Plant');
  const save = async (agent, name) => (await agent.post('/api/plants').send(plantBody(name)).expect(201)).body.plant.id;
  const makeDue = (id, daysAgo = 1) => Plant().updateOne({ _id: id }, { 'watering.intervalDays': 7, 'watering.nextDueAt': new Date(Date.now() - daysAgo * DAY) });

  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all(['User', 'Plant', 'WateringLog'].map((m) => mongoose.model(m).syncIndexes()));
    await SpeciesCache.syncIndexes();
    A = request.agent(app);
    B = request.agent(app);
    await A.post('/api/auth/signup').send({ email: 'a@example.com', password: 'password123' }).expect(201);
    await B.post('/api/auth/signup').send({ email: 'b@example.com', password: 'password123' }).expect(201);
    await seed('Ranged one', { watering: 'Average', wateringDays: { min: 7, max: 10 }, sunlight: [] });
    await seed('Category only', { watering: 'Average', wateringDays: null, sunlight: [] });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('another user gets 404 on water and interval, changes nothing, and never sees the plant as due', async () => {
    const id = await save(A, 'Foo');
    await makeDue(id);
    expect((await B.post(`/api/plants/${id}/water`).send({ action: 'watered' })).status).toBe(404);
    expect((await B.put(`/api/plants/${id}/interval`).send({ intervalDays: 3 })).status).toBe(404);
    expect((await B.post('/api/plants/not-an-id/water').send({ action: 'watered' })).status).toBe(404);
    expect(await mongoose.model('WateringLog').countDocuments({ plantId: id })).toBe(0);
    expect((await Plant().findById(id)).watering.intervalDays).toBe(7);
    expect((await B.get('/api/plants/due').expect(200)).body.plants).toEqual([]);
    expect((await A.get('/api/plants/due').expect(200)).body.plants.map((p) => p.id)).toContain(id);
  });

  it('takes the interval from care data (middle of the range), only when a number of days exists', async () => {
    const withDays = await save(A, 'Ranged one');
    await A.post(`/api/plants/${withDays}/care`).expect(200);
    const { watering } = (await A.get('/api/plants')).body.plants.find((p) => p.id === withDays);
    expect(watering).toMatchObject({ intervalDays: 9, intervalSource: 'care_data', lastWateredAt: null });
    expect(near(watering.nextDueAt, Date.now() + 9 * DAY)).toBe(true);

    const noDays = await save(A, 'Category only');
    await A.post(`/api/plants/${noDays}/care`).expect(200);
    const w2 = (await A.get('/api/plants')).body.plants.find((p) => p.id === noDays).watering;
    expect(w2).toEqual({ intervalDays: null, intervalSource: null, lastWateredAt: null, nextDueAt: null });
  });

  it('a user-set interval wins and is not overwritten when the plan is regenerated', async () => {
    const id = await save(A, 'Ranged one');
    await A.post(`/api/plants/${id}/care`).expect(200);
    const set = (await A.put(`/api/plants/${id}/interval`).send({ intervalDays: 5 }).expect(200)).body.plant.watering;
    expect(set).toMatchObject({ intervalDays: 5, intervalSource: 'user' });
    await A.patch(`/api/plants/${id}`).send({ placement: { location: 'indoor', lightLevel: 'low' } }).expect(200); // stale plan
    await A.post(`/api/plants/${id}/care`).expect(200);
    expect((await Plant().findById(id)).watering).toMatchObject({ intervalDays: 5, intervalSource: 'user' });
  });

  it('fills the interval for a plant whose plan already exists (no new plan, no API call)', async () => {
    const id = await save(A, 'Late data');
    await seed('Late data', { watering: 'Average', wateringDays: null, sunlight: [] });
    await A.post(`/api/plants/${id}/care`).expect(200);
    expect((await Plant().findById(id)).watering.intervalDays).toBeNull();
    await SpeciesCache.updateOne({ key: 'late data' }, { 'data.wateringDays': { min: 4, max: 6 } });
    await A.post(`/api/plants/${id}/care`).expect(200); // plan matches the placement: the early-return path
    expect((await Plant().findById(id)).watering).toMatchObject({ intervalDays: 5, intervalSource: 'care_data' });
  });

  it.each([[0], [1.5], [366], ['7'], [null], [undefined]])('rejects an interval of %j', async (intervalDays) => {
    const id = await save(A, 'Foo');
    expect((await A.put(`/api/plants/${id}/interval`).send({ intervalDays })).status).toBe(400);
  });

  it.each([[{ action: 'sing' }], [{}], [{ action: 'watered', source: 'telegram' }]])('rejects the answer %j', async (body) => {
    const id = await save(A, 'Foo');
    expect((await A.post(`/api/plants/${id}/water`).send(body)).status).toBe(400);
    expect(await mongoose.model('WateringLog').countDocuments({ plantId: id })).toBe(0);
  });

  it('still_moist snoozes, dry only logs, watered reschedules; each answer is logged', async () => {
    const id = await save(A, 'Foo');
    await makeDue(id);
    expect((await A.get('/api/plants/due')).body.plants.map((p) => p.id)).toContain(id);

    const dry = (await A.post(`/api/plants/${id}/water`).send({ action: 'dry', source: 'reminder_reply' }).expect(200)).body.plant.watering;
    expect(new Date(dry.nextDueAt).getTime()).toBeLessThan(Date.now()); // still due
    expect((await A.get('/api/plants/due')).body.plants.map((p) => p.id)).toContain(id);

    const moist = (await A.post(`/api/plants/${id}/water`).send({ action: 'still_moist' }).expect(200)).body.plant.watering;
    expect(near(moist.nextDueAt, Date.now() + SNOOZE_DAYS * DAY)).toBe(true);
    expect((await A.get('/api/plants/due')).body.plants.map((p) => p.id)).not.toContain(id);

    const watered = (await A.post(`/api/plants/${id}/water`).send({ action: 'watered' }).expect(200)).body.plant.watering;
    expect(near(watered.lastWateredAt, Date.now())).toBe(true);
    expect(near(watered.nextDueAt, Date.now() + 7 * DAY)).toBe(true);

    const logs = await mongoose.model('WateringLog').find({ plantId: id }).sort({ at: 1 });
    expect(logs.map((l) => [l.action, l.source])).toEqual([['dry', 'reminder_reply'], ['still_moist', 'user'], ['watered', 'user']]);
  });

  it('a plant without an interval is never due, but "watered" is still recorded', async () => {
    const id = await save(A, 'Foo');
    const res = (await A.post(`/api/plants/${id}/water`).send({ action: 'watered' }).expect(200)).body.plant.watering;
    expect(near(res.lastWateredAt, Date.now())).toBe(true);
    expect(res.nextDueAt).toBeNull();
    expect((await A.get('/api/plants/due')).body.plants.map((p) => p.id)).not.toContain(id);
  });

  it('exposes the schedule on the plant without leaking the user id', async () => {
    const res = await A.get('/api/plants');
    expect(res.body.plants[0].watering).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/userId/);
  });
});
