const http = require('http');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const {
  connectMongo,
  RedisEventBus,
  DomainEvents,
  createServiceClient
} = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const Message = require('./models/Message');
const ChatRestriction = require('./models/ChatRestriction');
const EventChatPolicy = require('./models/EventChatPolicy');
const {
  analyzeChatMessage,
  getSlowModeRetryMs,
  isPrivilegedChatRole,
  normalizeSlowModeSeconds
} = require('./services/trustSafetyService');
const { assertCanAccessEventRoom } = require('./services/eventRoomAccess');
const { buildPrivateRoomId } = require('./services/roomUtils');
const { consumeUserSlidingWindowQuota } = require('./services/socketRateLimiter');
const sanitizeHtml = require('sanitize-html');

const sanitize = (text) => sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });

const serializeChatPolicy = (policy = {}, eventId = '') => ({
  eventId: eventId || policy.eventId || '',
  slowModeSeconds: normalizeSlowModeSeconds(policy.slowModeSeconds),
  active: normalizeSlowModeSeconds(policy.slowModeSeconds) > 0,
  updatedAt: policy.updatedAt || null,
  updatedBy: policy.updatedBy || ''
});

const activeRestriction = async (eventId, userId) => {
  const now = new Date();
  const restrictions = await ChatRestriction.find({
    eventId,
    userId,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }]
  }).lean();
  return {
    isBanned: restrictions.some((item) => item.type === 'ban'),
    isMuted: restrictions.some((item) => item.type === 'mute')
  };
};

const loadChatPolicy = async (eventId) => {
  const policy = await EventChatPolicy.findOne({ eventId }).lean();
  return serializeChatPolicy(policy || {}, eventId);
};

