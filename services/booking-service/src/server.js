const { connectMongo, RedisEventBus, DomainEvents, createServiceClient } = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const { createBookingAutomationService } = require('./services/bookingAutomationService');

const start = async () => {
  await connectMongo(config.mongoUri, logger);
  const eventBus = new RedisEventBus({
    redisUrl: config.redisUrl,
    serviceName: 'booking-service',
    logger
  });
  const eventServiceClient = createServiceClient(config.eventServiceUrl, 'booking-service');
  const automationService = createBookingAutomationService({
    redisUrl: config.redisUrl,
    logger,
    eventBus,
    appOrigin: config.appOrigin,
    fetchEventById: async (eventId) => {
      const response = await eventServiceClient.get(`/api/events/${eventId}`);
      return response.data.data;
    }
  });

  await eventBus.subscribe(
    [DomainEvents.BOOKING_CANCELLED, DomainEvents.WAITLIST_SPOT_EXPIRED],
    async ({ payload }) => {
      if (payload?.eventId && payload?.tierId) {
        await automationService.offerWaitlistSpots({
          eventId: payload.eventId,
          tierId: payload.tierId
        });
      }
    }
  );

  const app = createApp({ eventBus, automationService });
  app.listen(config.port, () => {
    logger.info({
      message: 'Booking service started',
      port: config.port
    });
  });
};

start().catch((error) => {
  logger.error({
    message: 'Failed to start booking service',
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
