const {
  connectMongo,
  RedisEventBus,
  DomainEvents,
  createCacheClient,
  createServiceClient
} = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const Booking = require('./models/Booking');
const { createBookingAutomationService } = require('./services/bookingAutomationService');
const { syncBookingIndexes } = require('./services/bookingIndexService');
const { createExchangeRateService } = require('./services/exchangeRateService');
const { createTaxRuleService } = require('./services/taxRuleService');

const start = async () => {
  await connectMongo(config.mongoUri, logger);
  await syncBookingIndexes({
    BookingModel: Booking,
    logger
  });
  const cache = createCacheClient(config.redisUrl);
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
    },
    releasePromoReservation: async (booking) => {
      await eventServiceClient.post(`/api/events/${booking.eventId}/promo-codes/release`, {
        promoCodeId: booking.promoCode.promoCodeId,
        code: booking.promoCode.code,
        discountAmount: booking.promoCode.discountAmount || 0,
        bookingId: booking._id.toString()
      });
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

  const exchangeRateService = createExchangeRateService({
    cache,
    logger,
    baseUrl: config.exchangeRateApiBaseUrl
  });
  const taxRuleService = createTaxRuleService({
    defaultRules: [
      {
        country: 'IN',
        label: 'GST',
        rate: 18,
        registrationNumber: config.defaultInTaxRegistrationNumber
      },
      {
        country: 'UK',
        label: 'VAT',
        rate: 20,
        registrationNumber: config.defaultUkTaxRegistrationNumber
      }
    ]
  });
  await taxRuleService.ensureDefaultTaxRules();

  const refreshExchangeRateCache = async () => {
    try {
      await exchangeRateService.refreshCurrencies([
        config.reportingCurrency,
        'USD',
        'INR',
        'GBP',
        'EUR'
      ]);
    } catch (error) {
      logger.warn({
        message: 'Exchange-rate refresh skipped',
        error: error.message
      });
    }
  };

  void refreshExchangeRateCache();
  const refreshInterval = setInterval(refreshExchangeRateCache, 60 * 60 * 1000);
  refreshInterval.unref?.();

  const app = createApp({
    eventBus,
    automationService,
    cache,
    services: {
      exchangeRateService,
      taxRuleService
    }
  });
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
