const jwt = require('jsonwebtoken');
const axios = require('axios');
const { AppError } = require('./errors');

const extractAccessToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '').trim();
  }
  return null;
};

const decodeOptionalToken = (req, secret = process.env.JWT_ACCESS_SECRET) => {
  const token = extractAccessToken(req);
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, secret);
  } catch (_error) {
    return null;
  }
};

const authenticate = (options = {}) => (req, _res, next) => {
  const token = extractAccessToken(req);
  if (!token) {
    return next(new AppError('Authentication required', 401, 'unauthorized'));
  }

  try {
    const payload = jwt.verify(token, options.secret || process.env.JWT_ACCESS_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return next(new AppError('Invalid or expired token', 401, 'invalid_token'));
  }
};

const authorize = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401, 'unauthorized'));
  }

  if (!allowedRoles.length || allowedRoles.includes(req.user.role)) {
    return next();
  }

  return next(new AppError('Forbidden', 403, 'forbidden'));
};

const createServiceClient = (baseURL, serviceName) =>
  axios.create({
    baseURL,
    timeout: 8000,
    headers: {
      'x-service-name': serviceName
    }
  });

module.exports = {
  extractAccessToken,
  decodeOptionalToken,
  authenticate,
  authorize,
  createServiceClient
};
