import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { User } from '../models/user.model.js';
import { isValidTimezone } from './user.service.js';
import { identificationsLeft } from './usage.service.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function toPublicUser(user) {
  // Never return passwordHash.
  return {
    id: user._id.toString(),
    email: user.email,
    city: user.city,
    timezone: user.timezone,
    language: user.language,
    notificationChannel: user.notificationChannel,
    reminderTime: user.reminderTime || '09:00',
    isDemo: user.isDemo,
    identificationsLeft: identificationsLeft(user), // the user's own allowance only, never the shared quota
  };
}

export function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: `${config.jwtExpiresDays}d` });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret).sub;
  } catch {
    throw new AppError('UNAUTHORIZED');
  }
}

export async function signup({ email, password, timezone }) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) throw new AppError('INVALID_INPUT');
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw new AppError('INVALID_INPUT'); // bcrypt only uses the first 72 bytes
  }
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    // The browser's timezone is only a starting default: a bad value just falls back to the model default.
    const tz = isValidTimezone(timezone) ? { timezone } : {};
    return await User.create({ email, passwordHash, ...tz });
  } catch (err) {
    if (err.code === 11000) throw new AppError('EMAIL_TAKEN');
    throw err;
  }
}

export async function login({ email, password }) {
  if (typeof email !== 'string' || typeof password !== 'string') throw new AppError('BAD_CREDENTIALS');
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  // Same error for unknown email and wrong password: don't reveal which accounts exist.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new AppError('BAD_CREDENTIALS');
  return user;
}

export async function getUserById(userId) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('UNAUTHORIZED');
  return user;
}
