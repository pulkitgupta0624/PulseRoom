const { createLogger, format, transports } = require('winston');

const buildLogger = (serviceName) =>
  createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: {
      service: serviceName
    },
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.printf(({ timestamp, level, message, service, ...meta }) =>
        JSON.stringify({
          timestamp,
          level,
          service,
          message,
          ...meta
        })
      )
    ),
    transports: [new transports.Console()]
  });

const createRequestLogger = (logger) => (req, _res, next) => {
  req.logger = logger.child({
    method: req.method,
    path: req.originalUrl
  });
  next();
};

module.exports = {
  buildLogger,
  createRequestLogger
};

