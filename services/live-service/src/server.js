const http = require('http');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { connectMongo, RedisEventBus, DomainEvents } = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const Poll = require('./models/Poll');
const Question = require('./models/Question');
const Announcement = require('./models/Announcement');
const ReactionCounter = require('./models/ReactionCounter');
const StreamSession = require('./models/StreamSession');

const ALLOWED_EMOJIS = new Set(['🔥', '👏', '❤️', '🚀', '😂', '🤯']);
const streamRooms = new Map();

const getStreamPayload = (eventId, room) => ({
  eventId,
  status: room?.broadcasterSocketId ? 'live' : 'idle',
  viewerCount: room?.viewers?.size || 0,
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

  const eventBus = new RedisEventBus({
    redisUrl: config.redisUrl,
    serviceName: 'live-service',
    logger
  });

  const pubClient = new Redis(config.redisUrl);
  const subClient = pubClient.duplicate();

  const io = new Server({
    path: '/socket/live',
    cors: {
      origin: config.corsOrigin,
      credentials: true
    }
  });
  io.adapter(createAdapter(pubClient, subClient));

  const syncStreamSession = async (eventId) => {
    const room = streamRooms.get(eventId);
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
          viewerCount: room.viewers.size
        }
      },
      {
        new: true,
        upsert: true
      }
    );
  };

  const emitStreamStatus = async (eventId) => {
    const room = streamRooms.get(eventId);
    await syncStreamSession(eventId);
    io.to(`live:${eventId}`).emit('stream:status', getStreamPayload(eventId, room));
  };

  const removeViewerFromRoom = async (eventId, viewerSocketId) => {
    const room = streamRooms.get(eventId);
    if (!room?.viewers?.has(viewerSocketId)) {
      return;
    }

    room.viewers.delete(viewerSocketId);
    io.to(room.broadcasterSocketId).emit('stream:viewer-left', {
      eventId,
      viewerSocketId
    });
    await emitStreamStatus(eventId);
  };

  const stopBroadcast = async (socket, eventId, reason = 'ended') => {
    const room = streamRooms.get(eventId);
    if (!room || room.broadcasterSocketId !== socket.id) {
      return;
    }

    streamRooms.delete(eventId);
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
    socket.on('live:join', ({ eventId }) => {
      if (!eventId) {
        return;
      }

      socket.join(`live:${eventId}`);
      socket.emit('stream:status', getStreamPayload(eventId, streamRooms.get(eventId)));
    });

    socket.on('stream:start-broadcast', async ({ eventId }) => {
      try {
        if (!eventId) {
          return;
        }

        if (!['organizer', 'admin'].includes(socket.user.role)) {
          socket.emit('stream:error', { message: 'Only organizers can start a broadcast.' });
          return;
        }

        const existing = streamRooms.get(eventId);
        if (existing?.broadcasterSocketId && existing.broadcasterSocketId !== socket.id) {
          socket.emit('stream:error', { message: 'A broadcast is already active for this event.' });
          return;
        }

        streamRooms.set(eventId, {
          broadcasterSocketId: socket.id,
          broadcasterId: socket.user.sub,
          viewers: existing?.viewers || new Set(),
          startedAt: existing?.startedAt || new Date()
        });

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

        const room = streamRooms.get(eventId);
        if (!room?.broadcasterSocketId || room.broadcasterSocketId === socket.id) {
          socket.emit('stream:status', getStreamPayload(eventId, room));
          return;
        }

        const wasPresent = room.viewers.has(socket.id);
        room.viewers.add(socket.id);

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

        const question = await Question.create({
          eventId,
          userId: socket.user.sub,
          body: body.trim().slice(0, 500),
          createdByRole: socket.user.role
        });

        io.to(`live:${eventId}`).emit('live:question-created', question);

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
      } catch (error) {
        logger.error({ message: 'live:react error', error: error.message });
      }
    });

    socket.on('live:announce', async ({ eventId, body }) => {
      try {
        if (!eventId || !body?.trim()) {
          return;
        }

        if (!['organizer', 'moderator', 'admin'].includes(socket.user.role)) {
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
      for (const [eventId, room] of streamRooms.entries()) {
        if (room.broadcasterSocketId === socket.id) {
          await stopBroadcast(socket, eventId, 'broadcaster_disconnected');
          break;
        }

        if (room.viewers.has(socket.id)) {
          await removeViewerFromRoom(eventId, socket.id);
        }
      }

      logger.info({ message: 'Live socket disconnected', userId: socket.user.sub });
    });
  });

  const app = createApp({ eventBus, io });
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
