const { buildExpressApp, buildLogger, notFoundHandler, errorHandler } = require('@pulseroom/common');
const authRoutes = require('./routes/authRoutes');
const config = require('./config');

const logger = buildLogger('auth-service');

const createApp = ({ eventBus }) => {
  const app = buildExpressApp({
    serviceName: 'auth-service',
    logger,
    corsOrigin: config.corsOrigin
  });

  app.use((req, _res, next) => {
    req.eventBus = eventBus;
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

module.exports = {
  createApp,
  logger
};
