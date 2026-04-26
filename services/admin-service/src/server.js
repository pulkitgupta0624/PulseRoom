const http = require('http');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { connectMongo, RedisEventBus, DomainEvents } = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const AnalyticsSnapshot = require('./models/AnalyticsSnapshot');

const metricsByEvent = {
  [DomainEvents.USER_REGISTERED]: { users: 1 },
  [DomainEvents.ORGANIZER_VERIFIED]: { organizers: 1 },
  [DomainEvents.EVENT_CREATED]: { eventsCreated: 1 },
  [DomainEvents.EVENT_PUBLISHED]: { eventsPublished: 1 },
  [DomainEvents.BOOKING_CONFIRMED]: { bookingsConfirmed: 1 },
  [DomainEvents.CHAT_MESSAGE_SENT]: { chatMessages: 1 },
  [DomainEvents.POLL_RESPONSE]: { liveInteractions: 1 },
  [DomainEvents.QUESTION_POSTED]: { liveInteractions: 1 }
};

const applyMetricDelta = async (event, payload, io) => {
  const delta = metricsByEvent[event];
  if (!delta) {
    return;
  }

  if (event === DomainEvents.BOOKING_CONFIRMED) {
    delta.revenue = payload.amount || 0;
  }

  const update = Object.fromEntries(Object.entries(delta).map(([key, value]) => [`metrics.${key}`, value]));
  const snapshot = await AnalyticsSnapshot.findOneAndUpdate(
    { scope: 'global' },
    {
      $inc: update,
      $set: {
        lastEventAt: new Date()
      }
    },
    {
      new: true,
      upsert: true
    }
  ).lean();

  io.to('admins').emit('admin:analytics', snapshot);
};

const start = async () => {
  await connectMongo(config.mongoUri, logger);

  const eventBus = new RedisEventBus({
    redisUrl: config.redisUrl,
    serviceName: 'admin-service',
    logger
  });

  const pubClient = new Redis(config.redisUrl);
  const subClient = pubClient.duplicate();

  const io = new Server({
    path: '/socket/admin',
    cors: {
      origin: config.corsOrigin,
      credentials: true
    }
  });
  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = jwt.verify(token, config.jwtAccessSecret);
      if (payload.role !== 'admin') {
        return next(new Error('Admin access required'));
      }

      socket.user = payload;
      return next();
    } catch (_error) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join('admins');
  });

  await eventBus.subscribe(Object.keys(metricsByEvent), async ({ event, payload }) => {
    await applyMetricDelta(event, payload, io);
  });

  const app = createApp({ io });
  const server = http.createServer(app);
  io.attach(server);

  server.listen(config.port, () => {
    logger.info({
      message: 'Admin service started',
      port: config.port
    });
  });
};

start().catch((error) => {
  logger.error({
    message: 'Failed to start admin service',
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

