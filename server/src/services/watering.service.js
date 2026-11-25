import { AppError } from '../errors.js';
import { Plant } from '../models/plant.model.js';
import { WateringLog } from '../models/wateringLog.model.js';
import { findOwnPlant } from './plant.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SNOOZE_DAYS = 2; // "still moist" pushes the next reminder this far
export const MAX_INTERVAL_DAYS = 365;
const ACTIONS = ['watered', 'still_moist', 'dry'];
const SOURCES = ['user', 'reminder_reply'];

const bad = () => new AppError('INVALID_INPUT');

// The interval Perenual's data supports: the middle of its "days between waterings" range. No range, no interval:
// we never turn a vague category such as "Average" into a number of days.
export function suggestInterval(careData) {
  const d = careData?.wateringDays;
  if (!d || !Number.isFinite(d.min) || !Number.isFinite(d.max)) return null;
  const days = Math.round((d.min + d.max) / 2);
  return days >= 1 && days <= MAX_INTERVAL_DAYS ? days : null;
}

// Counting starts now: a plant added today is not "due" today just because we never saw it watered.
const dueFrom = (plant, intervalDays, now) => new Date((plant.watering?.lastWateredAt ?? now).getTime() + intervalDays * DAY_MS);

// Fills the interval from care data. Never replaces an interval the user chose themselves.
export async function applyCareInterval(plant, careData, now = new Date()) {
  const days = suggestInterval(careData);
  if (days === null || plant.watering?.intervalSource === 'user') return;
  if (plant.watering?.intervalDays === days && plant.watering?.nextDueAt) return;
  await Plant.updateOne({ _id: plant._id, userId: plant.userId, 'watering.intervalSource': { $ne: 'user' } }, {
    $set: { 'watering.intervalDays': days, 'watering.intervalSource': 'care_data', 'watering.nextDueAt': dueFrom(plant, days, now) },
  });
}

// The user sets (or changes) the interval by hand.
export async function setUserInterval(userId, plantId, intervalDays, now = new Date()) {
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > MAX_INTERVAL_DAYS) throw bad();
  const plant = await findOwnPlant(userId, plantId);
  await Plant.updateOne({ _id: plant._id, userId }, {
    $set: { 'watering.intervalDays': intervalDays, 'watering.intervalSource': 'user', 'watering.nextDueAt': dueFrom(plant, intervalDays, now) },
  });
  return findOwnPlant(userId, plantId);
}

// Records an answer and moves the schedule:
//  watered     -> last watered now, next reminder one interval from now
//  still_moist -> snooze the next reminder by SNOOZE_DAYS
//  dry         -> only logged; the plant stays due until the user says it was watered
export async function recordAnswer(userId, plantId, input, now = new Date()) {
  if (!input || !ACTIONS.includes(input.action)) throw bad();
  const source = input.source ?? 'user';
  if (!SOURCES.includes(source)) throw bad();

  const plant = await findOwnPlant(userId, plantId);
  const interval = plant.watering?.intervalDays ?? null;
  const set = {};
  if (input.action === 'watered') {
    set['watering.lastWateredAt'] = now;
    if (interval) set['watering.nextDueAt'] = new Date(now.getTime() + interval * DAY_MS);
  } else if (input.action === 'still_moist' && plant.watering?.nextDueAt) {
    set['watering.nextDueAt'] = new Date(now.getTime() + SNOOZE_DAYS * DAY_MS);
  }
  await WateringLog.create({ userId, plantId: plant._id, at: now, action: input.action, source });
  if (Object.keys(set).length) await Plant.updateOne({ _id: plant._id, userId }, { $set: set });
  return findOwnPlant(userId, plantId);
}

// The user's plants whose reminder date has come.
export async function listDue(userId, now = new Date()) {
  return Plant.find({ userId, 'watering.nextDueAt': { $ne: null, $lte: now } }).sort({ 'watering.nextDueAt': 1 });
}
