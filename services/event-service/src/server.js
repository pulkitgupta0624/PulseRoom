const { connectMongo, RedisEventBus, createCacheClient, DomainEvents } = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const Event = require('./models/Event');
const { EventSearchService } = require('./services/searchService');
const { createEventCompletionService } = require('./services/eventCompletionService');
const { createWebhookService, SUPPORTED_WEBHOOK_EVENTS } = require('./services/webhookService');
const {
  buildBookingConfirmedUpdate,
  buildPaymentRefundedUpdate
} = require('./services/eventCounterService');

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
  const webhookService = createWebhookService({
    redisUrl: config.redisUrl,
    logger,
    timeoutMs: config.webhookTimeoutMs,
    attempts: config.webhookRetryAttempts
  });

  await eventBus.subscribe([
    DomainEvents.BOOKING_CONFIRMED,
    DomainEvents.BOOKING_CANCELLED,
    DomainEvents.EVENT_UPDATED,
    DomainEvents.EVENT_PUBLISHED,
    DomainEvents.EVENT_COMPLETED,
    DomainEvents.SPONSOR_ACTIVATED,
    DomainEvents.PAYMENT_REFUNDED
  ], async ({ event, payload }) => {
    if (event === DomainEvents.BOOKING_CONFIRMED) {
      await Event.updateOne(
        { _id: payload.eventId },
        buildBookingConfirmedUpdate(payload)
      );
    }

    if (event === DomainEvents.PAYMENT_REFUNDED) {
      await Event.updateOne(
        { _id: payload.eventId },
        buildPaymentRefundedUpdate(payload)
      );
    }

    if (SUPPORTED_WEBHOOK_EVENTS.has(event)) {
      await webhookService.queueEventFanout({
        eventName: event,
        payload
      });
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
      completionService,
      webhookService
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
