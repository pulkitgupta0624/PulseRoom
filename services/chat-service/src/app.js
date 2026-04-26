const { buildExpressApp, buildLogger, notFoundHandler, errorHandler } = require('@pulseroom/common');
const chatRoutes = require('./routes/chatRoutes');
const config = require('./config');

const logger = buildLogger('chat-service');

const createApp = ({ eventBus, io }) => {
  const app = buildExpressApp({
    serviceName: 'chat-service',
    logger,
    corsOrigin: config.corsOrigin
  });

  app.use((req, _res, next) => {
    req.eventBus = eventBus;
    req.io = io;
    next();
  });

  app.use('/api/chat', chatRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

module.exports = {
  createApp,
  logger
};

