import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

// Pl@ntNet is mocked: these tests must never spend the real daily quota.
vi.mock('../src/services/plantnet.service.js', () => ({
  identifyPlant: vi.fn(async () => ({
    candidates: [
      { scientificName: 'Mentha spicata', commonNames: ['Spearmint'], family: 'Lamiaceae', score: 0.87, referenceImages: [] },
      { scientificName: 'Mentha x piperita', commonNames: [], family: 'Lamiaceae', score: 0.05, referenceImages: [] },
    ],
    remainingIdentificationRequests: 42,
  })),
}));

process.env.JWT_SECRET = 'test-secret-not-for-production';
const { app } = await import('../src/app.js');

const TEST_URI = process.env.MONGODB_TEST_URI;
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);
const photo = { filename: 'p.jpg', contentType: 'image/jpeg' };
const jpg = Buffer.from('fake-jpeg-bytes');

describe('claim without login', () => {
  it('returns 401', async () => {
    const res = await request(app).post('/api/identify/claim');
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!dbTestsEnabled)('visitor gate with a test database', () => {
  let U1;
  let U2;

  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all(['User', 'PendingIdentification'].map((m) => mongoose.model(m).syncIndexes()));
    U1 = request.agent(app);
    U2 = request.agent(app);
    await U1.post('/api/auth/signup').send({ email: 'u1@example.com', password: 'password123' }).expect(201);
    await U2.post('/api/auth/signup').send({ email: 'u2@example.com', password: 'password123' }).expect(201);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('a visitor gets only a teaser: no species, no names, no quota info in the response', async () => {
    const res = await request(app).post('/api/identify').attach('image', jpg, photo);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ teaser: { found: true, topScore: 0.87 } });
    const raw = JSON.stringify(res.body) + JSON.stringify(res.headers);
    expect(raw).not.toMatch(/Mentha|Spearmint|Lamiaceae|remainingIdentificationRequests/i);
    expect(res.headers['set-cookie'][0]).toMatch(/planeta_pending=/);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
  });

  it('stores only a hash of the token, never the token itself', async () => {
    const res = await request(app).post('/api/identify').attach('image', jpg, photo);
    const token = /planeta_pending=([0-9a-f]+)/.exec(res.headers['set-cookie'][0])[1];
    const docs = await mongoose.model('PendingIdentification').find({}).lean();
    expect(docs.length).toBeGreaterThan(0);
    expect(JSON.stringify(docs)).not.toContain(token);
  });

  it('after signing up, the visitor claims the real candidates exactly once', async () => {
    const visitor = request.agent(app);
    await visitor.post('/api/identify').attach('image', jpg, photo).expect(200);
    await visitor.post('/api/auth/signup').send({ email: 'new@example.com', password: 'password123' }).expect(201);
    const first = await visitor.post('/api/identify/claim');
    expect(first.status).toBe(200);
    expect(first.body.candidates[0].scientificName).toBe('Mentha spicata');
    const second = await visitor.post('/api/identify/claim');
    expect(second.status).toBe(404);
    expect(second.body.error.code).toBe('PENDING_EXPIRED');
  });

  it("another user cannot claim someone else's result, and a forged token fails", async () => {
    const visitor = await request.agent(app);
    await visitor.post('/api/identify').attach('image', jpg, photo).expect(200);
    // U1 has no pending cookie of their own
    await U1.post('/api/identify/claim').expect(404);
    // forged 64-char token
    await U1.post('/api/identify/claim').set('Cookie', `planeta_pending=${'a'.repeat(64)}`).expect(404);
  });

  it('an expired (deleted) result cannot be claimed', async () => {
    const visitor = request.agent(app);
    await visitor.post('/api/identify').attach('image', jpg, photo).expect(200);
    await mongoose.model('PendingIdentification').deleteMany({});
    await visitor.post('/api/auth/signup').send({ email: 'late@example.com', password: 'password123' }).expect(201);
    const res = await visitor.post('/api/identify/claim');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/[א-ת]/);
  });

  it('a logged-in user gets the real candidates directly, with nothing held', async () => {
    const before = await mongoose.model('PendingIdentification').countDocuments();
    const res = await U2.post('/api/identify').attach('image', jpg, photo);
    expect(res.status).toBe(200);
    expect(res.body.candidates[0].scientificName).toBe('Mentha spicata');
    expect(await mongoose.model('PendingIdentification').countDocuments()).toBe(before);
  });
});
