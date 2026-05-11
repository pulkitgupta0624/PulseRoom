const {
  buildExpressApp,
  buildLogger,
  notFoundHandler,
  errorHandler
} = require('@pulseroom/common');
const gamificationRoutes = require('./routes/gamificationRoutes');
const config = require('./config');

const logger = buildLogger('gamification-service');

const createApp = () => {
  const app = buildExpressApp({
    serviceName: 'gamification-service',
    logger,
    corsOrigin: config.corsOrigin
  });

  app.use('/api/gamification', gamificationRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

module.exports = {
  createApp,
  logger
};
