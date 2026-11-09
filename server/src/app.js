import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import identifyRoutes from './routes/identify.routes.js';
import { errorHandler } from './errors.js';

export const app = express();
app.use(cors({ origin: config.clientOrigin }));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/identify', identifyRoutes);
app.use(errorHandler);
