import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test-secret-not-for-production';
const { app } = await import('../src/app.js');
const { validatePlacement } = await import('../src/services/plant.service.js');

const TEST_URI = process.env.MONGODB_TEST_URI;
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);

const mint = {
  name: 'Mint',
  species: { scientificName: 'Mentha spicata', commonNames: ['Spearmint'] },
  identificationSource: 'candidate',
  identificationConfidence: 0.9,
  referenceImageUrl: 'https://example.com/m.jpg',
  placement: { location: 'balcony', sunExposure: 'full', potSizeNotes: 'big box' },
};

describe('validatePlacement (no database needed)', () => {
  it('accepts valid indoor and balcony placements', () => {
    expect(validatePlacement({ location: 'indoor', windowDirection: 'S', lightLevel: 'high' }))
      .toEqual({ location: 'indoor', windowDirection: 'S', lightLevel: 'high' });
    expect(validatePlacement({ location: 'balcony', sunExposure: 'shade' })).toEqual({ location: 'balcony', sunExposure: 'shade' });
  });
  it.each([
    [{ location: 'garden' }],
    [{ location: 'indoor', sunExposure: 'full' }],
    [{ location: 'balcony', windowDirection: 'N' }],
    [{ location: 'indoor', lightLevel: 'blinding' }],
    [null],
  ])('rejects %j', (p) => {
    expect(() => validatePlacement(p)).toThrow();
  });
});

