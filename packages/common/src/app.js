const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const { createRequestLogger } = require('./logger');

const buildExpressApp = ({ serviceName, logger, corsOrigin }) => {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true
    })
  );
  app.use(cookieParser());
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buffer) => {
        req.rawBody = buffer.toString();
      }
    })
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(mongoSanitize());
  app.use(hpp());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false
    })
  );
  app.use(createRequestLogger(logger));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      service: serviceName,
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  return app;
};

module.exports = {
  buildExpressApp
};
