import rateLimit from 'express-rate-limit';

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

export const identifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'יותר מדי בקשות. נא להמתין מעט ולנסות שוב.' },
    });
  },
});
