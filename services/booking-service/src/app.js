const {
  buildExpressApp,
  buildLogger,
  notFoundHandler,
  errorHandler,
  createServiceClient
} = require('@pulseroom/common');
const bookingRoutes = require('./routes/bookingRoutes');
const config = require('./config');

const logger = buildLogger('booking-service');

const createApp = ({ eventBus, automationService, cache, services = {} }) => {
  const app = buildExpressApp({
    serviceName: 'booking-service',
    logger,
    corsOrigin: config.corsOrigin
  });

  app.use((req, _res, next) => {
    req.eventBus = eventBus;
    req.automationService = automationService;
    req.cache = cache;
    req.services = services;
    req.config = config;
    req.clients = {
      eventService: createServiceClient(config.eventServiceUrl, 'booking-service'),
      userService: createServiceClient(config.userServiceUrl, 'booking-service'),
      gamificationService: createServiceClient(config.gamificationServiceUrl, 'booking-service')
    };
    next();
  });

  app.use('/api/bookings', bookingRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

module.exports = {
  createApp,
  logger
};
