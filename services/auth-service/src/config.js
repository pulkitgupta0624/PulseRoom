require('dotenv').config();

module.exports = {
  port: Number(process.env.AUTH_PORT || 4001),
  mongoUri: process.env.MONGO_AUTH_URI,
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresInDays: 7,
  cookieSecure: process.env.NODE_ENV === 'production'
};

