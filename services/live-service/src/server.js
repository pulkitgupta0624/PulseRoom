const http = require('http');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { connectMongo, RedisEventBus, DomainEvents, createServiceClient } = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const Poll = require('./models/Poll');
const Question = require('./models/Question');
const Announcement = require('./models/Announcement');
const ReactionCounter = require('./models/ReactionCounter');
const StreamSession = require('./models/StreamSession');
const { incrementEngagementMetric } = require('./services/engagementAnalyticsService');
const { buildAuthorProfile, serializeQuestionThread } = require('./services/questionThreadService');
const { createRecordingUploadService } = require('./services/recordingUploadService');
const { markRecordingFailed } = require('./services/recordingSessionService');

const ALLOWED_EMOJIS = new Set(['🔥', '👏', '❤️', '🚀', '😂', '🤯']);
const BOOKING_RATE_TTL_SECONDS = 6 * 60 * 60;
const streamRooms = new Map();

const buildOrganizerRoom = (organizerId) => `organizer:${organizerId}`;
const buildStreamRoomKey = (eventId) => `live:stream-room:${eventId}`;
const buildStreamViewerKey = (eventId) => `live:stream-viewers:${eventId}`;

const buildHourlyRateBucket = (value = new Date()) => {
  const date = new Date(value);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
};

const getStreamPayload = (eventId, room) => ({
  eventId,
  status: room?.broadcasterSocketId ? 'live' : 'idle',
  viewerCount: room?.viewerCount ?? room?.viewers?.size ?? 0,
  broadcasterId: room?.broadcasterId || null,
  startedAt: room?.startedAt || null
});

