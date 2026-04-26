const { buildExpressApp, buildLogger, notFoundHandler, errorHandler } = require('@pulseroom/common');
const liveRoutes = require('./routes/liveRoutes');
const config = require('./config');

const logger = buildLogger('live-service');

const createApp = ({ eventBus, io }) => {
  const app = buildExpressApp({
    serviceName: 'live-service',
    logger,
    corsOrigin: config.corsOrigin
  });

  app.use((req, _res, next) => {
    req.eventBus = eventBus;
    req.io = io;
    next();
  });

  app.use('/api/live', liveRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

module.exports = {
  createApp,
  logger
};

