import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test-secret-not-for-production';
const { app } = await import('../src/app.js');
const { validateSettings } = await import('../src/services/user.service.js');

const TEST_URI = process.env.MONGODB_TEST_URI;
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);

describe('validateSettings (no database needed)', () => {
  it('accepts valid values and trims the city', () => {
    expect(validateSettings({ city: '  Tel Aviv ', timezone: 'Asia/Jerusalem', notificationChannel: 'telegram' }))
      .toEqual({ city: 'Tel Aviv', timezone: 'Asia/Jerusalem', notificationChannel: 'telegram' });
  });

  it.each([
    [{ timezone: 'Mars/Phobos' }],
    [{ notificationChannel: 'pigeon' }],
    [{ city: 'x'.repeat(61) }],
    [{ city: 123 }],
  ])('rejects %j', (input) => {
    expect(() => validateSettings(input)).toThrow();
  });

  it('accepts a reminder time and rejects a bad one', () => {
    expect(validateSettings({ reminderTime: '08:30' })).toEqual({ reminderTime: '08:30' });
    for (const bad of ['25:00', '8:30', 'noon', 830, null]) expect(() => validateSettings({ reminderTime: bad })).toThrow();
  });

  it('ignores fields that are not editable (mass-assignment protection)', () => {
    const out = validateSettings({ city: 'Haifa', isDemo: true, passwordHash: 'x', channelAddress: '999', userId: 'other' });
    expect(out).toEqual({ city: 'Haifa' });
  });
});

describe('PATCH /api/me without login', () => {
  it('returns 401', async () => {
    const res = await request(app).patch('/api/me').send({ city: 'Haifa' });
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!dbTestsEnabled)('settings with a test database', () => {
  const a = { email: 'a@example.com', password: 'password123' };
  const b = { email: 'b@example.com', password: 'password123' };
  let agentA;
  let agentB;
  let idB;

  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await mongoose.model('User').syncIndexes();
    agentA = request.agent(app);
    agentB = request.agent(app);
    await agentA.post('/api/auth/signup').send(a).expect(201);
    idB = (await agentB.post('/api/auth/signup').send(b).expect(201)).body.user.id;
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('updates the settings of the logged-in user', async () => {
    const res = await agentA.patch('/api/me').send({ city: 'Haifa', timezone: 'Asia/Jerusalem', notificationChannel: 'telegram' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ city: 'Haifa', notificationChannel: 'telegram' });
    const me = await agentA.get('/api/auth/me');
    expect(me.body.user.city).toBe('Haifa');
  });

  it('defaults the reminder time to 09:00, saves a chosen one per user, and rejects a bad one', async () => {
    expect((await agentB.get('/api/auth/me')).body.user.reminderTime).toBe('09:00');
    const res = await agentA.patch('/api/me').send({ reminderTime: '07:15' });
    expect(res.status).toBe(200);
    expect(res.body.user.reminderTime).toBe('07:15');
    expect((await agentA.get('/api/auth/me')).body.user.reminderTime).toBe('07:15');
    expect((await agentB.get('/api/auth/me')).body.user.reminderTime).toBe('09:00'); // B is untouched
    expect((await agentA.patch('/api/me').send({ reminderTime: '25:00' })).status).toBe(400);
  });

  it('rejects invalid values with 400', async () => {
    const res = await agentA.patch('/api/me').send({ timezone: 'Mars/Phobos' });
    expect(res.status).toBe(400);
  });

  it("user A cannot change user B's settings, even by sending B's id", async () => {
    await agentA.patch('/api/me').send({ userId: idB, id: idB, _id: idB, city: 'HACKED' }).expect(200);
    const meB = await agentB.get('/api/auth/me');
    expect(meB.body.user.city).toBe('');
  });

  it('cannot make itself a demo user or set a channel address', async () => {
    const res = await agentA.patch('/api/me').send({ isDemo: true, channelAddress: '123' });
    expect(res.body.user.isDemo).toBe(false);
  });
});
