import mongoose from 'mongoose';

// One row per user per local day. The unique index is the claim: whoever inserts the row first
// sends that day's reminder, so a second run (or a second server) cannot send it again.
const reminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  localDate: { type: String, required: true }, // 'YYYY-MM-DD' in the user's timezone
  status: { type: String, enum: ['sending', 'sent', 'failed'], default: 'sending' },
  channel: { type: String, default: '' },
  plantIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  sentAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});
reminderSchema.index({ userId: 1, localDate: 1 }, { unique: true });

export const Reminder = mongoose.model('Reminder', reminderSchema);
