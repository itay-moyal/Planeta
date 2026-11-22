import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';

process.env.USER_DAILY_LLM_LIMIT = '2';
const { consumeLlmCall } = await import('../src/services/usage.service.js');
const { User } = await import('../src/models/user.model.js');

const TEST_URI = process.env.MONGODB_TEST_URI;
const dbTestsEnabled = Boolean(TEST_URI) && /test/i.test(new URL(TEST_URI).pathname);
const mkUser = (email) => User.create({ email, passwordHash: 'x' });

describe.skipIf(!dbTestsEnabled)('per-user daily LLM limit', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();
    await User.syncIndexes();
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('allows the limit, then blocks with a Hebrew message, per user', async () => {
    const a = await mkUser('a@example.com');
    const b = await mkUser('b@example.com');
    await consumeLlmCall(a._id);
    await consumeLlmCall(a._id);
    const err = await consumeLlmCall(a._id).catch((e) => e);
    expect(err).toMatchObject({ code: 'LLM_DAILY_LIMIT', status: 429 });
    expect(err.userMessage).toMatch(/[א-ת]/);
    await consumeLlmCall(b._id); // B has their own allowance
  });

  it('lets exactly the limit through when calls arrive at the same time', async () => {
    const c = await mkUser('c@example.com');
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => consumeLlmCall(c._id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect((await User.findById(c._id)).usage.llmCalls).toBe(2);
  });

  it('starts a fresh count on a new day, independent of the identification counter', async () => {
    const d = await mkUser('d@example.com');
    await consumeLlmCall(d._id);
    await consumeLlmCall(d._id);
    await User.updateOne({ _id: d._id }, { 'usage.llmDay': '2000-01-01' });
    await consumeLlmCall(d._id);
    const doc = await User.findById(d._id);
    expect(doc.usage.llmCalls).toBe(1);
    expect(doc.usage.identifications).toBe(0);
  });
});
