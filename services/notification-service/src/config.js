require('dotenv').config();

module.exports = {
  port: Number(process.env.NOTIFICATION_PORT || 4006),
  mongoUri: process.env.MONGO_NOTIFICATION_URI,
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  userServiceUrl: process.env.USER_SERVICE_URL,
  mailFrom: process.env.MAIL_FROM || 'noreply@pulseroom.dev',
  smtpHost: process.env.SMTP_HOST || 'localhost',
  smtpPort: Number(process.env.SMTP_PORT || 1025),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS
};
