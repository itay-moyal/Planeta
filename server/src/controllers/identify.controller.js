import { config } from '../config.js';
import { AppError } from '../errors.js';
import { identifyPlant } from '../services/plantnet.service.js';

export async function identify(req, res, next) {
  try {
    if (config.identifyKillSwitch) throw new AppError('SERVICE_DISABLED');
    if (!req.file) throw new AppError('NO_FILE');
    const result = await identifyPlant(req.file);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
