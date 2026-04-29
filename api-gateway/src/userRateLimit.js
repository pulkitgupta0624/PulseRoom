const crypto = require('crypto');
const { decodeOptionalToken } = require('@pulseroom/common');

const buildUserRateLimitKey = (scope, userId) => `gateway:user-rate-limit:${scope}:${userId}`;

const createUserSlidingWindowRateLimiter = ({ cache, logger, scope, windowMs, maxRequests }) => {
  if (!cache || !windowMs || !maxRequests) {
    return (_req, _res, next) => next();
  }

  return async (req, res, next) => {
    const tokenPayload = decodeOptionalToken(req);
    const userId = tokenPayload?.sub;

    if (!userId) {
      return next();
    }

    const now = Date.now();
    const windowStart = now - windowMs;
    const key = buildUserRateLimitKey(scope, userId);
    const member = `${now}:${crypto.randomUUID()}`;

    try {
      const results = await cache
        .multi()
        .zremrangebyscore(key, 0, windowStart)
        .zadd(key, now, member)
        .zcard(key)
        .pexpire(key, windowMs)
        .exec();

      const count = Number(results?.[2]?.[1] || 0);
      const remaining = Math.max(0, maxRequests - count);

      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Window-Ms', String(windowMs));

      if (count > maxRequests) {
        const retryAfterSeconds = Math.max(1, Math.ceil(windowMs / 1000));
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          success: false,
          message: 'Too many requests for this account. Please slow down and try again shortly.',
          code: 'user_rate_limit_exceeded'
        });
      }

      return next();
    } catch (error) {
      logger.warn({
        message: 'User rate limiter degraded',
        scope,
        userId,
        error: error.message
      });
      return next();
    }
  };
};

module.exports = {
  createUserSlidingWindowRateLimiter
};
