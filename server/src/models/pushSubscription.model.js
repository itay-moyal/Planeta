import mongoose from 'mongoose';

// One row per browser/phone that agreed to get notifications. A user can have several.
// `endpoint` is the push service address the browser gave us; it is unique per installation.
const pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'push_subscriptions' });

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
