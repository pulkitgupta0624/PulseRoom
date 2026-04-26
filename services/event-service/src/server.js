const { connectMongo, RedisEventBus, createCacheClient, DomainEvents } = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const Event = require('./models/Event');
const { EventSearchService } = require('./services/searchService');
const { createEventCompletionService } = require('./services/eventCompletionService');

const start = async () => {
  await connectMongo(config.mongoUri, logger);
  const cache = createCacheClient(config.redisUrl);
  const eventBus = new RedisEventBus({
    redisUrl: config.redisUrl,
    serviceName: 'event-service',
    logger
  });
  const searchService = new EventSearchService({ config, logger });
  await searchService.ensureCollection();
  if (searchService.isEnabled()) {
    const existingEvents = await Event.find().lean();
    await searchService.reindexEvents(existingEvents);
  }

  const completionService = createEventCompletionService({
    redisUrl: config.redisUrl,
    logger,
    eventBus,
    onEventChanged: async (event) => {
      if (searchService.isEnabled()) {
        await searchService.upsertEvent(event);
      }
    }
  });
  await completionService.bootstrapExistingSchedules();

  await eventBus.subscribe([DomainEvents.BOOKING_CONFIRMED, DomainEvents.PAYMENT_REFUNDED], async ({ event, payload }) => {
    if (event === DomainEvents.BOOKING_CONFIRMED) {
      await Event.updateOne(
        { _id: payload.eventId },
        {
          $inc: {
            attendeesCount: payload.quantity || 1,
            'analytics.bookings': 1,
            'analytics.revenue': payload.amount || 0
          }
        }
      );
    }

    if (event === DomainEvents.PAYMENT_REFUNDED) {
      await Event.updateOne(
        { _id: payload.eventId },
        {
          $inc: {
            attendeesCount: -1,
            'analytics.revenue': -(payload.amount || 0)
          }
        }
      );
    }

    if (searchService.isEnabled()) {
      const updatedEvent = await Event.findById(payload.eventId).lean();
      if (updatedEvent) {
        await searchService.upsertEvent(updatedEvent);
      }
    }
  });

  const app = createApp({
    eventBus,
    cache,
    services: {
      searchService,
      completionService
    }
  });
  app.listen(config.port, () => {
    logger.info({
      message: 'Event service started',
      port: config.port
    });
  });
};

start().catch((error) => {
  logger.error({
    message: 'Failed to start event service',
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
