import mongoose from 'mongoose';

// One row per answer about a plant's watering. Phase 5 will learn the interval from these rows.
const wateringLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plant', required: true, index: true },
  at: { type: Date, default: Date.now },
  action: { type: String, enum: ['watered', 'still_moist', 'dry'], required: true },
  source: { type: String, enum: ['user', 'reminder_reply'], default: 'user' },
}, { collection: 'watering_logs' });

export const WateringLog = mongoose.model('WateringLog', wateringLogSchema);
