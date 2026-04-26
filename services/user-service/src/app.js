const { buildExpressApp, buildLogger, notFoundHandler, errorHandler } = require('@pulseroom/common');
const userRoutes = require('./routes/userRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

const config = require('./config');

const logger = buildLogger('user-service');

const createApp = ({ eventBus }) => {
  const app = buildExpressApp({
    serviceName: 'user-service',
    logger,
    corsOrigin: config.corsOrigin
  });

  app.use((req, _res, next) => {
    req.eventBus = eventBus;
    next();
  });

  app.use('/api/users', userRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

module.exports = {
  createApp,
  logger
};

