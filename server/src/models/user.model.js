import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  city: { type: String, trim: true, default: '' },
  timezone: { type: String, default: 'Asia/Jerusalem' },
  language: { type: String, default: 'he' },
  notificationChannel: { type: String, enum: ['telegram', 'whatsapp', 'email'], default: 'email' },
  channelAddress: { type: String, default: '' },
  isDemo: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model('User', userSchema);
