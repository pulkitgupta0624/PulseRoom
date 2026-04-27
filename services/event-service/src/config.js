require('dotenv').config();

module.exports = {
  port: Number(process.env.EVENT_PORT || 4003),
  mongoUri: process.env.MONGO_EVENT_URI,
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  userServiceUrl: process.env.USER_SERVICE_URL,
  typesenseProtocol: process.env.TYPESENSE_PROTOCOL || 'http',
  typesenseHost: process.env.TYPESENSE_HOST || 'localhost',
  typesensePort: Number(process.env.TYPESENSE_PORT || 8108),
  typesenseApiKey: process.env.TYPESENSE_API_KEY || 'pulseroom-typesense-key',
  typesenseCollection: process.env.TYPESENSE_COLLECTION || 'events',
  sponsorPlatformFeePercent: Number(process.env.SPONSOR_PLATFORM_FEE_PERCENT || 5),
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
};
