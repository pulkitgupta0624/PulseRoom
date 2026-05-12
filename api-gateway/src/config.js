const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

module.exports = {
  port: Number(process.env.GATEWAY_PORT || 8080),
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  redisUrl: process.env.REDIS_URL,
  userRateLimiting: {
    bookings: {
      windowMs: Number(process.env.GATEWAY_USER_RATE_LIMIT_BOOKINGS_WINDOW_MS || 60_000),
      maxRequests: Number(process.env.GATEWAY_USER_RATE_LIMIT_BOOKINGS_MAX || 20)
    },
    chat: {
      windowMs: Number(process.env.GATEWAY_USER_RATE_LIMIT_CHAT_WINDOW_MS || 60_000),
      maxRequests: Number(process.env.GATEWAY_USER_RATE_LIMIT_CHAT_MAX || 45)
    },
    live: {
      windowMs: Number(process.env.GATEWAY_USER_RATE_LIMIT_LIVE_WINDOW_MS || 60_000),
      maxRequests: Number(process.env.GATEWAY_USER_RATE_LIMIT_LIVE_MAX || 90)
    }
  },
  ipRiskAnalysis: {
    enabled: process.env.GATEWAY_IP_RISK_ENABLED !== 'false',
    windowMs: Number(process.env.GATEWAY_IP_RISK_WINDOW_MS || 60_000),
    challengeThreshold: Number(process.env.GATEWAY_IP_RISK_CHALLENGE_THRESHOLD || 120),
    blockThreshold: Number(process.env.GATEWAY_IP_RISK_BLOCK_THRESHOLD || 220),
    loginAttemptThreshold: Number(process.env.GATEWAY_IP_RISK_LOGIN_ATTEMPT_THRESHOLD || 12),
    salt: process.env.GATEWAY_IP_RISK_SALT || process.env.JWT_ACCESS_SECRET || 'pulseroom-dev-risk-salt'
  },
  services: {
    auth: process.env.AUTH_SERVICE_URL,
    users: process.env.USER_SERVICE_URL,
    events: process.env.EVENT_SERVICE_URL,
    bookings: process.env.BOOKING_SERVICE_URL,
    chat: process.env.CHAT_SERVICE_URL,
    notifications: process.env.NOTIFICATION_SERVICE_URL,
    live: process.env.LIVE_SERVICE_URL,
    admin: process.env.ADMIN_SERVICE_URL,
    gamification: process.env.GAMIFICATION_SERVICE_URL
  }
};
