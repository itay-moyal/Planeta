import { Plant } from '../models/plant.model.js';
import { Reminder } from '../models/reminder.model.js';
import { User } from '../models/user.model.js';
import { getChannel } from '../notifications/index.js';
import { DEFAULT_REMINDER_TIME } from './user.service.js';

const MAX_NAMES = 3;

// The date and minutes-since-midnight on the user's wall clock (Intl handles daylight saving time).
export function localClock(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// One short Hebrew message for all the plants that are due, so one person does not get ten notifications.
export function buildMessage(plants) {
  const names = plants.slice(0, MAX_NAMES).map((p) => p.name).join(', ');
  let body;
  if (plants.length === 1) body = `הגיע הזמן להשקות: ${names}`;
  else if (plants.length <= MAX_NAMES) body = `הגיע הזמן להשקות ${plants.length} צמחים: ${names}`;
  else body = `הגיע הזמן להשקות ${plants.length} צמחים: ${names} ועוד ${plants.length - MAX_NAMES}`;
  return { title: 'Planeta', body, url: '/due' };
}

// Sends this user's reminder if it is time and none went out today. Returns what happened (used by tests).
async function remindUser(user, now, channelFor) {
  const clock = localClock(now, user.timezone);
  if (clock.minutes < toMinutes(user.reminderTime || DEFAULT_REMINDER_TIME)) return 'early';

  const plants = await Plant.find({ userId: user._id, 'watering.nextDueAt': { $ne: null, $lte: now } }).sort({ 'watering.nextDueAt': 1 });
  if (plants.length === 0) return 'nothing_due';

  const channel = channelFor(user);
  try {
    await Reminder.create({ userId: user._id, localDate: clock.date, channel: channel.name });
  } catch (err) {
    if (err?.code === 11000) return 'already_sent_today'; // someone else holds today's claim
    throw err;
  }

  try {
    await channel.send({ userId: user._id.toString() }, buildMessage(plants));
  } catch {
    // Not retried today: the plants stay due, so tomorrow's reminder includes them.
    await Reminder.updateOne({ userId: user._id, localDate: clock.date }, { status: 'failed' });
    return 'failed';
  }
  await Reminder.updateOne({ userId: user._id, localDate: clock.date }, { status: 'sent', sentAt: new Date(), plantIds: plants.map((p) => p._id) });
  return 'sent';
}

// One pass over everyone who has something due. Plain code: no LLM anywhere in the reminder path.
export async function runReminders({ now = new Date(), channelFor = getChannel } = {}) {
  const userIds = await Plant.distinct('userId', { 'watering.nextDueAt': { $ne: null, $lte: now } });
  if (userIds.length === 0) return {};
  const users = await User.find({ _id: { $in: userIds } }, 'timezone reminderTime notificationChannel');
  const results = {};
  for (const user of users) {
    let outcome;
    try {
      outcome = await remindUser(user, now, channelFor);
    } catch (err) {
      console.error('Reminder step failed:', err.message); // message only: no ids, no plant names
      outcome = 'error'; // for example an invalid stored timezone: skip this user, carry on with the others
    }
    results[user._id.toString()] = outcome;
  }
  return results;
}

let timer = null;
let running = false;

export function startScheduler(intervalMs = 60_000) {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return; // never overlap two passes
    running = true;
    try {
      await runReminders();
    } catch (err) {
      console.error('Scheduler pass failed:', err.message);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.();
  console.log('Reminder scheduler started');
}

export function stopScheduler() {
  clearInterval(timer);
  timer = null;
}
