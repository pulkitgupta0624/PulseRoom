const mongoose = require('mongoose');

const connectMongo = async (mongoUri, logger) => {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    logger.info({ message: 'MongoDB connected' });
  });

  mongoose.connection.on('error', (error) => {
    logger.error({ message: 'MongoDB connection error', error: error.message });
  });

  await mongoose.connect(mongoUri, {
    maxPoolSize: 20,
    autoIndex: true
  });

  return mongoose.connection;
};

module.exports = {
  connectMongo
};

