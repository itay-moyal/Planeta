import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

// Pl@ntNet is mocked: these tests must never spend the real daily quota.
vi.mock('../src/services/plantnet.service.js', () => ({
  identifyPlant: vi.fn(async () => ({
    candidates: [{ scientificName: 'Mentha spicata', commonNames: [], family: null, score: 0.9, referenceImages: [] }],
    remainingIdentificationRequests: 1,
  })),
}));

// Set before the app is imported: the config is read once at startup.
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.USER_DAILY_IDENTIFY_LIMIT = '2';
const { app } = await import('../src/app.js');
const { identifyPlant } = await import('../src/services/plantnet.service.js');
const { AppError } = await import('../src/errors.js');

const TEST_URI = process.env.MONGODB_TEST_URI;
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);
const photo = { filename: 'p.jpg', contentType: 'image/jpeg' };
const img = Buffer.from('fake-jpeg-bytes');

async function newUser(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/signup').send({ email, password: 'password123' }).expect(201);
  return agent;
}
const identify = (agent) => agent.post('/api/identify').attach('image', img, photo);
const countOf = async (email) => (await mongoose.model('User').findOne({ email })).usage.identifications;

describe.skipIf(!dbTestsEnabled)('per-user daily identification limit', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await mongoose.model('User').syncIndexes();
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('blocks a user after the limit, with a Hebrew message, without affecting another user', async () => {
    const a = await newUser('a@example.com');
    const b = await newUser('b@example.com');
    await identify(a).expect(200);
    await identify(a).expect(200);
    const blocked = await identify(a);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('DAILY_LIMIT');
    expect(blocked.body.error.message).toMatch(/[א-ת]/);
    await identify(b).expect(200); // B has their own allowance
  });

  it('lets exactly the limit through when requests arrive at the same time', async () => {
    const c = await newUser('c@example.com');
    const results = await Promise.all(Array.from({ length: 5 }, () => identify(c)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 429, 429, 429]);
    expect(await countOf('c@example.com')).toBe(2);
  });

  it('starts a fresh count on a new day', async () => {
    const d = await newUser('d@example.com');
    await identify(d).expect(200);
    await identify(d).expect(200);
    await identify(d).expect(429);
    await mongoose.model('User').updateOne({ email: 'd@example.com' }, { 'usage.day': '2000-01-01' });
    await identify(d).expect(200);
    expect(await countOf('d@example.com')).toBe(1);
  });

  it('does not count an upload that is rejected before identification', async () => {
    const e = await newUser('e@example.com');
    const bad = await e.post('/api/identify').attach('image', img, { filename: 'x.txt', contentType: 'text/plain' });
    expect(bad.status).toBe(415);
    expect(await countOf('e@example.com')).toBe(0);
  });

  it('counts a request even when Pl@ntNet then fails (credits may be spent)', async () => {
    const f = await newUser('f@example.com');
    identifyPlant.mockRejectedValueOnce(new AppError('UPSTREAM_FAILED'));
    await identify(f).expect(502);
    expect(await countOf('f@example.com')).toBe(1);
  });
});
