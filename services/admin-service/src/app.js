const {
  buildExpressApp,
  buildLogger,
  notFoundHandler,
  errorHandler,
  createServiceClient
} = require('@pulseroom/common');
const adminRoutes = require('./routes/adminRoutes');
const config = require('./config');

const logger = buildLogger('admin-service');

const createApp = ({ io }) => {
  const app = buildExpressApp({
    serviceName: 'admin-service',
    logger,
    corsOrigin: config.corsOrigin
  });

  app.use((req, _res, next) => {
    req.io = io;
    req.clients = {
      userService: createServiceClient(config.userServiceUrl, 'admin-service'),
      eventService: createServiceClient(config.eventServiceUrl, 'admin-service')
    };
    next();
  });

  app.use('/api/admin', adminRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

module.exports = {
  createApp,
  logger
};

