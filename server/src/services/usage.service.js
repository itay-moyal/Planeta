import { config } from '../config.js';
import { AppError } from '../errors.js';
import { User } from '../models/user.model.js';

const utcDay = () => new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

// How many identifications the user can still do today. A stored day other than today counts as unused.
export function identificationsLeft(user) {
  const used = user.usage?.day === utcDay() ? user.usage.identifications : 0;
  return Math.max(0, config.userDailyIdentifyLimit - used);
}

// Spends one of the user's daily identifications and returns how many are left, or throws DAILY_LIMIT.
// Each findOneAndUpdate is a single atomic step in MongoDB (the condition and the change happen
// together), so simultaneous requests cannot all pass a "read the count, then write it back" race.
export async function consumeIdentification(userId) {
  const today = utcDay();
  const after = { returnDocument: 'after' };

  // 1. Same day and still under the limit: count it.
  const counted = await User.findOneAndUpdate(
    { _id: userId, 'usage.day': today, 'usage.identifications': { $lt: config.userDailyIdentifyLimit } },
    { $inc: { 'usage.identifications': 1 } },
    after,
  );
  if (counted) return identificationsLeft(counted);

  // 2. First request of a new day: start the counter at 1.
  const reset = await User.findOneAndUpdate(
    { _id: userId, 'usage.day': { $ne: today } },
    { $set: { 'usage.day': today, 'usage.identifications': 1 } },
    after,
  );
  if (reset) return identificationsLeft(reset);

  // 3. Someone else just started today's counter (simultaneous first requests): count ours on top of it.
  const retried = await User.findOneAndUpdate(
    { _id: userId, 'usage.day': today, 'usage.identifications': { $lt: config.userDailyIdentifyLimit } },
    { $inc: { 'usage.identifications': 1 } },
    after,
  );
  if (retried) return identificationsLeft(retried);

  // 4. Same day, at the limit (or the user no longer exists).
  throw new AppError('DAILY_LIMIT');
}

// Same pattern for LLM calls (care plans), with its own day marker. Counted before the call is made.
export async function consumeLlmCall(userId) {
  const today = utcDay();
  const counted = await User.findOneAndUpdate(
    { _id: userId, 'usage.llmDay': today, 'usage.llmCalls': { $lt: config.userDailyLlmLimit } },
    { $inc: { 'usage.llmCalls': 1 } },
    { returnDocument: 'after' },
  );
  if (counted) return;
  const reset = await User.findOneAndUpdate(
    { _id: userId, 'usage.llmDay': { $ne: today } },
    { $set: { 'usage.llmDay': today, 'usage.llmCalls': 1 } },
    { returnDocument: 'after' },
  );
  if (reset) return;
  // Lost the race to start today's counter (simultaneous first calls): count ours on top of it.
  const retried = await User.findOneAndUpdate(
    { _id: userId, 'usage.llmDay': today, 'usage.llmCalls': { $lt: config.userDailyLlmLimit } },
    { $inc: { 'usage.llmCalls': 1 } },
    { returnDocument: 'after' },
  );
  if (retried) return;
  throw new AppError('LLM_DAILY_LIMIT');
}