const start = async () => {
  await connectMongo(config.mongoUri, logger);
  await StreamSession.updateMany(
    { status: 'live' },
    {
      $set: {
        status: 'ended',
        endedAt: new Date(),
        viewerCount: 0
      }
    }
  );
  await StreamSession.updateMany(
    { 'recording.status': 'uploading' },
    {
      $set: {
        'recording.status': 'failed',
        'recording.failedAt': new Date(),
        'recording.error': 'Live service restarted before the replay upload could finish.'
      }
    }
  );

  const eventBus = new RedisEventBus({
    redisUrl: config.redisUrl,
    serviceName: 'live-service',
    logger
  });
  const recordingUploadService = createRecordingUploadService({
    config,
    logger,
    onUploadFailure: ({ eventId, recordingSessionId, mimeType, reason, error }) =>
      markRecordingFailed({
        eventId,
        recordingSessionId,
        mimeType,
        errorMessage: error?.message || reason || 'Replay upload failed'
      })
  });
  const eventServiceClient = createServiceClient(config.eventServiceUrl, 'live-service');
  const bookingRateClient = new Redis(config.redisUrl);

  const loadEventMeta = async (eventId) => {
    const response = await eventServiceClient.get(`/api/events/${eventId}/internal-meta`);
    return response.data.data;
  };

  const isEventOwner = (eventMeta, user) =>
    String(eventMeta?.organizerId || '') === String(user?.sub || '');

  const canBroadcastEvent = async (socket, eventId) => {
    const eventMeta = await loadEventMeta(eventId);
    return (
      socket.user.role === 'admin' ||
      (socket.user.role === 'organizer' && isEventOwner(eventMeta, socket.user))
    );
  };

  const canManageLiveEvent = async (socket, eventId) => {
    const eventMeta = await loadEventMeta(eventId);
    return (
      ['admin', 'moderator'].includes(socket.user.role) ||
      (socket.user.role === 'organizer' && isEventOwner(eventMeta, socket.user))
    );
  };

  const detectBookingRateSpike = async (payload) => {
    const organizerId = String(payload?.organizerId || '').trim();
    const eventId = String(payload?.eventId || '').trim();
    if (!organizerId || !eventId) {
      return null;
    }

    const confirmedAt = payload?.confirmedAt || new Date().toISOString();
    const currentBucket = buildHourlyRateBucket(confirmedAt);
    const previousBucket = buildHourlyRateBucket(new Date(new Date(currentBucket).getTime() - 60 * 60 * 1000));
    const counterKey = `organizer:booking-rate:${organizerId}:${eventId}`;
    const currentWindowCount = await bookingRateClient.hincrby(counterKey, currentBucket, 1);
    await bookingRateClient.expire(counterKey, BOOKING_RATE_TTL_SECONDS);

    const previousWindowCount = Number((await bookingRateClient.hget(counterKey, previousBucket)) || 0);
    if (previousWindowCount <= 0 || currentWindowCount < previousWindowCount * 2 || currentWindowCount < 2) {
      return null;
    }

    const alertKey = `organizer:booking-rate-alert:${organizerId}:${eventId}:${currentBucket}`;
    const shouldEmit = await bookingRateClient.set(alertKey, '1', 'EX', BOOKING_RATE_TTL_SECONDS, 'NX');
    if (!shouldEmit) {
      return null;
    }

    return {
      organizerId,
      eventId,
      eventTitle: payload?.eventTitle || 'Event',
      currentWindowCount,
      previousWindowCount,
      growthFactor: Number((currentWindowCount / previousWindowCount).toFixed(2)),
      confirmedAt
    };
  };

  const emitOrganizerBookingActivity = async (io, payload) => {
    const organizerId = String(payload?.organizerId || '').trim();
    if (!organizerId) {
      return;
    }

    const room = buildOrganizerRoom(organizerId);
    io.to(room).emit('organizer:booking-confirmed', {
      organizerId,
      eventId: payload.eventId,
      eventTitle: payload.eventTitle || 'Event',
      bookingId: payload.bookingId,
      attendeeName: payload.attendeeName || payload.attendeeEmail || 'New attendee',
      attendeeEmail: payload.attendeeEmail || '',
      quantity: Number(payload.quantity || 0),
      reportingAmount: Number(payload.reportingAmount ?? payload.amount ?? 0),
      confirmedAt: payload.confirmedAt || new Date().toISOString()
    });

    const spike = await detectBookingRateSpike(payload);
    if (spike) {
      io.to(room).emit('organizer:booking-spike', spike);
    }
  };

  let io;

  await eventBus.subscribe(
    [
      DomainEvents.CHAT_MESSAGE_SENT,
      DomainEvents.POLL_RESPONSE,
      DomainEvents.QUESTION_POSTED,
      DomainEvents.BOOKING_CONFIRMED
    ],
    async ({ event, payload }) => {
      if (!payload?.eventId) {
        return;
      }

      if (event === DomainEvents.BOOKING_CONFIRMED) {
        if (io) {
          await emitOrganizerBookingActivity(io, payload);
        }
        return;
      }

      if (event === DomainEvents.CHAT_MESSAGE_SENT) {
        await incrementEngagementMetric({
          eventId: payload.eventId,
          field: 'chatMessages'
        });
      }

      if (event === DomainEvents.POLL_RESPONSE) {
        await incrementEngagementMetric({
          eventId: payload.eventId,
          field: 'pollVotes'
        });
      }

      if (event === DomainEvents.QUESTION_POSTED) {
        await incrementEngagementMetric({
          eventId: payload.eventId,
          field: 'questions'
        });
      }
    }
  );

  const pubClient = new Redis(config.redisUrl);
  const subClient = pubClient.duplicate();

  io = new Server({
    path: '/socket/live',
    cors: {
      origin: config.corsOrigin,
      credentials: true
    }
  });
  io.adapter(createAdapter(pubClient, subClient));

  const loadStreamRoom = async (eventId) => {
    const [room, viewerCount] = await Promise.all([
      pubClient.hgetall(buildStreamRoomKey(eventId)),
      pubClient.scard(buildStreamViewerKey(eventId))
    ]);

    if (!room?.broadcasterSocketId) {
      return null;
    }

    return {
      broadcasterSocketId: room.broadcasterSocketId,
      broadcasterId: room.broadcasterId,
      startedAt: room.startedAt ? new Date(room.startedAt) : null,
      viewerCount
    };
  };

  const saveStreamRoom = async (eventId, room) => {
    await pubClient
      .multi()
      .hmset(buildStreamRoomKey(eventId), {
        broadcasterSocketId: room.broadcasterSocketId,
        broadcasterId: room.broadcasterId,
        startedAt: room.startedAt.toISOString()
      })
      .expire(buildStreamRoomKey(eventId), 24 * 60 * 60)
      .expire(buildStreamViewerKey(eventId), 24 * 60 * 60)
      .exec();
  };

  const clearStreamRoom = async (eventId) => {
    await pubClient.del(buildStreamRoomKey(eventId), buildStreamViewerKey(eventId));
  };

  const syncStreamSession = async (eventId) => {
    const room = await loadStreamRoom(eventId);
    if (!room?.broadcasterSocketId) {
      await StreamSession.findOneAndUpdate(
        { eventId },
        {
          $set: {
            status: 'ended',
            endedAt: new Date(),
            viewerCount: 0
          }
        }
      );
      return;
    }

    await StreamSession.findOneAndUpdate(
      { eventId },
      {
        $set: {
          broadcasterId: room.broadcasterId,
          status: 'live',
          startedAt: room.startedAt,
          endedAt: null,
          viewerCount: room.viewerCount || 0
        }
      },
      {
        new: true,
        upsert: true
      }
    );
  };

  const emitStreamStatus = async (eventId) => {
    const room = await loadStreamRoom(eventId);
    await syncStreamSession(eventId);
    io.to(`live:${eventId}`).emit('stream:status', getStreamPayload(eventId, room));
  };

  const removeViewerFromRoom = async (eventId, viewerSocketId) => {
    const removed = await pubClient.srem(buildStreamViewerKey(eventId), viewerSocketId);
    const room = await loadStreamRoom(eventId);
    if (!removed || !room?.broadcasterSocketId) {
      return;
    }

    io.to(room.broadcasterSocketId).emit('stream:viewer-left', {
      eventId,
      viewerSocketId
    });
    await emitStreamStatus(eventId);
  };

  const stopBroadcast = async (socket, eventId, reason = 'ended') => {
    const room = await loadStreamRoom(eventId);
    if (!room || room.broadcasterSocketId !== socket.id) {
      return;
    }

    streamRooms.delete(eventId);
    await clearStreamRoom(eventId);
    io.to(`live:${eventId}`).emit('stream:ended', {
      eventId,
      reason
    });
    await emitStreamStatus(eventId);
  };

  io.use((socket, next) => {
    try {
      const raw =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!raw) {
        return next(new Error('Authentication required'));
      }

      const payload = jwt.verify(raw, config.jwtAccessSecret);
      socket.user = payload;
      return next();
    } catch (_error) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('organizer:join-dashboard', ({ organizerId } = {}) => {
      const requestedOrganizerId = String(organizerId || socket.user.sub || '').trim();
      const canJoinOwnRoom =
        socket.user.role === 'admin' ||
        (socket.user.role === 'organizer' && requestedOrganizerId === String(socket.user.sub || ''));

      if (!requestedOrganizerId || !canJoinOwnRoom) {
        socket.emit('organizer:error', { message: 'Not authorized for organizer dashboard updates.' });
        return;
      }

      socket.join(buildOrganizerRoom(requestedOrganizerId));
    });

    socket.on('organizer:leave-dashboard', ({ organizerId } = {}) => {
      const requestedOrganizerId = String(organizerId || socket.user.sub || '').trim();
      if (!requestedOrganizerId) {
        return;
      }

      socket.leave(buildOrganizerRoom(requestedOrganizerId));
    });

    socket.on('live:join', ({ eventId }) => {
      if (!eventId) {
        return;
      }

      socket.join(`live:${eventId}`);
      loadStreamRoom(eventId)
        .then((room) => socket.emit('stream:status', getStreamPayload(eventId, room)))
        .catch((error) => logger.warn({ message: 'stream status lookup failed', error: error.message }));
    });

    socket.on('stream:start-broadcast', async ({ eventId }) => {
      try {
        if (!eventId) {
          return;
        }

        if (!(await canBroadcastEvent(socket, eventId))) {
          socket.emit('stream:error', { message: 'Only this event organizer can start the broadcast.' });
          return;
        }

        const existing = await loadStreamRoom(eventId);
        if (existing?.broadcasterSocketId && existing.broadcasterSocketId !== socket.id) {
          socket.emit('stream:error', { message: 'A broadcast is already active for this event.' });
          return;
        }

        const nextRoom = {
          broadcasterSocketId: socket.id,
          broadcasterId: socket.user.sub,
          viewers: streamRooms.get(eventId)?.viewers || new Set(),
          startedAt: existing?.startedAt || new Date()
        };
        streamRooms.set(eventId, nextRoom);
        socket.data.broadcastEventIds = new Set([...(socket.data.broadcastEventIds || []), eventId]);
        await saveStreamRoom(eventId, nextRoom);

        await emitStreamStatus(eventId);
      } catch (error) {
        logger.error({ message: 'stream:start-broadcast error', error: error.message });
        socket.emit('stream:error', { message: 'Unable to start the broadcast.' });
      }
    });

    socket.on('stream:stop-broadcast', async ({ eventId }) => {
      await stopBroadcast(socket, eventId);
    });

    socket.on('stream:viewer-ready', async ({ eventId }) => {
      try {
        if (!eventId) {
          return;
        }

        const room = await loadStreamRoom(eventId);
        if (!room?.broadcasterSocketId || room.broadcasterSocketId === socket.id) {
          socket.emit('stream:status', getStreamPayload(eventId, room));
          return;
        }

        const wasPresent = !(await pubClient.sadd(buildStreamViewerKey(eventId), socket.id));
        socket.data.viewingEventIds = new Set([...(socket.data.viewingEventIds || []), eventId]);
        await pubClient.expire(buildStreamViewerKey(eventId), 24 * 60 * 60);

        if (!wasPresent) {
          io.to(room.broadcasterSocketId).emit('stream:new-viewer', {
            eventId,
            viewerSocketId: socket.id
          });
          await emitStreamStatus(eventId);
        }
      } catch (error) {
        logger.error({ message: 'stream:viewer-ready error', error: error.message });
      }
    });

    socket.on('stream:leave-viewer', async ({ eventId }) => {
      await removeViewerFromRoom(eventId, socket.id);
    });

    socket.on('stream:signal', ({ eventId, targetSocketId, signal }) => {
      if (!eventId || !targetSocketId || !signal) {
        return;
      }

      io.to(targetSocketId).emit('stream:signal', {
        eventId,
        senderSocketId: socket.id,
        signal
      });
    });

    socket.on('live:vote-poll', async ({ pollId, optionId }) => {
      try {
        const poll = await Poll.findById(pollId);
        if (!poll) {
          socket.emit('live:error', { message: 'Poll not found.' });
          return;
        }
        if (poll.status === 'closed') {
          socket.emit('live:error', { message: 'Poll is closed.' });
          return;
        }
        if (poll.responses.some((item) => item.userId === socket.user.sub)) {
          socket.emit('live:error', { message: 'Duplicate vote blocked.' });
          return;
        }

        const option = poll.options.find((item) => item.id === optionId);
        if (!option) {
          socket.emit('live:error', { message: 'Option not found.' });
          return;
        }

        option.votes += 1;
        poll.responses.push({ userId: socket.user.sub, optionId });
        await poll.save();

        io.to(`live:${poll.eventId}`).emit('live:poll-updated', poll);

        await eventBus.publish(DomainEvents.POLL_RESPONSE, {
          pollId,
          eventId: poll.eventId,
          userId: socket.user.sub
        });
      } catch (error) {
        logger.error({ message: 'live:vote-poll error', error: error.message });
        socket.emit('live:error', { message: 'Vote failed. Please try again.' });
      }
    });

    socket.on('live:ask-question', async ({ eventId, body }) => {
      try {
        if (!eventId || !body?.trim()) {
          return;
        }

        const eventMetaResponse = await eventServiceClient.get(`/api/events/${eventId}/internal-meta`);
        const eventMeta = eventMetaResponse.data.data;

        const question = await Question.create({
          eventId,
          userId: socket.user.sub,
          body: body.trim().slice(0, 500),
          createdByRole: socket.user.role,
          author: buildAuthorProfile({
            user: socket.user,
            eventMeta
          })
        });

        io.to(`live:${eventId}`).emit('live:question-created', serializeQuestionThread(question));

        await eventBus.publish(DomainEvents.QUESTION_POSTED, {
          questionId: question._id.toString(),
          eventId,
          userId: socket.user.sub
        });
      } catch (error) {
        logger.error({ message: 'live:ask-question error', error: error.message });
        socket.emit('live:error', { message: 'Failed to submit question.' });
      }
    });

    socket.on('live:react', async ({ eventId, emoji }) => {
      try {
        if (!eventId || !emoji) {
          return;
        }

        if (!ALLOWED_EMOJIS.has(emoji)) {
          socket.emit('live:error', { message: 'Invalid emoji.' });
          return;
        }

        const reaction = await ReactionCounter.findOneAndUpdate(
          { eventId, emoji },
          { $inc: { count: 1 } },
          { new: true, upsert: true }
        );

        io.to(`live:${eventId}`).emit('live:reaction', reaction);
        await incrementEngagementMetric({
          eventId,
          field: 'reactions'
        });
      } catch (error) {
        logger.error({ message: 'live:react error', error: error.message });
      }
    });

    socket.on('live:announce', async ({ eventId, body }) => {
      try {
        if (!eventId || !body?.trim()) {
          return;
        }

        if (!(await canManageLiveEvent(socket, eventId))) {
          socket.emit('live:error', { message: 'Not authorized.' });
          return;
        }

        const announcement = await Announcement.create({
          eventId,
          body: body.trim().slice(0, 500),
          createdBy: socket.user.sub
        });

        io.to(`live:${eventId}`).emit('live:announcement', announcement);

        await eventBus.publish(DomainEvents.ANNOUNCEMENT_POSTED, {
          eventId,
          announcementId: announcement._id.toString(),
          body: announcement.body
        });
      } catch (error) {
        logger.error({ message: 'live:announce error', error: error.message });
        socket.emit('live:error', { message: 'Failed to send announcement.' });
      }
    });

    socket.on('disconnect', async () => {
      for (const eventId of socket.data.broadcastEventIds || []) {
        await stopBroadcast(socket, eventId, 'broadcaster_disconnected');
      }

      for (const eventId of socket.data.viewingEventIds || []) {
        await removeViewerFromRoom(eventId, socket.id);
      }

      logger.info({ message: 'Live socket disconnected', userId: socket.user.sub });
    });
  });

  const app = createApp({
    eventBus,
    io,
    services: {
      recordingUploadService
    }
  });
  const server = http.createServer(app);
  io.attach(server);

  server.listen(config.port, () => {
    logger.info({ message: 'Live service started', port: config.port });
  });
};

start().catch((error) => {
  logger.error({
    message: 'Failed to start live service',
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
