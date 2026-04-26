require('dotenv').config();

module.exports = {
  port: Number(process.env.ADMIN_PORT || 4008),
  mongoUri: process.env.MONGO_ADMIN_URI,
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  userServiceUrl: process.env.USER_SERVICE_URL,
  eventServiceUrl: process.env.EVENT_SERVICE_URL
};

