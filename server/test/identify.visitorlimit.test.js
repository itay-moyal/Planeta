import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

vi.mock('../src/services/plantnet.service.js', () => ({
  identifyPlant: vi.fn(async () => ({
    candidates: [{ scientificName: 'Mentha spicata', commonNames: [], family: null, score: 0.9, referenceImages: [] }],
    remainingIdentificationRequests: 1,
  })),
}));

// Set before the app is imported: the limiter reads the config once at startup.
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.VISITOR_DAILY_LIMIT = '2';
const { app } = await import('../src/app.js');

const TEST_URI = process.env.MONGODB_TEST_URI;
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);
const photo = { filename: 'p.jpg', contentType: 'image/jpeg' };

describe.skipIf(!dbTestsEnabled)('visitor daily limit', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all(['User', 'PendingIdentification'].map((m) => mongoose.model(m).syncIndexes()));
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('stops a visitor after the daily limit, but never limits a logged-in user', async () => {
    const img = Buffer.from('x');
    await request(app).post('/api/identify').attach('image', img, photo).expect(200);
    await request(app).post('/api/identify').attach('image', img, photo).expect(200);
    const blocked = await request(app).post('/api/identify').attach('image', img, photo);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('VISITOR_LIMIT');
    expect(blocked.body.error.message).toMatch(/[א-ת]/);

    const user = request.agent(app);
    await user.post('/api/auth/signup').send({ email: 'lim@example.com', password: 'password123' }).expect(201);
    await user.post('/api/identify').attach('image', img, photo).expect(200);
  });
});