describe('plants without login', () => {
  it.each([['get', '/api/plants'], ['post', '/api/plants'], ['patch', '/api/plants/abc'], ['delete', '/api/plants/abc'],
    ['get', '/api/planters'], ['post', '/api/planters']])('%s %s returns 401', async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!dbTestsEnabled)('plants and planters with a test database', () => {
  let A;
  let B;
  let idA;
  let idB;
  let planterB;
  let plantB;

  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all(['User', 'Plant', 'Planter'].map((m) => mongoose.model(m).syncIndexes()));
    A = request.agent(app);
    B = request.agent(app);
    idA = (await A.post('/api/auth/signup').send({ email: 'a@example.com', password: 'password123' }).expect(201)).body.user.id;
    idB = (await B.post('/api/auth/signup').send({ email: 'b@example.com', password: 'password123' }).expect(201)).body.user.id;
    planterB = (await B.post('/api/planters').send({ name: 'B box' }).expect(201)).body.planter.id;
    plantB = (await B.post('/api/plants').send({ ...mint, name: 'B mint' }).expect(201)).body.plant.id;
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('saves a plant in the caller\'s own planter and lists it', async () => {
    const planter = (await A.post('/api/planters').send({ name: 'Balcony box', sunExposure: 'partial' }).expect(201)).body.planter;
    const res = await A.post('/api/plants').send({ ...mint, planterId: planter.id });
    expect(res.status).toBe(201);
    expect(res.body.plant).toMatchObject({ name: 'Mint', planterId: planter.id });
    expect(JSON.stringify(res.body)).not.toMatch(/userId/);
    const list = await A.get('/api/plants');
    expect(list.body.plants).toHaveLength(1);
  });

  it('defaults the name to the common name', async () => {
    const { name, ...noName } = mint;
    const res = await A.post('/api/plants').send(noName);
    expect(res.body.plant.name).toBe('Spearmint');
  });

  it('rejects invalid placement, a manual plant with confidence rules, and http image urls', async () => {
    await A.post('/api/plants').send({ ...mint, placement: { location: 'indoor', sunExposure: 'full' } }).expect(400);
    await A.post('/api/plants').send({ ...mint, identificationConfidence: 5 }).expect(400);
    await A.post('/api/plants').send({ ...mint, referenceImageUrl: 'http://insecure.example/x.jpg' }).expect(400);
    const manual = await A.post('/api/plants').send({ ...mint, identificationSource: 'manual', identificationConfidence: undefined });
    expect(manual.status).toBe(201);
    expect(manual.body.plant.identificationConfidence).toBeNull();
  });

  it('rejects a planter on an indoor plant', async () => {
    const [planter] = (await A.get('/api/planters')).body.planters;
    await A.post('/api/plants').send({ ...mint, placement: { location: 'indoor' }, planterId: planter.id }).expect(400);
  });

  it('edits name and placement, and clears the planter when moved indoors', async () => {
    const [planter] = (await A.get('/api/planters')).body.planters;
    const created = (await A.post('/api/plants').send({ ...mint, planterId: planter.id }).expect(201)).body.plant;
    const res = await A.patch(`/api/plants/${created.id}`).send({ name: 'Kitchen mint', placement: { location: 'indoor', windowDirection: 'S' } });
    expect(res.status).toBe(200);
    expect(res.body.plant).toMatchObject({ name: 'Kitchen mint', planterId: null });
    expect(res.body.plant.placement).toEqual({ location: 'indoor', windowDirection: 'S' });
  });

  it('cannot change the species or the owner through an edit', async () => {
    const [mine] = (await A.get('/api/plants')).body.plants;
    const res = await A.patch(`/api/plants/${mine.id}`).send({ species: { scientificName: 'Hacked' }, userId: idB });
    expect(res.status).toBe(200);
    expect(res.body.plant.species.scientificName).toBe('Mentha spicata');
    expect((await B.get('/api/plants')).body.plants.map((p) => p.id)).not.toContain(mine.id);
  });

  // ---- cross-user safety (CLAUDE.md rule 10) ----
  it("A cannot see B's plants or planters", async () => {
    const plants = (await A.get('/api/plants')).body.plants.map((p) => p.id);
    expect(plants).not.toContain(plantB);
    const planters = (await A.get('/api/planters')).body.planters.map((p) => p.id);
    expect(planters).not.toContain(planterB);
  });

  it("A cannot edit or delete B's plant (404, and B's plant is unchanged)", async () => {
    await A.patch(`/api/plants/${plantB}`).send({ name: 'HACKED' }).expect(404);
    await A.delete(`/api/plants/${plantB}`).expect(404);
    const bPlants = (await B.get('/api/plants')).body.plants;
    expect(bPlants.find((p) => p.id === plantB).name).toBe('B mint');
  });

  it("A cannot put a plant into B's planter, on create or on edit", async () => {
    await A.post('/api/plants').send({ ...mint, planterId: planterB }).expect(404);
    const [mine] = (await A.get('/api/plants')).body.plants;
    await A.patch(`/api/plants/${mine.id}`).send({ placement: { location: 'balcony' }, planterId: planterB }).expect(404);
  });

  it('a userId in the body is ignored: the plant is saved under the caller', async () => {
    const res = await A.post('/api/plants').send({ ...mint, userId: idB }).expect(201);
    expect((await B.get('/api/plants')).body.plants.map((p) => p.id)).not.toContain(res.body.plant.id);
    expect((await A.get('/api/plants')).body.plants.map((p) => p.id)).toContain(res.body.plant.id);
  });

  it('a malformed id returns 404, and deleting your own plant works', async () => {
    await A.delete('/api/plants/not-an-id').expect(404);
    const [mine] = (await A.get('/api/plants')).body.plants;
    await A.delete(`/api/plants/${mine.id}`).expect(204);
    await A.delete(`/api/plants/${mine.id}`).expect(404);
  });

  it('enforces the per-user plant cap', async () => {
    const Plant = mongoose.model('Plant');
    const have = await Plant.countDocuments({ userId: idA });
    const filler = Array.from({ length: 100 - have }, () => ({
      userId: idA, name: 'x', species: { scientificName: 'x' }, identificationSource: 'manual', placement: { location: 'indoor' },
    }));
    await Plant.insertMany(filler);
    const res = await A.post('/api/plants').send(mint);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LIMIT_REACHED');
  });
});
