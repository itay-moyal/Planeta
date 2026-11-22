import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

// The LLM is mocked and Perenual is never called (the species cache is seeded): no real spend.
vi.mock('../src/services/llm.service.js', () => ({
  generateCarePlan: vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 50));
    return { plan: { summary: 'תוכנית', watering: 'מים', light: 'אור', placementTips: [], unknown: [] }, model: 'claude-haiku-5-5', usage: { inputTokens: 100, outputTokens: 50 } };
  }),
}));

process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.USER_DAILY_LLM_LIMIT = '3';
const { app } = await import('../src/app.js');
const { generateCarePlan } = await import('../src/services/llm.service.js');
const { SpeciesCache } = await import('../src/models/speciesCache.model.js');

// The test database is remote, and these tests make many round-trips each.
vi.setConfig({ testTimeout: 60000 });

const TEST_URI = process.env.MONGODB_TEST_URI;
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);

const plantBody = (scientificName, extra = {}) => ({
  name: scientificName, species: { scientificName, commonNames: [] }, identificationSource: 'manual',
  placement: { location: 'balcony', sunExposure: 'full' }, ...extra,
});
const seed = (name, status, data = null) =>
  SpeciesCache.create({ key: name.toLowerCase(), scientificName: name, source: 'perenual', status, data, fetchedAt: new Date() });
const dataOf = (over) => ({ watering: 'Average', sunlight: ['full sun'], poisonousToPets: false, poisonousToHumans: false, ...over });

describe('care routes without login', () => {
  it.each([['get'], ['post']])('%s /api/plants/:id/care returns 401', async (method) => {
    expect((await request(app)[method]('/api/plants/abc/care')).status).toBe(401);
  });
});

