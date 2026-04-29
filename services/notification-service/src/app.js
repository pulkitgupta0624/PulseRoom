const {
  buildExpressApp,
  buildLogger,
  notFoundHandler,
  errorHandler,
  createServiceClient
} = require('@pulseroom/common');
const notificationRoutes = require('./routes/notificationRoutes');
const config = require('./config');

const logger = buildLogger('notification-service');

const createApp = ({ services = {} } = {}) => {
  const app = buildExpressApp({
    serviceName: 'notification-service',
    logger,
    corsOrigin: config.corsOrigin
  });

  app.use((req, _res, next) => {
    req.config = config;
    req.services = services;
    req.clients = {
      userService: createServiceClient(config.userServiceUrl, 'notification-service'),
      eventService: createServiceClient(config.eventServiceUrl, 'notification-service')
    };
    next();
  });

  app.use('/api/notifications', notificationRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

module.exports = {
  createApp,
  logger
};
