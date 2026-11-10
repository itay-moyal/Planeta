import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import identifyRoutes from './routes/identify.routes.js';
import authRoutes from './routes/auth.routes.js';
import { errorHandler } from './errors.js';

export const app = express();
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/identify', identifyRoutes);
app.use(errorHandler);
