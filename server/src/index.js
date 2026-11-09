import mongoose from 'mongoose';
import { config } from './config.js';
import { app } from './app.js';

// Phase 1 stores nothing yet; we only prove the connection works.
if (config.mongoUri) {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
  }
} else {
  console.warn('MONGODB_URI not set - skipping DB connection');
}

app.listen(config.port, () => console.log(`Planeta server on :${config.port}`));
