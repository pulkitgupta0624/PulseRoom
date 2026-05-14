const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  authorize,
  sendSuccess,
  validateSchema,
  DomainEvents,
  Roles
} = require('@pulseroom/common');
const sanitizeHtml = require('sanitize-html');
const Message = require('../models/Message');
const ChatRestriction = require('../models/ChatRestriction');
const EventChatPolicy = require('../models/EventChatPolicy');
const {
  moderationSchema,
  sendMessageSchema,
  chatPolicySchema
} = require('../validators/chatSchemas');
const {
  analyzeChatMessage,
  getSlowModeRetryMs,
  isPrivilegedChatRole,
  normalizeSlowModeSeconds
} = require('../services/trustSafetyService');
const { assertCanAccessEventRoom } = require('../services/eventRoomAccess');
const { buildPrivateRoomId } = require('../services/roomUtils');

const router = express.Router();

// ── Helper ────────────────────────────────────────────────────────────────────
const checkRestriction = async (eventId, userId) => {
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

const sanitize = (text) => sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });

const serializeChatPolicy = (policy = {}, eventId = '') => ({
  eventId: eventId || policy.eventId || '',
  slowModeSeconds: normalizeSlowModeSeconds(policy.slowModeSeconds),
  active: normalizeSlowModeSeconds(policy.slowModeSeconds) > 0,
  updatedAt: policy.updatedAt || null,
  updatedBy: policy.updatedBy || ''
});

const loadEventMeta = async (req, eventId) => {
  try {
    const response = await req.clients.eventService.get(`/api/events/${eventId}/internal-meta`);
    return response.data.data;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    throw new AppError('Unable to verify event ownership', 502, 'event_lookup_failed');
  }
};

const assertCanManageEvent = async (req, eventId) => {
  const eventMeta = await loadEventMeta(req, eventId);

  if ([Roles.ADMIN, Roles.MODERATOR].includes(req.user.role)) {
    return;
  }

  if (req.user.role === Roles.ORGANIZER && eventMeta.organizerId === req.user.sub) {
    return;
  }

  throw new AppError('Forbidden', 403, 'forbidden');
};

const loadChatPolicy = async (eventId) => {
  const policy = await EventChatPolicy.findOne({ eventId }).lean();
  return serializeChatPolicy(policy || {}, eventId);
};

const enforceSlowMode = async ({ eventId, user }) => {
  if (isPrivilegedChatRole(user.role)) {
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
    senderId: user.sub
  })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();

  const retryMs = getSlowModeRetryMs({
    lastMessageAt: lastMessage?.createdAt || null,
    slowModeSeconds: policy.slowModeSeconds
  });

  if (retryMs > 0) {
    throw new AppError(
      `Slow mode is active. Please wait ${Math.ceil(retryMs / 1000)}s before sending again.`,
      429,
      'chat_slow_mode'
    );
  }

  return policy;
};

const publishSafetyIncident = async ({
  req,
  eventMeta,
  message,
  safetyAnalysis
}) => {
  await req.eventBus.publish(DomainEvents.SAFETY_INCIDENT_DETECTED, {
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
    detail: `A chat message triggered automated ${safetyAnalysis.category} detection with a ${safetyAnalysis.severity} severity score.`,
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

// ── Event chat ────────────────────────────────────────────────────────────────
router.get(
  '/event/:eventId/messages',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadEventMeta(req, req.params.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });

    const limit = Math.min(Number(req.query.limit || 50), 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    const filter = {
      roomType: 'event',
      roomId: req.params.eventId,
      deletedAt: { $exists: false },
      'moderation.status': { $ne: 'hidden' }
    };
    if (before) {
      filter.createdAt = { $lt: before };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    sendSuccess(res, messages.reverse());
  })
);

router.get(
  '/event/:eventId/policy',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadEventMeta(req, req.params.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });

    sendSuccess(res, await loadChatPolicy(req.params.eventId));
  })
);

router.patch(
  '/event/:eventId/policy',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  validateSchema(chatPolicySchema),
  asyncHandler(async (req, res) => {
    await assertCanManageEvent(req, req.params.eventId);

    const policy = await EventChatPolicy.findOneAndUpdate(
      { eventId: req.params.eventId },
      {
        $set: {
          slowModeSeconds: normalizeSlowModeSeconds(req.body.slowModeSeconds),
          updatedBy: req.user.sub
        }
      },
      {
        new: true,
        upsert: true
      }
    ).lean();

    const serialized = serializeChatPolicy(policy, req.params.eventId);
    req.io.to(`event:${req.params.eventId}`).emit('chat:policy-updated', serialized);

    sendSuccess(res, serialized);
  })
);

