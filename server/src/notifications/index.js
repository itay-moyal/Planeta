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

// Which channel serves this user. Web push and email are added in the next steps.
export function getChannel(user) {
  return logChannel;
}
