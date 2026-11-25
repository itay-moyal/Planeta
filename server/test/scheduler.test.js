import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';

vi.setConfig({ testTimeout: 60000 }); // the test database is remote
const { localClock, toMinutes, buildMessage, runReminders } = await import('../src/services/scheduler.service.js');
const { isValidReminderTime } = await import('../src/services/user.service.js');
const { User } = await import('../src/models/user.model.js');
const { Plant } = await import('../src/models/plant.model.js');
const { Reminder } = await import('../src/models/reminder.model.js');

const TEST_URI = process.env.MONGODB_TEST_URI;
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);

describe('localClock (no database needed)', () => {
  it.each([
    ['2026-01-15T06:30:00Z', 'Asia/Jerusalem', '2026-01-15', 8 * 60 + 30], // winter: UTC+2
    ['2026-07-15T06:30:00Z', 'Asia/Jerusalem', '2026-07-15', 9 * 60 + 30], // summer: UTC+3
    ['2026-01-15T06:30:00Z', 'America/New_York', '2026-01-15', 1 * 60 + 30], // UTC-5
    ['2026-01-15T23:30:00Z', 'Asia/Jerusalem', '2026-01-16', 1 * 60 + 30], // the local date moves on
    ['2026-01-15T22:00:00Z', 'UTC', '2026-01-15', 22 * 60],
    ['2026-01-15T22:00:00Z', 'Asia/Tokyo', '2026-01-16', 7 * 60], // UTC+9
  ])('%s in %s', (iso, tz, date, minutes) => {
    expect(localClock(new Date(iso), tz)).toEqual({ date, minutes });
  });

  it('reads midnight as 0, not 24', () => {
    expect(localClock(new Date('2026-01-15T00:00:00Z'), 'UTC').minutes).toBe(0);
  });
  it('throws for an invalid timezone (the scheduler skips that user)', () => {
    expect(() => localClock(new Date(), 'Mars/Phobos')).toThrow();
  });
});

describe('reminder time and message (no database needed)', () => {
  it.each([['00:00', true], ['08:30', true], ['23:59', true], ['24:00', false], ['8:30', false], ['09:60', false], ['', false], [830, false], [null, false]])(
    'reminder time %j valid: %s', (value, ok) => expect(isValidReminderTime(value)).toBe(ok));
  it('converts HH:MM to minutes', () => expect(toMinutes('08:30')).toBe(510));

  it('builds one short Hebrew message for any number of plants', () => {
    const p = (name) => ({ name });
    expect(buildMessage([p('מנטה')]).body).toBe('הגיע הזמן להשקות: מנטה');
    expect(buildMessage([p('א'), p('ב')]).body).toBe('הגיע הזמן להשקות 2 צמחים: א, ב');
    expect(buildMessage([p('א'), p('ב'), p('ג'), p('ד'), p('ה')]).body).toBe('הגיע הזמן להשקות 5 צמחים: א, ב, ג ועוד 2');
    expect(buildMessage([p('א')])).toMatchObject({ title: 'Planeta', url: '/due' });
  });
});

