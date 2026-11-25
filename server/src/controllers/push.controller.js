import { config } from '../config.js';
import { deviceCount, pushConfigured, sendToUser, subscribe, unsubscribe } from '../services/push.service.js';

export async function statusHandler(req, res, next) {
  try {
    res.json({ configured: pushConfigured(), publicKey: pushConfigured() ? config.vapidPublicKey : '', devices: await deviceCount(req.userId) });
  } catch (err) {
    next(err);
  }
}

export async function subscribeHandler(req, res, next) {
  try {
    res.status(201).json({ devices: await subscribe(req.userId, req.body) });
  } catch (err) {
    next(err);
  }
}

export async function unsubscribeHandler(req, res, next) {
  try {
    res.json({ devices: await unsubscribe(req.userId, req.body?.endpoint) });
  } catch (err) {
    next(err);
  }
}

export async function testHandler(req, res, next) {
  try {
    const delivered = await sendToUser(req.userId, { title: 'Planeta', body: 'זו התראת בדיקה. התזכורות עובדות ✓', url: '/plants' });
    res.json({ delivered });
  } catch (err) {
    next(err);
  }
}
