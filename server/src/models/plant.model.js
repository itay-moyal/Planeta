import mongoose from 'mongoose';

const plantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  species: {
    scientificName: { type: String, required: true },
    commonNames: { type: [String], default: [] },
  },
  identificationSource: { type: String, enum: ['candidate', 'manual'], required: true },
  identificationConfidence: { type: Number, default: null },
  referenceImageUrl: { type: String, default: '' },
  placement: {
    location: { type: String, enum: ['indoor', 'balcony', 'garden'], required: true },
    windowDirection: { type: String, enum: ['N', 'E', 'S', 'W'] },
    lightLevel: { type: String, enum: ['low', 'medium', 'high'] },
    sunExposure: { type: String, enum: ['full', 'partial', 'shade'] },
    potSizeNotes: { type: String },
  },
  planterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Planter', default: null },
  createdAt: { type: Date, default: Date.now },
});

export const Plant = mongoose.model('Plant', plantSchema);
