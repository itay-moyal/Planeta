import { AppError } from '../errors.js';
import { verifyToken } from '../services/auth.service.js';
import { COOKIE_NAME } from '../controllers/auth.controller.js';

// Sets req.userId from the signed cookie only. Never read a userId from body/query/params.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(new AppError('UNAUTHORIZED'));
  try {
    req.userId = verifyToken(token);
    next();
  } catch (err) {
    next(err);
  }
}
