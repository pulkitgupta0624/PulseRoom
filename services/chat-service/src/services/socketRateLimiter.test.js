const { consumeUserSlidingWindowQuota } = require('./socketRateLimiter');

const createCacheMock = (count) => ({
  multi() {
    return {
      zremrangebyscore() {
        return this;
      },
      zadd() {
        return this;
      },
      zcard() {
        return this;
      },
      pexpire() {
        return this;
      },
      exec() {
        return Promise.resolve([
          [null, 0],
          [null, 1],
          [null, count],
          [null, 'OK']
        ]);
      }
    };
  }
});

describe('socketRateLimiter', () => {
  test('allows requests inside the configured quota', async () => {
    const result = await consumeUserSlidingWindowQuota({
      cache: createCacheMock(3),
      scope: 'messages',
      userId: 'user-1',
      windowMs: 60_000,
      maxRequests: 5
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  test('blocks requests after the quota is exceeded', async () => {
    const result = await consumeUserSlidingWindowQuota({
      cache: createCacheMock(6),
      scope: 'messages',
      userId: 'user-1',
      windowMs: 60_000,
      maxRequests: 5
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBe(60_000);
  });
});
