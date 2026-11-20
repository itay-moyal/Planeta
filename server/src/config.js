export const config = {
  port: Number(process.env.PORT) || 4000,
  plantnetApiKey: process.env.PLANTNET_API_KEY || '',
  mongoUri: process.env.MONGODB_URI || '',
  maxImageBytes: (Number(process.env.MAX_IMAGE_MB) || 5) * 1024 * 1024,
  identifyKillSwitch: process.env.IDENTIFY_KILL_SWITCH === 'true',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresDays: Number(process.env.JWT_EXPIRES_DAYS) || 7,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  // Identifications per IP per day for visitors without an account (tests: effectively unlimited)
  visitorDailyLimit: Number(process.env.VISITOR_DAILY_LIMIT) || (process.env.NODE_ENV === 'test' ? 1000 : 3),
  // Identifications per logged-in user per day (tests: effectively unlimited)
  userDailyIdentifyLimit: Number(process.env.USER_DAILY_IDENTIFY_LIMIT) || (process.env.NODE_ENV === 'test' ? 1000 : 10),
  pendingTtlMinutes: 30,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};
