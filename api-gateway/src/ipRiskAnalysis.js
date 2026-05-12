const crypto = require('crypto');

const DEFAULT_SUSPICIOUS_USER_AGENT_PATTERNS = [
  /curl/i,
  /python-requests/i,
  /scrapy/i,
  /httpclient/i,
  /headless/i,
  /bot/i
];

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    return String(forwardedFor).split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const buildRiskKey = ({ ipHash, scope, bucket }) =>
  `gateway:ip-risk:${scope}:${ipHash}:${bucket}`;

const hashIp = (ip, salt) =>
  crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);

const createIpRiskAnalyzer = ({
  cache,
  logger,
  enabled,
  windowMs,
  blockThreshold,
  challengeThreshold,
  loginAttemptThreshold,
  salt,
  suspiciousUserAgentPatterns = DEFAULT_SUSPICIOUS_USER_AGENT_PATTERNS
}) => {
  if (!enabled || !cache || !windowMs || !blockThreshold) {
    return (_req, _res, next) => next();
  }

  return async (req, res, next) => {
    const ip = getClientIp(req);
    const ipHash = hashIp(ip, salt);
    const now = Date.now();
    const bucket = Math.floor(now / windowMs);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 220);
    const routeScope = req.originalUrl?.split('?')[0] || req.path || 'unknown';
    const isLoginAttempt = req.method === 'POST' && routeScope === '/api/auth/login';
    const suspiciousUserAgent = suspiciousUserAgentPatterns.some((pattern) => pattern.test(userAgent));

    try {
      const requestKey = buildRiskKey({ ipHash, scope: 'requests', bucket });
      const loginKey = buildRiskKey({ ipHash, scope: 'login-attempts', bucket });
      const pathKey = buildRiskKey({ ipHash, scope: 'paths', bucket });
      const uaKey = buildRiskKey({ ipHash, scope: 'user-agents', bucket });

      const pipeline = cache
        .multi()
        .incr(requestKey)
        .sadd(pathKey, routeScope)
        .sadd(uaKey, userAgent || 'empty')
        .pexpire(requestKey, windowMs * 2)
        .pexpire(pathKey, windowMs * 2)
        .pexpire(uaKey, windowMs * 2)
        .scard(pathKey)
        .scard(uaKey);

      if (isLoginAttempt) {
        pipeline.incr(loginKey).pexpire(loginKey, windowMs * 2);
      }

      const results = await pipeline.exec();
      const requestCount = Number(results?.[0]?.[1] || 0);
      const distinctPaths = Number(results?.[6]?.[1] || 0);
      const distinctUserAgents = Number(results?.[7]?.[1] || 0);
      const loginAttempts = isLoginAttempt ? Number(results?.[8]?.[1] || 0) : 0;

      let riskScore = 0;
      if (requestCount > blockThreshold) {
        riskScore += 70;
      } else if (requestCount > challengeThreshold) {
        riskScore += 35;
      }
      if (isLoginAttempt && loginAttempts > loginAttemptThreshold) {
        riskScore += 45;
      }
      if (distinctPaths > 40) {
        riskScore += 15;
      }
      if (distinctUserAgents > 8) {
        riskScore += 15;
      }
      if (suspiciousUserAgent) {
        riskScore += 20;
      }

      req.ipRisk = {
        ipHash,
        riskScore,
        requestCount,
        loginAttempts,
        distinctPaths,
        distinctUserAgents,
        suspiciousUserAgent
      };

      res.setHeader('X-IP-Risk-Score', String(Math.min(100, riskScore)));

      if (riskScore >= 70) {
        logger.warn({
          message: 'High-risk IP blocked at gateway',
          ipHash,
          routeScope,
          requestCount,
          loginAttempts,
          distinctPaths,
          distinctUserAgents,
          suspiciousUserAgent
        });

        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(windowMs / 1000))));
        return res.status(429).json({
          success: false,
          message: 'Traffic from this network looks unusual. Please wait a moment and try again.',
          code: 'ip_risk_blocked'
        });
      }

      if (riskScore >= 40) {
        res.setHeader('X-IP-Risk-Action', 'monitor');
      }

      return next();
    } catch (error) {
      logger.warn({
        message: 'IP risk analyzer degraded',
        ipHash,
        error: error.message
      });
      return next();
    }
  };
};

module.exports = {
  createIpRiskAnalyzer,
  getClientIp
};