router.post(
  '/event/:eventId/messages',
  authenticate(),
  validateSchema(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadEventMeta(req, req.params.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });

    const restriction = await checkRestriction(req.params.eventId, req.user.sub);
    if (restriction.isBanned || restriction.isMuted) {
      throw new AppError('Messaging restricted for this event', 403, 'chat_restricted');
    }

    const policy = await enforceSlowMode({
      eventId: req.params.eventId,
      user: req.user
    });
    const body = sanitize(req.body.body);
    const safetyAnalysis = analyzeChatMessage(body);

    const message = await Message.create({
      roomType: 'event',
      roomId: req.params.eventId,
      eventId: req.params.eventId,
      senderId: req.user.sub,
      senderRole: req.user.role,
      body,
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
      req.io.to(`event:${req.params.eventId}`).emit('chat:new-message', message);
      await req.eventBus.publish(DomainEvents.CHAT_MESSAGE_SENT, {
        messageId: message._id.toString(),
        eventId: req.params.eventId,
        senderId: req.user.sub
      });
    } else {
      await req.eventBus.publish(DomainEvents.CHAT_MESSAGE_MODERATED, {
        messageId: message._id.toString(),
        eventId: req.params.eventId,
        userId: req.user.sub,
        type: 'auto_hidden'
      });
    }

    if (safetyAnalysis.shouldCreateIncident) {
      await publishSafetyIncident({
        req,
        eventMeta,
        message,
        safetyAnalysis
      });
    }

    sendSuccess(res, {
      ...message.toObject(),
      policy,
      safety: {
        moderated: message.moderation?.status !== 'visible',
        moderationStatus: message.moderation?.status || 'visible'
      }
    }, 201);
  })
);

// ── Private chat ──────────────────────────────────────────────────────────────
router.get(
  '/private/:participantId',
  authenticate(),
  asyncHandler(async (req, res) => {
    const roomId = buildPrivateRoomId(req.user.sub, req.params.participantId);
    const limit = Math.min(Number(req.query.limit || 100), 200);
    const before = req.query.before ? new Date(req.query.before) : null;

    const filter = {
      roomType: 'private',
      roomId,
      deletedAt: { $exists: false }
    };
    if (before) {
      filter.createdAt = { $lt: before };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    sendSuccess(res, messages.reverse());
  })
);

// ── Conversation list (NEW) ───────────────────────────────────────────────────
// Returns the most recent private message per unique conversation partner,
// giving MessagesPage its sidebar history without a dedicated conversations DB.
router.get(
  '/conversations',
  authenticate(),
  asyncHandler(async (req, res) => {
    // Aggregate: find the latest message where this user is sender or recipient,
    // group by roomId, return last message + the "other" participant's userId.
    const rows = await Message.aggregate([
      {
        $match: {
          roomType: 'private',
          deletedAt: { $exists: false },
          $or: [
            { senderId: req.user.sub },
            { recipientId: req.user.sub }
          ]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$roomId',
          lastMessage: { $first: '$$ROOT' }
        }
      },
      { $sort: { 'lastMessage.createdAt': -1 } },
      { $limit: 30 }
    ]);

    // Derive the partner's userId from the roomId (format: "uid1:uid2" sorted)
    const conversations = rows.map(({ _id: roomId, lastMessage }) => {
      const parts = roomId.split(':');
      const partnerId = parts.find((id) => id !== req.user.sub) || parts[0];
      return {
        roomId,
        partnerId,
        lastMessage: {
          body: lastMessage.body,
          senderId: lastMessage.senderId,
          createdAt: lastMessage.createdAt
        }
      };
    });

    sendSuccess(res, conversations);
  })
);

// ── Moderation ────────────────────────────────────────────────────────────────
router.post(
  '/event/:eventId/moderation',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  validateSchema(moderationSchema),
  asyncHandler(async (req, res) => {
    await assertCanManageEvent(req, req.params.eventId);

    const restriction = await ChatRestriction.create({
      eventId: req.params.eventId,
      userId: req.body.userId,
      type: req.body.type,
      reason: req.body.reason,
      expiresAt: req.body.expiresAt,
      createdBy: req.user.sub
    });

    req.io.to(`event:${req.params.eventId}`).emit('chat:moderation', restriction);
    await req.eventBus.publish(DomainEvents.CHAT_MESSAGE_MODERATED, {
      eventId: req.params.eventId,
      userId: req.body.userId,
      type: req.body.type
    });

    sendSuccess(res, restriction, 201);
  })
);

router.delete(
  '/messages/:messageId',
  authenticate(),
  asyncHandler(async (req, res) => {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      throw new AppError('Message not found', 404, 'message_not_found');
    }

    let canDelete = message.senderId === req.user.sub || [Roles.MODERATOR, Roles.ADMIN].includes(req.user.role);

    if (!canDelete && req.user.role === Roles.ORGANIZER && message.eventId) {
      await assertCanManageEvent(req, message.eventId);
      canDelete = true;
    }

    if (!canDelete) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    message.deletedAt = new Date();
    await message.save();

    const room =
      message.roomType === 'event'
        ? `event:${message.roomId}`
        : `private:${message.roomId}`;

    req.io.to(room).emit('chat:message-deleted', { messageId: message._id.toString() });
    sendSuccess(res, { deleted: true });
  })
);

module.exports = router;
