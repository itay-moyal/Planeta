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
  // Care plan (see care.service.js). `placementKey` is a hash of the placement the plan was written for.
  care: {
    status: { type: String, enum: ['ready', 'no_data'] }, // absent = nothing generated yet
    plan: { type: mongoose.Schema.Types.Mixed, default: null },
    model: { type: String },
    inputTokens: { type: Number },
    outputTokens: { type: Number },
    placementKey: { type: String },
    generatedAt: { type: Date },
    generatingSince: { type: Date, default: null }, // short lock so two requests cannot both call the LLM
  },
  createdAt: { type: Date, default: Date.now },
});

export const Plant = mongoose.model('Plant', plantSchema);
