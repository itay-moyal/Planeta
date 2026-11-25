import * as webpush from 'web-push'; // web-push 4 is an ES module with named exports (no default export)
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { PushSubscription } from '../models/pushSubscription.model.js';
import { User } from '../models/user.model.js';

export const MAX_DEVICES = 10;
const TTL_SECONDS = 6 * 60 * 60; // a watering reminder is useless a day late

// The server will POST to whatever address a client registers, so only the known push services are accepted.
// Otherwise someone could register an internal address and make our server call it (SSRF).
const PUSH_HOSTS = ['push.apple.com', 'fcm.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com'];

export function isAllowedEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  return PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

const isKey = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(v); // url-safe base64

export function validateSubscription(body) {
  if (!body || !isAllowedEndpoint(body.endpoint) || !isKey(body.keys?.p256dh) || !isKey(body.keys?.auth)) throw new AppError('INVALID_INPUT');
  return { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } };
}

export const pushConfigured = () => Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);

export async function deviceCount(userId) {
  return PushSubscription.countDocuments({ userId });
}

// Saves this device for the user and makes push their reminder channel. The same device registering again
// (or logging in as someone else on it) just takes over the row, so one device never serves two users.
export async function subscribe(userId, body) {
  const sub = validateSubscription(body);
  const existing = await PushSubscription.exists({ endpoint: sub.endpoint, userId });
  if (!existing && (await deviceCount(userId)) >= MAX_DEVICES) throw new AppError('LIMIT_REACHED');
  const before = await PushSubscription.findOneAndUpdate({ endpoint: sub.endpoint }, { userId, keys: sub.keys }, { upsert: true, returnDocument: 'before' });
  await User.updateOne({ _id: userId }, { notificationChannel: 'push' });
  if (before && !before.userId.equals(userId)) await fallBackIfNoDevices(before.userId); // the device changed hands
  return deviceCount(userId);
}

// A user with no devices left cannot be reached by push: put them back on email.
async function fallBackIfNoDevices(userId) {
  if ((await deviceCount(userId)) === 0) await User.updateOne({ _id: userId, notificationChannel: 'push' }, { notificationChannel: 'email' });
}

// Removes one of the caller's own devices. Someone else's endpoint is simply not found, so nothing changes.
export async function unsubscribe(userId, endpoint) {
  if (typeof endpoint !== 'string') throw new AppError('INVALID_INPUT');
  await PushSubscription.deleteOne({ userId, endpoint });
  await fallBackIfNoDevices(userId);
  return deviceCount(userId);
}

let vapidSet = false;
function ensureVapid() {
  if (!pushConfigured()) throw new AppError('PUSH_UNAVAILABLE');
  if (!vapidSet) {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    vapidSet = true;
  }
}

// Sends to every device of this user. Returns how many accepted it. Devices the push service says are gone
// (404 or 410) are deleted. Throws when nothing was delivered, so the scheduler records the reminder as failed.
export async function sendToUser(userId, message, sender = webpush) {
  ensureVapid();
  const subs = await PushSubscription.find({ userId });
  if (subs.length === 0) throw new AppError('PUSH_NO_DEVICE');

  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url }); // nothing else
  const results = await Promise.allSettled(subs.map((s) => sender.sendNotification(
    { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
    payload,
    { TTL: TTL_SECONDS, urgency: 'normal' },
  )));

  let delivered = 0;
  await Promise.all(results.map(async (r, i) => {
    if (r.status === 'fulfilled') {
      delivered += 1;
    } else if (r.reason?.statusCode === 404 || r.reason?.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subs[i]._id });
    } else {
      console.error('Push send failed with status', r.reason?.statusCode ?? 'none'); // status only: the address and keys are secrets
    }
  }));
  if (delivered === 0) throw new AppError('PUSH_UNAVAILABLE');
  return delivered;
}
