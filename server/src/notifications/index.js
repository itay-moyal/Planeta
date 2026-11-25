import { sendToUser } from '../services/push.service.js';

// A NotificationChannel is any object with:
//   name: string
//   send(recipient, message) -> Promise, rejects when the message could not be delivered
// where recipient = { userId } and message = { title, body, url }.
// Reply handling is not part of the interface yet: replies come back through the app's own
// endpoints. A channel that needs it (Telegram, later) can add it when it exists.

// Until a real channel exists the message is only logged: length only, never the text (plant names are user data).
export const logChannel = {
  name: 'log',
  async send(recipient, message) {
    console.log(`[reminder] would send ${message.body.length} characters via the log channel`);
  },
};

// Web push to every device the user turned reminders on for.
export const pushChannel = {
  name: 'push',
  async send(recipient, message) {
    await sendToUser(recipient.userId, message);
  },
};

// Which channel serves this user. Email is added in a later step.
export function getChannel(user) {
  return user.notificationChannel === 'push' ? pushChannel : logChannel;
}
