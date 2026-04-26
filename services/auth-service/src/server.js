const { connectMongo, RedisEventBus, DomainEvents } = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const UserCredential = require('./models/UserCredential');

const start = async () => {
  await connectMongo(config.mongoUri, logger);

  const eventBus = new RedisEventBus({
    redisUrl: config.redisUrl,
    serviceName: 'auth-service',
    logger
  });

  await eventBus.subscribe([DomainEvents.USER_UPDATED, DomainEvents.ORGANIZER_VERIFIED], async ({ event, payload }) => {
    if (event === DomainEvents.USER_UPDATED) {
      await UserCredential.updateOne(
        {
          userId: payload.userId
        },
        {
          role: payload.role,
          permissions: payload.permissions || [],
          isActive: payload.isActive !== false
        }
      );
    }

    if (event === DomainEvents.ORGANIZER_VERIFIED) {
      await UserCredential.updateOne(
        {
          userId: payload.userId
        },
        {
          role: payload.role || 'organizer'
        }
      );
    }
  });

  const app = createApp({ eventBus });

  app.listen(config.port, () => {
    logger.info({
      message: 'Auth service started',
      port: config.port
    });
  });
};

start().catch((error) => {
  logger.error({
    message: 'Failed to start auth service',
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
