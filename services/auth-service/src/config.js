const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

module.exports = {
  port: Number(process.env.AUTH_PORT || 4001),
  mongoUri: process.env.MONGO_AUTH_URI,
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  twoFactorChallengeSecret: process.env.TWO_FACTOR_CHALLENGE_SECRET || process.env.JWT_ACCESS_SECRET,
  twoFactorChallengeExpiresIn: process.env.TWO_FACTOR_CHALLENGE_EXPIRES_IN || '10m',
  twoFactorEncryptionKey: process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET,
  twoFactorIssuer: process.env.TWO_FACTOR_ISSUER || 'PulseRoom',
  jwtRefreshExpiresInDays: 7,
  cookieSecure: process.env.NODE_ENV === 'production'
};
