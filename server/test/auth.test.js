import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test-secret-not-for-production';
const { app } = await import('../src/app.js');

const TEST_URI = process.env.MONGODB_TEST_URI;
// Safety: DB tests wipe collections, so only run against a database named "*test*".
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);

describe('requireAuth (no database needed)', () => {
  it('rejects a request without a cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a forged token', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'planeta_token=not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid signup before touching the database', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'bad', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});

describe.skipIf(!dbTestsEnabled)('auth with a test database', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await mongoose.model('User').syncIndexes();
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const creds = { email: 'A@Example.com', password: 'password123' };

  it('signs up, sets an httpOnly cookie and never returns the hash', async () => {
    const res = await request(app).post('/api/auth/signup').send(creds);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('a@example.com');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app).post('/api/auth/signup').send(creds);
    expect(res.status).toBe(409);
  });

  it('rejects a wrong password with the same error as an unknown email', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ ...creds, password: 'nope-nope-1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'password123' });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('logs in and /me returns the user from the cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send(creds).expect(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('a@example.com');
  });
});
