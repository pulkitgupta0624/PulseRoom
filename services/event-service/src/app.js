const { buildExpressApp, buildLogger, notFoundHandler, errorHandler, createServiceClient } = require('@pulseroom/common');
const eventRoutes = require('./routes/eventRoutes');
const config = require('./config');

const logger = buildLogger('event-service');

const createApp = ({ eventBus, cache, services = {} }) => {
  const app = buildExpressApp({
    serviceName: 'event-service',
    logger,
    corsOrigin: config.corsOrigin
  });

  app.use((req, _res, next) => {
    req.eventBus = eventBus;
    req.cache = cache;
    req.config = config;
    req.services = services;
    req.clients = {
      userService: createServiceClient(config.userServiceUrl, 'event-service')
    };
    next();
  });

  app.use('/api/events', eventRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

module.exports = {
  createApp,
  logger
};
