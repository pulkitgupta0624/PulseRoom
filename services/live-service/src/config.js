require('dotenv').config();

module.exports = {
  port: Number(process.env.LIVE_PORT || 4007),
  mongoUri: process.env.MONGO_LIVE_URI,
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET
};

