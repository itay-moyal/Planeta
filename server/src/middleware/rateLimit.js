import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { AppError } from '../errors.js';

const tooMany = (req, res) => {
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'יותר מדי בקשות. נא להמתין מעט ולנסות שוב.' },
  });
};

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooMany,
});

// Visitors only (skips logged-in users, so run optionalAuth before this).
export const visitorDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: config.visitorDailyLimit,
  skip: (req) => Boolean(req.userId),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(new AppError('VISITOR_LIMIT')),
});

export const identifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'יותר מדי בקשות. נא להמתין מעט ולנסות שוב.' },
    });
  },
});
