import crypto from 'node:crypto';
import { AppError } from '../errors.js';
import { PendingIdentification } from '../models/pendingIdentification.model.js';

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Returns the raw token (goes to the visitor in an httpOnly cookie; only its hash is stored).
export async function holdResult(candidates) {
  const token = crypto.randomBytes(32).toString('hex');
  await PendingIdentification.create({ tokenHash: hash(token), candidates });
  return token;
}

// Single use: the document is deleted in the same atomic operation that reads it.
export async function claimResult(token) {
  if (typeof token !== 'string' || token.length !== 64) throw new AppError('PENDING_EXPIRED');
  const doc = await PendingIdentification.findOneAndDelete({ tokenHash: hash(token) });
  if (!doc) throw new AppError('PENDING_EXPIRED');
  return doc.candidates;
}
