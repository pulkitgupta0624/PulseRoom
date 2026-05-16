const http = require('http');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { connectMongo, RedisEventBus, DomainEvents, createServiceClient } = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const AnalyticsSnapshot = require('./models/AnalyticsSnapshot');
const SafetyIncident = require('./models/SafetyIncident');
const { serializeSafetyIncident } = require('./services/safetyIncidentService');
const {
  buildEventSafetyRoom,
  canSubscribeToEventIncidents,
  canUseIncidentSocket
} = require('./services/incidentSocketAccessService');

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

const loadEventMeta = async (eventServiceClient, eventId) => {
  const response = await eventServiceClient.get(`/api/events/${eventId}/internal-meta`);
  return response.data.data;
};

const persistSafetyIncident = async (payload = {}, io) => {
  const incident = await SafetyIncident.create({
    incidentType: payload.incidentType,
    category: payload.category,
    severity: payload.severity,
    status: payload.status || 'open',
    sourceService: payload.sourceService || '',
    eventId: payload.eventId || '',
    organizerId: payload.organizerId || '',
    eventTitle: payload.eventTitle || '',
    targetId: payload.targetId,
    targetUserId: payload.targetUserId || '',
    summary: payload.summary,
    detail: payload.detail || '',
    riskScore: Number(payload.riskScore || 0),
    autoActions: Array.isArray(payload.autoActions) ? payload.autoActions : [],
    evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
    metadata: payload.metadata || {},
    detectedAt: payload.detectedAt || new Date()
  });

  const serializedIncident = serializeSafetyIncident(incident);
  io.to('admins').emit('admin:safety-incident', serializedIncident);

  if (serializedIncident.eventId) {
    io.to(buildEventSafetyRoom(serializedIncident.eventId)).emit('event:safety-incident', serializedIncident);
  }
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
  const eventServiceClient = createServiceClient(config.eventServiceUrl, 'admin-service');

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
      if (!canUseIncidentSocket(payload)) {
        return next(new Error('Organizer, moderator, or admin access required'));
      }

      socket.user = payload;
      return next();
    } catch (_error) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.user.role === 'admin') {
      socket.join('admins');
    }

    socket.on('admin:join-event', async ({ eventId }) => {
      const normalizedEventId = String(eventId || '').trim();
      if (!normalizedEventId) {
        socket.emit('admin:error', {
          message: 'Event id is required to subscribe to live safety incidents.'
        });
        return;
      }

      try {
        const eventMeta = await loadEventMeta(eventServiceClient, normalizedEventId);

        if (!canSubscribeToEventIncidents({
          user: socket.user,
          eventMeta
        })) {
          socket.emit('admin:error', {
            message: 'You do not have access to this event safety feed.'
          });
          return;
        }

        socket.join(buildEventSafetyRoom(normalizedEventId));
        socket.emit('admin:event-joined', {
          eventId: normalizedEventId
        });
      } catch (error) {
        socket.emit('admin:error', {
          message: error.response?.status === 404
            ? 'Event not found.'
            : 'Unable to subscribe to this event safety feed right now.'
        });
      }
    });

    socket.on('admin:leave-event', ({ eventId }) => {
      const normalizedEventId = String(eventId || '').trim();
      if (!normalizedEventId) {
        return;
      }

      socket.leave(buildEventSafetyRoom(normalizedEventId));
    });
  });

  await eventBus.subscribe(
    [...Object.keys(metricsByEvent), DomainEvents.SAFETY_INCIDENT_DETECTED],
    async ({ event, payload }) => {
      if (event === DomainEvents.SAFETY_INCIDENT_DETECTED) {
        await persistSafetyIncident(payload, io);
        return;
      }

      await applyMetricDelta(event, payload, io);
    }
  );

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
