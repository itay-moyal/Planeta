import { toPublicUser } from '../services/auth.service.js';
import { updateSettings } from '../services/user.service.js';

export async function updateMeHandler(req, res, next) {
  try {
    const user = await updateSettings(req.userId, req.body ?? {});
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}
