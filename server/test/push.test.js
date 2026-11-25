import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

// web-push is mocked: these tests never contact Apple, Google or anyone else.
// Same shape as the real package: named exports only (web-push 4 has no default export).
vi.mock('web-push', () => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => ({ statusCode: 201 })) }));

process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.VAPID_PUBLIC_KEY = 'BPublicKeyForTestsOnly_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
process.env.VAPID_PRIVATE_KEY = 'private-key-for-tests-only';
process.env.VAPID_SUBJECT = 'https://example.com/contact';
vi.setConfig({ testTimeout: 60000 }); // the test database is remote
const webpush = await import('web-push');
const { app } = await import('../src/app.js');
const { config } = await import('../src/config.js');
const { isAllowedEndpoint, validateSubscription, sendToUser, MAX_DEVICES } = await import('../src/services/push.service.js');
const { runReminders } = await import('../src/services/scheduler.service.js');
const { PushSubscription } = await import('../src/models/pushSubscription.model.js');
const { User } = await import('../src/models/user.model.js');
const { Plant } = await import('../src/models/plant.model.js');
const { Reminder } = await import('../src/models/reminder.model.js');

const TEST_URI = process.env.MONGODB_TEST_URI;
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);
const KEY = 'abcdefghijklmnopqrstuvwxyz0123456789_-ABCDEFG';

describe('isAllowedEndpoint (no database needed)', () => {
  it.each([
    ['https://web.push.apple.com/QGxyz', true],
    ['https://fcm.googleapis.com/fcm/send/abc', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/abc', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=abc', true],
    ['http://web.push.apple.com/x', false], // not https
    ['https://evil.example.com/x', false],
    ['https://push.apple.com.evil.com/x', false], // look-alike host
    ['https://notpush.apple.com.attacker.io/x', false],
    ['https://localhost/x', false],
    ['https://127.0.0.1/x', false],
    ['https://169.254.169.254/latest/meta-data', false], // a cloud metadata address
    ['https://user:pw@web.push.apple.com/x', false],
    ['https://web.push.apple.com:8443/x', false],
    ['not a url', false],
    [`https://web.push.apple.com/${'a'.repeat(1000)}`, false],
    [null, false],
    [42, false],
  ])('%s -> %s', (endpoint, ok) => {
    expect(isAllowedEndpoint(endpoint)).toBe(ok);
  });

  it('validateSubscription needs a good endpoint and both keys', () => {
    const good = { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: KEY, auth: KEY } };
    expect(validateSubscription({ ...good, extra: 'ignored' })).toEqual(good);
    for (const bad of [null, {}, { ...good, keys: {} }, { ...good, keys: { p256dh: KEY } }, { ...good, keys: { p256dh: 'bad key!', auth: KEY } }, { ...good, endpoint: 'https://evil.com/x' }]) {
      expect(() => validateSubscription(bad)).toThrow();
    }
  });
});

describe('the real web-push package (not the mock)', () => {
  it('has the named functions we call, and accepts keys and our subject', async () => {
    const real = await vi.importActual('web-push');
    expect(typeof real.sendNotification).toBe('function');
    expect(typeof real.setVapidDetails).toBe('function');
    const keys = real.generateVAPIDKeys();
    expect(() => real.setVapidDetails('https://github.com/itay-moyal/Planeta', keys.publicKey, keys.privateKey)).not.toThrow();
    expect(() => real.setVapidDetails('not a url', keys.publicKey, keys.privateKey)).toThrow(); // a bad subject is refused
  });
});

describe('push routes without login', () => {
  it.each([['get', '/api/push/status'], ['post', '/api/push/subscribe'], ['delete', '/api/push/subscribe'], ['post', '/api/push/test']])('%s %s returns 401', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });
});