const start = async () => {
  await connectMongo(config.mongoUri, logger);

  const eventBus = new RedisEventBus({
    redisUrl: config.redisUrl,
    serviceName: 'chat-service',
    logger
  });

  const pubClient = new Redis(config.redisUrl);
  const subClient = pubClient.duplicate();
  const eventServiceClient = createServiceClient(config.eventServiceUrl, 'chat-service');

  const io = new Server({
    path: '/socket/chat',
    cors: {
      origin: config.corsOrigin,
      credentials: true
    }
  });

  io.adapter(createAdapter(pubClient, subClient));

  const loadEventMeta = async (eventId) => {
    const response = await eventServiceClient.get(`/api/events/${eventId}/internal-meta`);
    return response.data.data;
  };

  const publishSafetyIncident = async ({ eventMeta, message, safetyAnalysis }) => {
    await eventBus.publish(DomainEvents.SAFETY_INCIDENT_DETECTED, {
      incidentType: 'chat_message',
      category: safetyAnalysis.category,
      severity: safetyAnalysis.severity,
      sourceService: 'chat-service',
      eventId: message.eventId,
      organizerId: eventMeta?.organizerId || '',
      eventTitle: eventMeta?.title || '',
      targetId: message._id.toString(),
      targetUserId: message.senderId,
      summary:
        safetyAnalysis.visibilityAction === 'hidden'
          ? `Chat message auto-hidden in ${eventMeta?.title || 'event room'}`
          : `Chat message flagged for review in ${eventMeta?.title || 'event room'}`,
      detail: `A live chat message triggered automated ${safetyAnalysis.category} detection with a ${safetyAnalysis.severity} severity score.`,
      riskScore: safetyAnalysis.riskScore,
      autoActions: safetyAnalysis.autoActions,
      evidence: safetyAnalysis.evidence,
      detectedAt: new Date(),
      metadata: {
        bodyPreview: String(message.body || '').slice(0, 220),
        senderRole: message.senderRole || '',
        moderationStatus: message.moderation?.status || 'visible'
      }
    });
  };

  const enforceSlowMode = async ({ eventId, socketUser }) => {
    if (isPrivilegedChatRole(socketUser.role)) {
      return {
        eventId,
        slowModeSeconds: 0,
        active: false,
        updatedAt: null,
        updatedBy: ''
      };
    }

    const policy = await loadChatPolicy(eventId);
    if (!policy.active) {
      return policy;
    }

    const lastMessage = await Message.findOne({
      roomType: 'event',
      roomId: eventId,
      senderId: socketUser.sub
    })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean();

    const retryMs = getSlowModeRetryMs({
      lastMessageAt: lastMessage?.createdAt || null,
      slowModeSeconds: policy.slowModeSeconds
    });

    return {
      ...policy,
      retryMs
    };
  };

  // ── Auth middleware ──────────────────────────────────────────────────────────
  io.use((socket, next) => {
    try {
      const raw =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!raw) return next(new Error('Authentication required'));

      const payload = jwt.verify(raw, config.jwtAccessSecret);
      socket.user = payload;
      return next();
    } catch (_error) {
      return next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ───────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    // Each user joins their personal room so they receive DM deliveries
    socket.join(`user:${socket.user.sub}`);

    const withinMessageRateLimit = async () => {
      const result = await consumeUserSlidingWindowQuota({
        cache: pubClient,
        logger,
        scope: 'messages',
        userId: socket.user.sub,
        windowMs: config.chatUserRateLimitWindowMs,
        maxRequests: config.chatUserRateLimitMax
      });

      if (result.allowed) {
        return true;
      }

      socket.emit('chat:error', {
        message: 'You are sending messages too quickly. Please wait a moment and try again.',
        code: 'chat_rate_limit_exceeded',
        retryAfterMs: result.retryAfterMs
      });
      return false;
    };

    // ── Join event room ──────────────────────────────────────────────────────
    socket.on('chat:join-event', async ({ eventId }) => {
      try {
        if (!eventId) return;
        const eventMeta = await loadEventMeta(eventId);
        assertCanAccessEventRoom({
          eventMeta,
          user: socket.user
        });

        socket.join(`event:${eventId}`);
        const policy = await loadChatPolicy(eventId);
        socket.emit('chat:policy-updated', policy);
      } catch (error) {
        logger.warn({ message: 'chat join denied', error: error.message, eventId });
        socket.emit('chat:error', {
          message: error.message || 'Event not available.',
          code: error.code || 'event_private'
        });
      }
    });

    // ── Join private room ────────────────────────────────────────────────────
    socket.on('chat:join-private', ({ participantId }) => {
      if (!participantId) return;
      const roomId = buildPrivateRoomId(socket.user.sub, participantId);
      socket.join(`private:${roomId}`);
    });

    // ── Send event message ───────────────────────────────────────────────────
    socket.on('chat:send-event-message', async ({ eventId, body }) => {
      try {
        if (!eventId || !body?.trim()) return;
        if (!(await withinMessageRateLimit())) return;

        const eventMeta = await loadEventMeta(eventId);
        assertCanAccessEventRoom({
          eventMeta,
          user: socket.user
        });

        const restriction = await activeRestriction(eventId, socket.user.sub);
        if (restriction.isBanned || restriction.isMuted) {
          socket.emit('chat:error', { message: 'You are restricted in this room.' });
          return;
        }

        const policy = await enforceSlowMode({
          eventId,
          socketUser: socket.user
        });
        if (policy.retryMs > 0) {
          socket.emit('chat:error', {
            message: `Slow mode is active. Please wait ${Math.ceil(policy.retryMs / 1000)}s before sending again.`,
            code: 'chat_slow_mode'
          });
          return;
        }

        const sanitizedBody = sanitize(body);
        const safetyAnalysis = analyzeChatMessage(sanitizedBody);

        const message = await Message.create({
          roomType: 'event',
          roomId: eventId,
          eventId,
          senderId: socket.user.sub,
          senderRole: socket.user.role,
          body: sanitizedBody,
          moderation: {
            status:
              safetyAnalysis.visibilityAction === 'hidden'
                ? 'hidden'
                : safetyAnalysis.visibilityAction === 'flagged'
                  ? 'flagged'
                  : 'visible',
            category: safetyAnalysis.category,
            severity: safetyAnalysis.severity,
            riskScore: safetyAnalysis.riskScore,
            evidence: safetyAnalysis.evidence
          }
        });

        if (message.moderation?.status !== 'hidden') {
          io.to(`event:${eventId}`).emit('chat:new-message', message);

          await eventBus.publish(DomainEvents.CHAT_MESSAGE_SENT, {
            messageId: message._id.toString(),
            eventId,
            senderId: socket.user.sub
          });
        } else {
          await eventBus.publish(DomainEvents.CHAT_MESSAGE_MODERATED, {
            messageId: message._id.toString(),
            eventId,
            userId: socket.user.sub,
            type: 'auto_hidden'
          });
          socket.emit('chat:error', {
            message: 'That message was held back by automated moderation.'
          });
        }

        if (safetyAnalysis.shouldCreateIncident) {
          await publishSafetyIncident({
            eventMeta,
            message,
            safetyAnalysis
          });
        }
      } catch (err) {
        logger.error({ message: 'chat:send-event-message error', error: err.message });
        socket.emit('chat:error', { message: 'Failed to send message.' });
      }
    });

    // ── Send private message ─────────────────────────────────────────────────
    socket.on('chat:send-private-message', async ({ recipientId, body, eventId = null }) => {
      try {
        if (!recipientId || !body?.trim()) return;
        if (!(await withinMessageRateLimit())) return;

        const roomId = buildPrivateRoomId(socket.user.sub, recipientId);

        const message = await Message.create({
          roomType: 'private',
          roomId,
          eventId,
          senderId: socket.user.sub,
          senderRole: socket.user.role,
          recipientId,
          body: sanitize(body)
        });

        // Deliver to anyone currently in the shared private room
        io.to(`private:${roomId}`).emit('chat:new-private-message', message);
        // Also push to recipient's personal room in case they aren't in the room yet
        io.to(`user:${recipientId}`).emit('chat:new-private-message', message);
      } catch (err) {
        logger.error({ message: 'chat:send-private-message error', error: err.message });
        socket.emit('chat:error', { message: 'Failed to send message.' });
      }
    });

    socket.on('disconnect', () => {
      logger.info({ message: 'Chat socket disconnected', userId: socket.user.sub });
    });
  });

  const app = createApp({ eventBus, io });
  const server = http.createServer(app);
  io.attach(server);

  server.listen(config.port, () => {
    logger.info({ message: 'Chat service started', port: config.port });
  });
};

start().catch((error) => {
  logger.error({
    message: 'Failed to start chat service',
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
