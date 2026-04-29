const http = require('http');
const crypto = require('crypto');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const {
  buildExpressApp,
  buildLogger,
  notFoundHandler,
  errorHandler,
  createServiceClient,
  createCacheClient
} = require('@pulseroom/common');
const config = require('./config');
const { createUserSlidingWindowRateLimiter } = require('./userRateLimit');

const logger = buildLogger('api-gateway');
const app = buildExpressApp({
  serviceName: 'api-gateway',
  logger,
  corsOrigin: config.corsOrigin
});
const cache = createCacheClient(config.redisUrl);

app.use((req, _res, next) => {
  req.requestId = crypto.randomUUID();
  next();
});

const serviceClients = Object.fromEntries(
  Object.entries(config.services).map(([name, url]) => [name, createServiceClient(url, 'api-gateway')])
);

const withProxyHeaders = (proxyReq, req) => {
  if (req.requestId) {
    proxyReq.setHeader('x-request-id', req.requestId);
  }
  if (req.headers?.authorization) {
    proxyReq.setHeader('authorization', req.headers.authorization);
  }
};

const handleProxyError = (error, _req, res) => {
  logger.error({ message: 'Upstream service unavailable', error: error.message });

  // res is an http.ServerResponse for HTTP, but a net.Socket for WebSocket upgrades
  if (res && typeof res.status === 'function') {
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        message: 'Upstream service unavailable',
        code: 'bad_gateway'
      });
    }
  } else if (res && typeof res.end === 'function') {
    res.end(); // gracefully close the socket
  }
};

const bookingUserRateLimit = createUserSlidingWindowRateLimiter({
  cache,
  logger,
  scope: 'bookings',
  ...config.userRateLimiting.bookings
});

const chatUserRateLimit = createUserSlidingWindowRateLimiter({
  cache,
  logger,
  scope: 'chat',
  ...config.userRateLimiting.chat
});

const liveUserRateLimit = createUserSlidingWindowRateLimiter({
  cache,
  logger,
  scope: 'live',
  ...config.userRateLimiting.live
});

const routeMappings = [
  ['/api/auth', config.services.auth],
  ['/api/users', config.services.users],
  ['/api/uploads', config.services.users],
  ['/api/events', config.services.events],
  ['/api/bookings', config.services.bookings],
  ['/api/chat', config.services.chat],
  ['/api/notifications', config.services.notifications],
  ['/api/live', config.services.live],
  ['/api/admin', config.services.admin]
];

for (const [routePath, target] of routeMappings) {
  if (routePath === '/api/bookings') {
    app.use(routePath, bookingUserRateLimit);
  }

  if (routePath === '/api/chat') {
    app.use(routePath, chatUserRateLimit);
  }

  if (routePath === '/api/live') {
    app.use(routePath, liveUserRateLimit);
  }

  app.use(
    routePath,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: false,
      pathRewrite: (reqPath) => `${routePath}${reqPath}`,
      on: {
        proxyReq: (proxyReq, req, res) => {
          withProxyHeaders(proxyReq, req);
          fixRequestBody(proxyReq, req, res);
        },
        error: handleProxyError
      }
    })
  );
}

const chatWsProxy = createProxyMiddleware({
  target: config.services.chat,
  changeOrigin: true,
  ws: true,
  on: {
    proxyReqWs: withProxyHeaders,
    error: handleProxyError
  }
});

const liveWsProxy = createProxyMiddleware({
  target: config.services.live,
  changeOrigin: true,
  ws: true,
  on: {
    proxyReqWs: withProxyHeaders,
    error: handleProxyError
  }
});

const adminWsProxy = createProxyMiddleware({
  target: config.services.admin,
  changeOrigin: true,
  ws: true,
  on: {
    proxyReqWs: withProxyHeaders,
    error: handleProxyError
  }
});

app.use('/socket/chat', chatWsProxy);
app.use('/socket/live', liveWsProxy);
app.use('/socket/admin', adminWsProxy);

app.get('/health', async (_req, res) => {
  const serviceStatuses = await Promise.all(
    Object.entries(serviceClients).map(async ([name, client]) => {
      try {
        const response = await client.get('/health');
        return {
          name,
          status: response.data.status,
          url: client.defaults.baseURL
        };
      } catch (error) {
        return {
          name,
          status: 'down',
          url: client.defaults.baseURL,
          error: error.message
        };
      }
    })
  );

  res.status(200).json({
    success: true,
    gateway: 'ok',
    services: serviceStatuses
  });
});

app.use(notFoundHandler);
app.use(errorHandler(logger));

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/socket/chat')) {
    chatWsProxy.upgrade(req, socket, head);
    return;
  }
  if (req.url.startsWith('/socket/live')) {
    liveWsProxy.upgrade(req, socket, head);
    return;
  }
  if (req.url.startsWith('/socket/admin')) {
    adminWsProxy.upgrade(req, socket, head);
    return;
  }
});

server.listen(config.port, () => {
  logger.info({
    message: 'API gateway started',
    port: config.port
  });
});
