import { AppError } from '../errors.js';
import { User } from '../models/user.model.js';

// channelAddress is NOT editable here: it is set only by the Telegram linking flow (phase 4).
const CHANNELS = ['telegram', 'whatsapp', 'email'];

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return typeof tz === 'string' && tz.length > 0;
  } catch {
    return false;
  }
}

export function validateSettings(input) {
  const update = {};
  if (input.city !== undefined) {
    if (typeof input.city !== 'string' || input.city.trim().length > 60) throw new AppError('INVALID_INPUT');
    update.city = input.city.trim();
  }
  if (input.timezone !== undefined) {
    if (!isValidTimezone(input.timezone)) throw new AppError('INVALID_INPUT');
    update.timezone = input.timezone;
  }
  if (input.notificationChannel !== undefined) {
    if (!CHANNELS.includes(input.notificationChannel)) throw new AppError('INVALID_INPUT');
    update.notificationChannel = input.notificationChannel;
  }
  return update; // only whitelisted fields can ever reach the database
}

// userId always comes from the authenticated cookie (req.userId), never from the body.
export async function updateSettings(userId, input) {
  const update = validateSettings(input);
  const user = await User.findByIdAndUpdate(userId, update, { returnDocument: 'after' });
  if (!user) throw new AppError('UNAUTHORIZED');
  return user;
}