describe.skipIf(!dbTestsEnabled)('scheduler with a test database', () => {
  const channel = { name: 'fake', send: vi.fn(async () => {}) };
  const channelFor = () => channel;
  const JER_0900 = new Date('2026-01-15T07:00:00Z'); // 09:00 in Jerusalem (UTC+2)
  let counter = 0;

  const mkUser = (extra = {}) => User.create({ email: `u${(counter += 1)}@example.com`, passwordHash: 'x', ...extra });
  const mkPlant = (userId, name, dueAt) => Plant.create({
    userId, name, species: { scientificName: 'Foo bar' }, identificationSource: 'manual', placement: { location: 'indoor' },
    watering: { intervalDays: 7, intervalSource: 'user', nextDueAt: dueAt },
  });
  const hoursBefore = (date, h) => new Date(date.getTime() - h * 3600 * 1000);

  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all([User, Plant, Reminder].map((m) => m.syncIndexes()));
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    channel.send.mockClear();
    await Promise.all([User.deleteMany({}), Plant.deleteMany({}), Reminder.deleteMany({})]);
  });

  it('sends one batched message with the due plants, and records it', async () => {
    const u = await mkUser();
    const a = await mkPlant(u._id, 'מנטה', hoursBefore(JER_0900, 5));
    const b = await mkPlant(u._id, 'בזיליקום', hoursBefore(JER_0900, 2));
    await mkPlant(u._id, 'לא עכשיו', new Date(JER_0900.getTime() + 3 * 86400000)); // not due yet
    await Plant.create({ userId: u._id, name: 'בלי מרווח', species: { scientificName: 'X y' }, identificationSource: 'manual', placement: { location: 'indoor' } });

    const result = await runReminders({ now: JER_0900, channelFor });
    expect(result[u._id.toString()]).toBe('sent');
    expect(channel.send).toHaveBeenCalledTimes(1);
    const [recipient, message] = channel.send.mock.calls[0];
    expect(recipient).toEqual({ userId: u._id.toString() });
    expect(message.body).toBe('הגיע הזמן להשקות 2 צמחים: מנטה, בזיליקום');
    const row = await Reminder.findOne({ userId: u._id });
    expect(row).toMatchObject({ status: 'sent', localDate: '2026-01-15', channel: 'fake' });
    expect(row.plantIds.map(String)).toEqual([a._id, b._id].map(String));
  });

  it('waits for the reminder time, in the user\'s own timezone (default 09:00)', async () => {
    const u = await mkUser({ timezone: 'Asia/Jerusalem' });
    await mkPlant(u._id, 'p', hoursBefore(JER_0900, 5));
    await runReminders({ now: new Date('2026-01-15T06:59:00Z'), channelFor }); // 08:59 local
    expect(channel.send).not.toHaveBeenCalled();
    await runReminders({ now: JER_0900, channelFor }); // 09:00 local
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('uses the time the user chose', async () => {
    const u = await mkUser({ reminderTime: '17:45' });
    await mkPlant(u._id, 'p', hoursBefore(JER_0900, 5));
    await runReminders({ now: new Date('2026-01-15T15:44:00Z'), channelFor }); // 17:44 local
    expect(channel.send).not.toHaveBeenCalled();
    await runReminders({ now: new Date('2026-01-15T15:45:00Z'), channelFor }); // 17:45 local
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('treats a user without the setting as 09:00', async () => {
    const u = await mkUser();
    await User.collection.updateOne({ _id: u._id }, { $unset: { reminderTime: '' } });
    await mkPlant(u._id, 'p', hoursBefore(JER_0900, 5));
    await runReminders({ now: JER_0900, channelFor });
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('handles each user in their own timezone at the same moment', async () => {
    const jer = await mkUser({ timezone: 'Asia/Jerusalem', reminderTime: '17:00' }); // 16:00 local at the test moment
    const ny = await mkUser({ timezone: 'America/New_York', reminderTime: '09:00' }); // 09:00 local at the test moment
    const now = new Date('2026-01-15T14:00:00Z');
    await mkPlant(jer._id, 'jer plant', hoursBefore(now, 5));
    await mkPlant(ny._id, 'ny plant', hoursBefore(now, 5));
    const result = await runReminders({ now, channelFor });
    expect(result[jer._id.toString()]).toBe('early');
    expect(result[ny._id.toString()]).toBe('sent');
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send.mock.calls[0][1].body).toContain('ny plant');
  });

  it('never sends twice in one local day, even when passes run at the same time', async () => {
    const u = await mkUser();
    await mkPlant(u._id, 'p', hoursBefore(JER_0900, 5));
    await Promise.all([runReminders({ now: JER_0900, channelFor }), runReminders({ now: JER_0900, channelFor }), runReminders({ now: JER_0900, channelFor })]);
    await runReminders({ now: new Date(JER_0900.getTime() + 3600 * 1000), channelFor });
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(await Reminder.countDocuments({ userId: u._id })).toBe(1);
  });

  it('reminds again the next day while the plant is still due', async () => {
    const u = await mkUser();
    await mkPlant(u._id, 'p', hoursBefore(JER_0900, 5));
    await runReminders({ now: JER_0900, channelFor });
    await runReminders({ now: new Date(JER_0900.getTime() + 86400000), channelFor });
    expect(channel.send).toHaveBeenCalledTimes(2);
  });

  it('says nothing when nothing is due, and only mentions the user\'s own plants', async () => {
    const a = await mkUser();
    const b = await mkUser();
    await mkPlant(a._id, 'plant of A', hoursBefore(JER_0900, 5));
    await mkPlant(b._id, 'plant of B', new Date(JER_0900.getTime() + 86400000)); // B has nothing due
    const result = await runReminders({ now: JER_0900, channelFor });
    expect(result[b._id.toString()]).toBeUndefined();
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send.mock.calls[0][1].body).toContain('plant of A');
    expect(channel.send.mock.calls[0][1].body).not.toContain('plant of B');
    expect(await runReminders({ now: new Date('2026-01-10T07:00:00Z'), channelFor })).toEqual({});
  });

  it('a failing channel is recorded, not retried today, and does not stop other users', async () => {
    const bad = await mkUser();
    const good = await mkUser();
    await mkPlant(bad._id, 'bad plant', hoursBefore(JER_0900, 5));
    await mkPlant(good._id, 'good plant', hoursBefore(JER_0900, 5));
    const flaky = { name: 'flaky', send: vi.fn(async (recipient) => { if (recipient.userId === bad._id.toString()) throw new Error('push service down'); }) };
    const result = await runReminders({ now: JER_0900, channelFor: () => flaky });
    expect(result[bad._id.toString()]).toBe('failed');
    expect(result[good._id.toString()]).toBe('sent');
    expect((await Reminder.findOne({ userId: bad._id })).status).toBe('failed');
    await runReminders({ now: new Date(JER_0900.getTime() + 600000), channelFor: () => flaky });
    expect(flaky.send).toHaveBeenCalledTimes(2); // one try each, no retry
  });

  it('skips a user with an invalid stored timezone and carries on', async () => {
    const broken = await mkUser();
    await User.collection.updateOne({ _id: broken._id }, { $set: { timezone: 'Mars/Phobos' } });
    const fine = await mkUser();
    await mkPlant(broken._id, 'p1', hoursBefore(JER_0900, 5));
    await mkPlant(fine._id, 'p2', hoursBefore(JER_0900, 5));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runReminders({ now: JER_0900, channelFor });
    errors.mockRestore();
    expect(result[broken._id.toString()]).toBe('error');
    expect(result[fine._id.toString()]).toBe('sent');
  });
});
