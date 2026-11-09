export const config = {
  port: Number(process.env.PORT) || 4000,
  plantnetApiKey: process.env.PLANTNET_API_KEY || '',
  mongoUri: process.env.MONGODB_URI || '',
  maxImageBytes: (Number(process.env.MAX_IMAGE_MB) || 5) * 1024 * 1024,
  identifyKillSwitch: process.env.IDENTIFY_KILL_SWITCH === 'true',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};
