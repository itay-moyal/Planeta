import { config } from '../config.js';
import { getUserById, login, signToken, signup, toPublicUser } from '../services/auth.service.js';

export const COOKIE_NAME = 'planeta_token';

function setSessionCookie(res, userId) {
  res.cookie(COOKIE_NAME, signToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.jwtExpiresDays * 24 * 60 * 60 * 1000,
  });
}

export async function signupHandler(req, res, next) {
  try {
    const user = await signup(req.body ?? {});
    setSessionCookie(res, user._id.toString());
    res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req, res, next) {
  try {
    const user = await login(req.body ?? {});
    setSessionCookie(res, user._id.toString());
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

export function logoutHandler(req, res) {
  res.clearCookie(COOKIE_NAME);
  res.status(204).end();
}

export async function meHandler(req, res, next) {
  try {
    res.json({ user: toPublicUser(await getUserById(req.userId)) });
  } catch (err) {
    next(err);
  }
}
