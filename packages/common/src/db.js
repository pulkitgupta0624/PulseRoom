const mongoose = require('mongoose');

const parseAllowedDatabases = () =>
  String(process.env.MONGO_ALLOWED_DATABASES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const validateMongoUri = (mongoUri) => {
  if (!mongoUri) {
    throw new Error('MongoDB URI is required. Set the service-specific MONGO_*_URI environment variable.');
  }

  let parsed;
  try {
    parsed = new URL(mongoUri);
  } catch {
    throw new Error('MongoDB URI is invalid.');
  }

  const databaseName = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (!databaseName) {
    throw new Error('MongoDB URI must include an explicit database name.');
  }

  if (/^(test|admin|local)$/i.test(databaseName)) {
    throw new Error(`Refusing to connect to reserved MongoDB database "${databaseName}".`);
  }

  const allowedDatabases = parseAllowedDatabases();
  if (allowedDatabases.length && !allowedDatabases.includes(databaseName)) {
    throw new Error(
      `MongoDB database "${databaseName}" is not in MONGO_ALLOWED_DATABASES.`
    );
  }

  if (
    process.env.NODE_ENV === 'production' &&
    /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(parsed.hostname)
  ) {
    throw new Error('Refusing to use a local MongoDB host in production.');
  }

  return databaseName;
};

const connectMongo = async (mongoUri, logger) => {
  mongoose.set('strictQuery', true);
  const databaseName = validateMongoUri(mongoUri);

  mongoose.connection.on('connected', () => {
    logger.info({ message: 'MongoDB connected', databaseName });
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
  connectMongo,
  validateMongoUri
};
