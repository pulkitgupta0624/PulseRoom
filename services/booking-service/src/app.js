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

const createApp = ({ eventBus, automationService }) => {
  const app = buildExpressApp({
    serviceName: 'booking-service',
    logger,
    corsOrigin: config.corsOrigin
  });

  app.use((req, _res, next) => {
    req.eventBus = eventBus;
    req.automationService = automationService;
    req.config = config;
    req.clients = {
      eventService: createServiceClient(config.eventServiceUrl, 'booking-service')
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
