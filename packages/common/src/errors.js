class AppError extends Error {
  constructor(message, statusCode = 500, code = 'internal_error', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const notFoundHandler = (_req, _res, next) => {
  next(new AppError('Resource not found', 404, 'not_found'));
};

const errorHandler = (logger) => (error, req, res, _next) => {
  const statusCode = error.statusCode || 500;
  const payload = {
    success: false,
    message: error.message || 'Something went wrong',
    code: error.code || 'internal_error'
  };

  if (error.details) {
    payload.details = error.details;
  }

  const logPayload = {
    message: error.message,
    method: req.method,
    path: req.originalUrl,
    statusCode
  };

  if (statusCode >= 500) {
    logPayload.stack = error.stack;
    logger.error(logPayload);
  } else {
    logger.warn(logPayload);
  }

  res.status(statusCode).json(payload);
};

module.exports = {
  AppError,
  notFoundHandler,
  errorHandler
};
