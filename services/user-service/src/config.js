require('dotenv').config();

module.exports = {
  port: Number(process.env.USER_PORT || 4002),
  mongoUri: process.env.MONGO_USER_URI,
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET
};

