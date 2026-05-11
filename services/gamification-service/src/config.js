const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

module.exports = {
  port: Number(process.env.GAMIFICATION_PORT || 4009),
  mongoUri: process.env.MONGO_GAMIFICATION_URI,
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173'
};
