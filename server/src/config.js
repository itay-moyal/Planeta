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
  perenualApiKey: process.env.PERENUAL_API_KEY || '',
  careCacheDays: Number(process.env.CARE_CACHE_DAYS) || 30,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  // Global kill switch for every LLM call (shared budget protection)
  llmKillSwitch: process.env.LLM_KILL_SWITCH === 'true',
  // Care-plan generations per user per day (tests: effectively unlimited)
  userDailyLlmLimit: Number(process.env.USER_DAILY_LLM_LIMIT) || (process.env.NODE_ENV === 'test' ? 1000 : 20),
  carePlanModel: process.env.CARE_PLAN_MODEL || 'claude-haiku-5-5',
  // Web push (VAPID). Generate the pair once with `npm --prefix server run vapid`. The subject is a contact URL or mailto.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || '',
  // The reminder scheduler runs inside the server process (off in tests, or with SCHEDULER_ENABLED=false)
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false' && process.env.NODE_ENV !== 'test',
  pendingTtlMinutes: 30,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};
