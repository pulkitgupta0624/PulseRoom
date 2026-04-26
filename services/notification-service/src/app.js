const { buildExpressApp, buildLogger, notFoundHandler, errorHandler } = require('@pulseroom/common');
const notificationRoutes = require('./routes/notificationRoutes');
const config = require('./config');

const logger = buildLogger('notification-service');

const createApp = () => {
  const app = buildExpressApp({
    serviceName: 'notification-service',
    logger,
    corsOrigin: config.corsOrigin
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

