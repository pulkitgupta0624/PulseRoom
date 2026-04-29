const crypto = require('crypto');

const buildRateLimitKey = (scope, userId) => `chat:user-rate-limit:${scope}:${userId}`;

const consumeUserSlidingWindowQuota = async ({
  cache,
  logger,
  scope,
  userId,
  windowMs,
  maxRequests
}) => {
  if (!cache || !userId || !windowMs || !maxRequests) {
    return {
      allowed: true,
      count: 0,
      remaining: maxRequests,
      limit: maxRequests,
      retryAfterMs: 0
    };
  }

  const now = Date.now();
  const windowStart = now - windowMs;
  const key = buildRateLimitKey(scope, userId);
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
    return {
      allowed: count <= maxRequests,
      count,
      remaining: Math.max(0, maxRequests - count),
      limit: maxRequests,
      retryAfterMs: count > maxRequests ? windowMs : 0
    };
  } catch (error) {
    logger?.warn?.({
      message: 'Chat user rate limiter degraded',
      scope,
      userId,
      error: error.message
    });

    return {
      allowed: true,
      count: 0,
      remaining: maxRequests,
      limit: maxRequests,
      retryAfterMs: 0
    };
  }
};

module.exports = {
  consumeUserSlidingWindowQuota
};
