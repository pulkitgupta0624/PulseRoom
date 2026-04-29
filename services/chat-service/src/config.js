const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

module.exports = {
  port: Number(process.env.CHAT_PORT || 4005),
  mongoUri: process.env.MONGO_CHAT_URI,
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  eventServiceUrl: process.env.EVENT_SERVICE_URL,
  chatUserRateLimitWindowMs: Number(
    process.env.CHAT_USER_RATE_LIMIT_WINDOW_MS ||
      process.env.GATEWAY_USER_RATE_LIMIT_CHAT_WINDOW_MS ||
      60_000
  ),
  chatUserRateLimitMax: Number(
    process.env.CHAT_USER_RATE_LIMIT_MAX ||
      process.env.GATEWAY_USER_RATE_LIMIT_CHAT_MAX ||
      45
  )
};
