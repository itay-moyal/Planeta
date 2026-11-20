import { config } from '../config.js';
import { AppError } from '../errors.js';
import { identifyPlant } from '../services/plantnet.service.js';
import { claimResult, holdResult } from '../services/pending.service.js';
import { consumeIdentification } from '../services/usage.service.js';

export const PENDING_COOKIE = 'planeta_pending';
const PENDING_COOKIE_PATH = '/api/identify';

export async function identify(req, res, next) {
  try {
    if (config.identifyKillSwitch) throw new AppError('SERVICE_DISABLED');
    if (!req.file) throw new AppError('NO_FILE');
    // Spent before calling Pl@ntNet: failed requests may still use their credits.
    const left = req.userId ? await consumeIdentification(req.userId) : null;
    const result = await identifyPlant(req.file);

    // Users see only their own allowance, never how much of the shared Pl@ntNet quota is left.
    if (req.userId) return res.json({ candidates: result.candidates, identificationsLeft: left });

    // Visitor: hold the real result on the server and send only a teaser.
    // The species must never appear in this response.
    const token = await holdResult(result.candidates);
    res.cookie(PENDING_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: PENDING_COOKIE_PATH,
      maxAge: config.pendingTtlMinutes * 60 * 1000,
    });
    res.json({ teaser: { found: true, topScore: result.candidates[0]?.score ?? null } });
  } catch (err) {
    next(err);
  }
}

// Logged-in user claims the result they identified as a visitor. Works once.
export async function claim(req, res, next) {
  try {
    const candidates = await claimResult(req.cookies?.[PENDING_COOKIE]);
    res.clearCookie(PENDING_COOKIE, { path: PENDING_COOKIE_PATH });
    res.json({ candidates });
  } catch (err) {
    next(err);
  }
}
