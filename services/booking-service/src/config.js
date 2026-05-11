const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

module.exports = {
  port: Number(process.env.BOOKING_PORT || 4004),
  mongoUri: process.env.MONGO_BOOKING_URI,
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  eventServiceUrl: process.env.EVENT_SERVICE_URL,
  userServiceUrl: process.env.USER_SERVICE_URL,
  gamificationServiceUrl: process.env.GAMIFICATION_SERVICE_URL,
  paymentProvider: process.env.PAYMENT_PROVIDER || 'manual',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  reportingCurrency: process.env.REPORTING_CURRENCY || 'USD',
  exchangeRateApiBaseUrl: process.env.EXCHANGE_RATE_API_BASE_URL || 'https://open.er-api.com/v6/latest',
  defaultInTaxRegistrationNumber:
    process.env.DEFAULT_GST_REGISTRATION_NUMBER || 'GST-IN-PULSEROOM',
  defaultUkTaxRegistrationNumber:
    process.env.DEFAULT_VAT_REGISTRATION_NUMBER || 'VAT-UK-PULSEROOM'
};
