require('dotenv').config();

module.exports = {
  port: Number(process.env.GATEWAY_PORT || 8080),
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  services: {
    auth: process.env.AUTH_SERVICE_URL,
    users: process.env.USER_SERVICE_URL,
    events: process.env.EVENT_SERVICE_URL,
    bookings: process.env.BOOKING_SERVICE_URL,
    chat: process.env.CHAT_SERVICE_URL,
    notifications: process.env.NOTIFICATION_SERVICE_URL,
    live: process.env.LIVE_SERVICE_URL,
    admin: process.env.ADMIN_SERVICE_URL
  }
};

