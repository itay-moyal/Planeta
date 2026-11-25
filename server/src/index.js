import mongoose from 'mongoose';
import { config } from './config.js';
import { app } from './app.js';
import { startScheduler } from './services/scheduler.service.js';

if (!config.jwtSecret) {
  console.error('JWT_SECRET is not set - refusing to start');
  process.exit(1);
}

// Phase 1 stores nothing yet; we only prove the connection works.
if (config.mongoUri) {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('MongoDB connected');
    if (config.schedulerEnabled) startScheduler();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
  }
} else {
  console.warn('MONGODB_URI not set - skipping DB connection');
}

app.listen(config.port, () => console.log(`Planeta server on :${config.port}`));