describe.skipIf(!dbTestsEnabled)('care endpoints with a test database', () => {
  let A;
  let B;
  const save = async (agent, name, extra) => (await agent.post('/api/plants').send(plantBody(name, extra)).expect(201)).body.plant.id;

  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all(['User', 'Plant', 'Planter'].map((m) => mongoose.model(m).syncIndexes()));
    await SpeciesCache.syncIndexes();
    A = request.agent(app);
    B = request.agent(app);
    await A.post('/api/auth/signup').send({ email: 'a@example.com', password: 'password123' }).expect(201);
    await B.post('/api/auth/signup').send({ email: 'b@example.com', password: 'password123' }).expect(201);
    await seed('Foo bar', 'found', dataOf({ poisonousToPets: true }));
    await seed('Frequent one', 'found', dataOf({ watering: 'Frequent' }));
    await seed('Minimum one', 'found', dataOf({ watering: 'Minimum' }));
    await seed('Ghost plant', 'not_found');
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(() => generateCarePlan.mockClear());

  it('another user gets 404 on both endpoints and nothing is spent', async () => {
    const id = await save(A, 'Foo bar');
    expect((await B.get(`/api/plants/${id}/care`)).status).toBe(404);
    expect((await B.post(`/api/plants/${id}/care`)).status).toBe(404);
    expect(generateCarePlan).not.toHaveBeenCalled();
    expect((await A.get(`/api/plants/${id}/care`)).body.care.status).toBe('none'); // owner's plant untouched
    expect((await A.get('/api/plants/not-an-id/care')).status).toBe(404);
  });

  it('GET before generating reads only: status none, warnings from cached data, no LLM call', async () => {
    const id = await save(A, 'Foo bar');
    const { care } = (await A.get(`/api/plants/${id}/care`).expect(200)).body;
    expect(care).toMatchObject({ status: 'none', plan: null, stale: false });
    expect(care.warnings.map((w) => w.code)).toEqual(['PET_TOXIC']);
    expect(generateCarePlan).not.toHaveBeenCalled();
  });

  it('POST generates once and is idempotent: the second POST costs nothing', async () => {
    const id = await save(A, 'Foo bar');
    const first = (await A.post(`/api/plants/${id}/care`).expect(200)).body.care;
    expect(first).toMatchObject({ status: 'ready', stale: false, generating: false });
    expect(first.plan.summary).toBe('תוכנית');
    const second = (await A.post(`/api/plants/${id}/care`).expect(200)).body.care;
    expect(second.plan).toEqual(first.plan);
    expect(generateCarePlan).toHaveBeenCalledTimes(1);
    const doc = await mongoose.model('Plant').findById(id);
    expect(doc.care).toMatchObject({ model: 'claude-haiku-5-5', inputTokens: 100, outputTokens: 50 });
    expect(doc.care.generatingSince).toBeNull();
  });

  it('marks the plan stale after a placement change, keeps it visible, and regenerates on POST', async () => {
    const id = await save(A, 'Foo bar');
    await A.post(`/api/plants/${id}/care`).expect(200);
    await A.patch(`/api/plants/${id}`).send({ placement: { location: 'indoor', lightLevel: 'low' } }).expect(200);
    const stale = (await A.get(`/api/plants/${id}/care`)).body.care;
    expect(stale).toMatchObject({ status: 'ready', stale: true });
    expect(stale.plan).not.toBeNull();
    // renaming does not make it stale
    await A.patch(`/api/plants/${id}`).send({ name: 'New name' }).expect(200);
    expect((await A.get(`/api/plants/${id}/care`)).body.care.stale).toBe(true);
    generateCarePlan.mockClear();
    const fresh = (await A.post(`/api/plants/${id}/care`).expect(200)).body.care;
    expect(generateCarePlan).toHaveBeenCalledTimes(1);
    expect(fresh.stale).toBe(false);
  });

  it('stores no_data and makes no LLM call for a plant without care data', async () => {
    const id = await save(A, 'Ghost plant');
    const { care } = (await A.post(`/api/plants/${id}/care`).expect(200)).body;
    expect(care).toMatchObject({ status: 'no_data', plan: null });
    expect(generateCarePlan).not.toHaveBeenCalled();
  });

  it('lets exactly one of several simultaneous POSTs call the LLM', async () => {
    const D = request.agent(app); // a fresh user: A has already used the small test allowance
    await D.post('/api/auth/signup').send({ email: 'd@example.com', password: 'password123' }).expect(201);
    const id = await save(D, 'Foo bar');
    const results = await Promise.all(Array.from({ length: 4 }, () => D.post(`/api/plants/${id}/care`)));
    expect(generateCarePlan).toHaveBeenCalledTimes(1);
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    for (const r of results.filter((x) => x.status !== 200)) expect(r.body.error.code).toBe('CARE_IN_PROGRESS');
    expect((await mongoose.model('Plant').findById(id)).care.generatingSince).toBeNull();
  });

  it('releases the lock when the LLM fails, so a retry works', async () => {
    const id = await save(B, 'Foo bar');
    const { AppError } = await import('../src/errors.js');
    generateCarePlan.mockRejectedValueOnce(new AppError('LLM_UNAVAILABLE'));
    const failed = await B.post(`/api/plants/${id}/care`);
    expect(failed.status).toBe(502);
    expect((await B.post(`/api/plants/${id}/care`)).status).toBe(200);
  });

  it('blocks with a Hebrew 429 at the daily LLM limit, per user', async () => {
    const C = request.agent(app);
    await C.post('/api/auth/signup').send({ email: 'c@example.com', password: 'password123' }).expect(201);
    const ids = [];
    for (let i = 0; i < 4; i += 1) ids.push(await save(C, 'Foo bar'));
    for (let i = 0; i < 3; i += 1) await C.post(`/api/plants/${ids[i]}/care`).expect(200);
    const blocked = await C.post(`/api/plants/${ids[3]}/care`);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('LLM_DAILY_LIMIT');
    expect(blocked.body.error.message).toMatch(/[א-ת]/);
    expect((await mongoose.model('Plant').findById(ids[3])).care.generatingSince).toBeNull();
  });

  it('warns about planter-mates whose watering needs differ, using only the user\'s own plants', async () => {
    const planter = (await A.post('/api/planters').send({ name: 'Box' }).expect(201)).body.planter.id;
    const thirsty = await save(A, 'Frequent one', { planterId: planter });
    await save(A, 'Minimum one', { planterId: planter, name: 'Cactus' });
    const { care } = (await A.get(`/api/plants/${thirsty}/care`)).body;
    expect(care.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PLANTER_WATERING', mate: 'Cactus' })]));
    // B has a plant with the same species but no planter: nothing leaks across users
    const bId = await save(B, 'Frequent one');
    expect((await B.get(`/api/plants/${bId}/care`)).body.care.warnings).toEqual([]);
  });
});
