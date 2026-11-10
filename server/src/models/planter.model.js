import mongoose from 'mongoose';

// A planter is the physical box/pot that can hold several plants (e.g. a balcony box).
const planterSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  sunExposure: { type: String, enum: ['full', 'partial', 'shade'], default: 'full' },
  sizeNotes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

export const Planter = mongoose.model('Planter', planterSchema);
