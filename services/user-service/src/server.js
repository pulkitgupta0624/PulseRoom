const { connectMongo, RedisEventBus, DomainEvents } = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const UserProfile = require('./models/UserProfile');
const { getPermissionsForRole } = require('./services/permissions');

const start = async () => {
  await connectMongo(config.mongoUri, logger);

  const eventBus = new RedisEventBus({
    redisUrl: config.redisUrl,
    serviceName: 'user-service',
    logger
  });

  await eventBus.subscribe(DomainEvents.USER_REGISTERED, async ({ payload }) => {
    const existing = await UserProfile.findOne({ userId: payload.userId });
    if (!existing) {
      await UserProfile.create({
        userId: payload.userId,
        email: payload.email,
        displayName: payload.name,
        role: payload.role,
        permissions: getPermissionsForRole(payload.role)
      });
    }
  });

  const app = createApp({ eventBus });
  app.listen(config.port, () => {
    logger.info({
      message: 'User service started',
      port: config.port
    });
  });
};

start().catch((error) => {
  logger.error({
    message: 'Failed to start user service',
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

