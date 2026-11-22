import mongoose from 'mongoose';

// Shared between all users: it holds public species data only, never anything about a user.
const speciesCacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // lowercased scientific name
  scientificName: { type: String, required: true },
  source: { type: String, default: 'perenual' },
  // found: we have data. not_found: the source has no such species.
  // restricted: the source has it, but our (free) plan does not include its details.
  status: { type: String, enum: ['found', 'not_found', 'restricted'], required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: null },
  fetchedAt: { type: Date, default: Date.now },
}, { collection: 'species_cache' });

export const SpeciesCache = mongoose.model('SpeciesCache', speciesCacheSchema);