describe.skipIf(!dbTestsEnabled)('web push with a test database', () => {
  let A;
  let B;
  const sub = (n) => ({ endpoint: `https://web.push.apple.com/device-${n}`, keys: { p256dh: KEY, auth: KEY } });
  const channelOf = async (email) => (await User.findOne({ email })).notificationChannel;

  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all([User, PushSubscription, Plant, Reminder].map((m) => m.syncIndexes()));
    A = request.agent(app);
    B = request.agent(app);
    await A.post('/api/auth/signup').send({ email: 'a@example.com', password: 'password123' }).expect(201);
    await B.post('/api/auth/signup').send({ email: 'b@example.com', password: 'password123' }).expect(201);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    webpush.sendNotification.mockClear();
    webpush.sendNotification.mockImplementation(async () => ({ statusCode: 201 }));
    await PushSubscription.deleteMany({});
    await User.updateMany({}, { notificationChannel: 'email' });
  });

  it('status: the public key, and how many devices the user has (only their own)', async () => {
    await A.post('/api/push/subscribe').send(sub(1)).expect(201);
    const a = (await A.get('/api/push/status').expect(200)).body;
    expect(a).toMatchObject({ configured: true, publicKey: process.env.VAPID_PUBLIC_KEY, devices: 1 });
    expect(JSON.stringify(a)).not.toContain(process.env.VAPID_PRIVATE_KEY);
    expect((await B.get('/api/push/status')).body.devices).toBe(0);
  });

  it('subscribing saves the device, makes push the channel, and is idempotent', async () => {
    expect((await A.post('/api/push/subscribe').send(sub(1)).expect(201)).body.devices).toBe(1);
    expect((await A.post('/api/push/subscribe').send(sub(1)).expect(201)).body.devices).toBe(1);
    expect((await A.post('/api/push/subscribe').send(sub(2)).expect(201)).body.devices).toBe(2);
    expect(await channelOf('a@example.com')).toBe('push');
    expect(await channelOf('b@example.com')).toBe('email');
  });

  it.each([[{}], [{ endpoint: 'https://evil.example.com/x', keys: { p256dh: KEY, auth: KEY } }], [{ endpoint: 'https://web.push.apple.com/x' }]])('rejects the subscription %j', async (body) => {
    expect((await A.post('/api/push/subscribe').send(body)).status).toBe(400);
    expect(await PushSubscription.countDocuments({})).toBe(0);
  });

  it('limits the number of devices per user', async () => {
    for (let i = 0; i < MAX_DEVICES; i += 1) await A.post('/api/push/subscribe').send(sub(i)).expect(201);
    expect((await A.post('/api/push/subscribe').send(sub(99))).status).toBe(409);
    await A.post('/api/push/subscribe').send(sub(0)).expect(201); // an existing device can still re-register
  });

  it('a device that changes hands moves to the new user, and the old user falls back to email', async () => {
    await A.post('/api/push/subscribe').send(sub(1)).expect(201);
    await B.post('/api/push/subscribe').send(sub(1)).expect(201);
    expect((await A.get('/api/push/status')).body.devices).toBe(0);
    expect((await B.get('/api/push/status')).body.devices).toBe(1);
    expect(await channelOf('a@example.com')).toBe('email');
    expect(await channelOf('b@example.com')).toBe('push');
  });

  it("another user cannot remove someone's device; removing your last one falls back to email", async () => {
    await A.post('/api/push/subscribe').send(sub(1)).expect(201);
    await B.delete('/api/push/subscribe').send({ endpoint: sub(1).endpoint }).expect(200);
    expect((await A.get('/api/push/status')).body.devices).toBe(1); // untouched
    expect(await channelOf('a@example.com')).toBe('push');
    await A.delete('/api/push/subscribe').send({ endpoint: sub(1).endpoint }).expect(200);
    expect(await channelOf('a@example.com')).toBe('email');
    expect((await A.delete('/api/push/subscribe').send({})).status).toBe(400);
  });

  it('the test notification goes only to the caller\'s devices, with a minimal payload', async () => {
    await A.post('/api/push/subscribe').send(sub(1)).expect(201);
    await A.post('/api/push/subscribe').send(sub(2)).expect(201);
    await B.post('/api/push/subscribe').send(sub(3)).expect(201);
    const res = await A.post('/api/push/test').expect(200);
    expect(res.body.delivered).toBe(2);
    const targets = webpush.sendNotification.mock.calls.map((c) => c[0].endpoint).sort();
    expect(targets).toEqual([sub(1).endpoint, sub(2).endpoint]);
    const [, payload, options] = webpush.sendNotification.mock.calls[0];
    expect(Object.keys(JSON.parse(payload)).sort()).toEqual(['body', 'title', 'url']);
    expect(options).toMatchObject({ TTL: 6 * 3600 });
  });

  it('the test notification says so when there is no device', async () => {
    const res = await A.post('/api/push/test');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PUSH_NO_DEVICE');
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('removes a device the push service says is gone (410 and 404) and keeps the rest', async () => {
    await A.post('/api/push/subscribe').send(sub(1)).expect(201);
    await A.post('/api/push/subscribe').send(sub(2)).expect(201);
    await A.post('/api/push/subscribe').send(sub(3)).expect(201);
    webpush.sendNotification.mockImplementation(async (s) => {
      if (s.endpoint === sub(1).endpoint) throw Object.assign(new Error('gone'), { statusCode: 410 });
      if (s.endpoint === sub(2).endpoint) throw Object.assign(new Error('missing'), { statusCode: 404 });
      return { statusCode: 201 };
    });
    expect((await A.post('/api/push/test').expect(200)).body.delivered).toBe(1);
    expect((await PushSubscription.find({})).map((s) => s.endpoint)).toEqual([sub(3).endpoint]);
  });

  it('a temporary push failure is an error, and keeps the device', async () => {
    await A.post('/api/push/subscribe').send(sub(1)).expect(201);
    webpush.sendNotification.mockRejectedValue(Object.assign(new Error('server error with secret details'), { statusCode: 500 }));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await A.post('/api/push/test');
    errors.mockRestore();
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/secret details/);
    expect(await PushSubscription.countDocuments({})).toBe(1);
  });

  it('does nothing without VAPID keys', async () => {
    const user = await User.findOne({ email: 'a@example.com' });
    await PushSubscription.create({ userId: user._id, endpoint: sub(1).endpoint, keys: sub(1).keys });
    const saved = config.vapidPrivateKey;
    config.vapidPrivateKey = '';
    try {
      await expect(sendToUser(user._id, { title: 't', body: 'b', url: '/' })).rejects.toMatchObject({ code: 'PUSH_UNAVAILABLE' });
      expect(webpush.sendNotification).not.toHaveBeenCalled();
      expect((await A.get('/api/push/status')).body).toMatchObject({ configured: false, publicKey: '' });
    } finally {
      config.vapidPrivateKey = saved;
    }
  });

  describe('as the reminder channel', () => {
    const NOW = new Date('2026-01-15T07:00:00Z'); // 09:00 in Jerusalem
    const mkPlant = (userId, name) => Plant.create({
      userId, name, species: { scientificName: 'Foo bar' }, identificationSource: 'manual', placement: { location: 'indoor' },
      watering: { intervalDays: 7, intervalSource: 'user', nextDueAt: new Date(NOW.getTime() - 3600000) },
    });
    beforeEach(async () => { await Promise.all([Plant.deleteMany({}), Reminder.deleteMany({})]); });

    it('the scheduler sends the batched reminder as a push, without any personal data', async () => {
      await A.post('/api/push/subscribe').send(sub(1)).expect(201);
      const user = await User.findOne({ email: 'a@example.com' });
      await mkPlant(user._id, 'מנטה');
      await mkPlant(user._id, 'בזיליקום');
      const result = await runReminders({ now: NOW });
      expect(result[user._id.toString()]).toBe('sent');
      expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(webpush.sendNotification.mock.calls[0][1]);
      expect(payload).toEqual({ title: 'Planeta', body: 'הגיע הזמן להשקות 2 צמחים: מנטה, בזיליקום', url: '/due' });
      expect(JSON.stringify(webpush.sendNotification.mock.calls[0])).not.toMatch(/a@example\.com|test-secret/);
      await runReminders({ now: NOW }); // same day: nothing more
      expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('a user on push with no device left is recorded as failed (nothing delivered, nothing sent)', async () => {
      const user = await User.findOne({ email: 'b@example.com' });
      await User.updateOne({ _id: user._id }, { notificationChannel: 'push' });
      await mkPlant(user._id, 'p');
      const result = await runReminders({ now: NOW });
      expect(result[user._id.toString()]).toBe('failed');
      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });
  });
});
