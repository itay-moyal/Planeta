import rateLimit from 'express-rate-limit';

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
