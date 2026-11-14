import mongoose from 'mongoose';
import { config } from '../config.js';

// A visitor's identification result, held server-side until they sign up and claim it.
// Only the SHA-256 of the token is stored. No photo is stored, and MongoDB deletes the
// document by itself after the TTL.
const pendingSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  candidates: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: config.pendingTtlMinutes * 60 },
});

export const PendingIdentification = mongoose.model('PendingIdentification', pendingSchema);
