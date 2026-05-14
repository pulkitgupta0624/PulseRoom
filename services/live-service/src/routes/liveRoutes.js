const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
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
const Poll = require('../models/Poll');
const Question = require('../models/Question');
const Announcement = require('../models/Announcement');
const ReactionCounter = require('../models/ReactionCounter');
const StreamSession = require('../models/StreamSession');
const EngagementMinute = require('../models/EngagementMinute');
const {
  createPollSchema,
  voteSchema,
  questionSchema,
  questionReplySchema,
  updateQuestionSchema,
  announcementSchema,
  recordingStartSchema,
  recordingFinalizeSchema,
  replayEditorSchema
} = require('../validators/liveSchemas');
const { buildEngagementHeatmap } = require('../services/engagementAnalyticsService');
const {
  buildAuthorProfile,
  serializeQuestionFeed,
  serializeQuestionThread,
  shouldAutoResolveQuestion
} = require('../services/questionThreadService');
const {
  buildReplayClip,
  buildReplayResponse,
  buildReplayPlaybackUrl,
  buildStreamSessionResponse,
  normalizeTrimWindow
} = require('../services/replayService');
const {
  loadOrCreateStreamSession,
  markRecordingFailed
} = require('../services/recordingSessionService');
const { assertCanAccessEventRoom } = require('../services/eventRoomAccess');

const router = express.Router();
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype || file.mimetype.startsWith('video/') || file.mimetype === 'application/octet-stream') {
      callback(null, true);
      return;
    }

    callback(new AppError('Only video recording chunks are allowed', 400, 'recording_chunk_invalid'));
  }
});
const recordingChunkUpload = (req, res, next) =>
  chunkUpload.single('chunk')(req, res, (error) => next(error));

const DEFAULT_SESSION_STATE = {
  status: 'idle',
  viewerCount: 0,
  startedAt: null,
  endedAt: null,
  recording: {
    status: 'idle',
    durationSeconds: 0,
    uploadedChunks: 0,
    readyAt: null,
    startedAt: null,
    trim: {
      startOffsetSeconds: 0,
      endOffsetSeconds: null
    },
    clipCount: 0,
    replayReady: false
  }
};

const loadEventMeta = async (req, eventId) => {
  try {
    const response = await req.clients.eventService.get(`/api/events/${eventId}/internal-meta`);
    return response.data.data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error.response?.status === 404) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    throw new AppError('Unable to verify event ownership', 502, 'event_lookup_failed');
  }
};

const assertInternalService = (req, allowedServices = []) => {
  if (!allowedServices.includes(req.headers['x-service-name'])) {
    throw new AppError('Forbidden', 403, 'forbidden');
  }
};

const hasEventEnded = (eventMeta) =>
  eventMeta?.status === 'completed' || new Date(eventMeta?.endsAt || 0).getTime() <= Date.now();

const loadReplayAccess = async (req, eventId) => {
  const eventMeta = await loadEventMeta(req, eventId);

  if ([Roles.ADMIN, Roles.MODERATOR].includes(req.user.role)) {
    return {
      canEdit: true,
      eventMeta
    };
  }

  if (req.user.role === Roles.ORGANIZER && eventMeta.organizerId === req.user.sub) {
    return {
      canEdit: true,
      eventMeta
    };
  }

  try {
    const response = await req.clients.bookingService.get(
      `/api/bookings/internal/events/${eventId}/replay-access`,
      {
        params: {
          userId: req.user.sub
        }
      }
    );
    const replayAccess = response.data.data;
    if (!replayAccess.allowed) {
      throw new AppError(
        'Replay is only available to confirmed attendees for this event.',
        403,
        'replay_access_forbidden'
      );
    }

    return {
      canEdit: false,
      eventMeta,
      replayAccess
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      error.response?.data?.message || 'Unable to verify replay access for this attendee.',
      error.response?.status || 502,
      error.response?.data?.code || 'replay_access_unavailable'
    );
  }
};

const assertCanAccessHeatmap = async (req, eventId) => {
  if (req.user.role === Roles.ADMIN) {
    return;
  }

  if (req.user.role !== Roles.ORGANIZER) {
    throw new AppError('Forbidden', 403, 'forbidden');
  }

  const eventMeta = await loadEventMeta(req, eventId);
  if (eventMeta.organizerId !== req.user.sub) {
    throw new AppError('Forbidden', 403, 'forbidden');
  }
};

const assertCanManageEvent = async (req, eventId) => {
  const eventMeta = await loadEventMeta(req, eventId);

  if ([Roles.ADMIN, Roles.MODERATOR].includes(req.user.role)) {
    return eventMeta;
  }

  if (req.user.role === Roles.ORGANIZER && eventMeta.organizerId === req.user.sub) {
    return eventMeta;
  }

  throw new AppError('Forbidden', 403, 'forbidden');
};

router.get(
  '/:eventId/stream-session',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadEventMeta(req, req.params.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });

    const session = await StreamSession.findOne({ eventId: req.params.eventId }).lean();

    sendSuccess(
      res,
      session
        ? buildStreamSessionResponse(session)
        : {
            eventId: req.params.eventId,
            ...DEFAULT_SESSION_STATE
          }
    );
  })
);

router.post(
  '/:eventId/recordings/start',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  validateSchema(recordingStartSchema),
  asyncHandler(async (req, res) => {
    await assertCanManageEvent(req, req.params.eventId);

    const { recordingSessionId, publicId } = req.services.recordingUploadService.startUpload({
      eventId: req.params.eventId,
      organizerId: req.user.sub,
      mimeType: req.body.mimeType || ''
    });
    const streamSession = await loadOrCreateStreamSession(req.params.eventId);

    streamSession.eventId = req.params.eventId;
    streamSession.broadcasterId =
      streamSession.broadcasterId && streamSession.broadcasterId !== 'system'
        ? streamSession.broadcasterId
        : req.user.sub;
    streamSession.recordingUrl = undefined;
    streamSession.recording = {
      status: 'uploading',
      sessionId: recordingSessionId,
      provider: 'cloudinary',
      publicId,
      mimeType: req.body.mimeType || '',
      bytes: 0,
      durationSeconds: 0,
      uploadedChunks: 0,
      startedAt: new Date(),
      readyAt: null,
      failedAt: null,
      error: '',
      trim: {
        startOffsetSeconds: 0,
        endOffsetSeconds: null,
        updatedAt: null,
        updatedBy: ''
      },
      clips: []
    };
    await streamSession.save();

    sendSuccess(res, {
      eventId: req.params.eventId,
      recordingSessionId,
      status: 'uploading'
    }, 201);
  })
);

router.post(
  '/:eventId/recordings/chunk',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  recordingChunkUpload,
  asyncHandler(async (req, res) => {
    await assertCanManageEvent(req, req.params.eventId);

    if (!req.file?.buffer?.length) {
      throw new AppError('Recording chunk is required', 400, 'recording_chunk_missing');
    }

    const recordingSessionId = String(req.body.recordingSessionId || '').trim();
    if (!recordingSessionId) {
      throw new AppError('Recording session id is required', 400, 'recording_session_required');
    }

    try {
      const uploadState = await req.services.recordingUploadService.appendChunk({
        recordingSessionId,
        buffer: req.file.buffer
      });
      const streamSession = await StreamSession.findOne({ eventId: req.params.eventId });
      if (streamSession) {
        streamSession.recording.uploadedChunks = uploadState.uploadedChunks;
        streamSession.recording.bytes = uploadState.bytes;
        await streamSession.save();
      }

      sendSuccess(res, uploadState, 202);
    } catch (error) {
      await markRecordingFailed({
        eventId: req.params.eventId,
        recordingSessionId,
        mimeType: req.file.mimetype,
        errorMessage: error.message || 'Recording chunk upload failed'
      });
      throw error;
    }
  })
);

router.post(
  '/:eventId/recordings/finalize',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  validateSchema(recordingFinalizeSchema),
  asyncHandler(async (req, res) => {
    const eventMeta = await assertCanManageEvent(req, req.params.eventId);

    try {
      const { result, uploadedChunks, bytes } = await req.services.recordingUploadService.finalizeUpload({
        recordingSessionId: req.body.recordingSessionId
      });
      const durationSeconds = Number(
        req.body.durationSeconds || result.duration || result.video?.duration || 0
      );
      const playbackUrl = buildReplayPlaybackUrl({
        cloudinary,
        publicId: result.public_id,
        format: result.format
      });
      const streamSession = await loadOrCreateStreamSession(req.params.eventId);

      streamSession.eventId = req.params.eventId;
      streamSession.broadcasterId =
        streamSession.broadcasterId && streamSession.broadcasterId !== 'system'
          ? streamSession.broadcasterId
          : req.user.sub;
      streamSession.recordingUrl = playbackUrl;
      streamSession.recording = {
        status: 'ready',
        sessionId: req.body.recordingSessionId,
        provider: 'cloudinary',
        publicId: result.public_id,
        assetId: result.asset_id || '',
        resourceType: result.resource_type || 'video',
        format: result.format || '',
        mimeType: streamSession.recording?.mimeType || '',
        originalUrl: result.secure_url || '',
        playbackUrl,
        bytes: Number(bytes || result.bytes || 0),
        durationSeconds,
        uploadedChunks,
        startedAt: streamSession.recording?.startedAt || new Date(),
        readyAt: new Date(),
        failedAt: null,
        error: '',
        trim: {
          startOffsetSeconds: 0,
          endOffsetSeconds: null,
          updatedAt: new Date(),
          updatedBy: req.user.sub
        },
        clips: []
      };
      await streamSession.save();
      req.io.to(`live:${req.params.eventId}`).emit('stream:replay-ready', {
        eventId: req.params.eventId,
        durationSeconds,
        clipsCount: 0
      });

      if (hasEventEnded(eventMeta)) {
        await req.eventBus.publish(DomainEvents.REPLAY_AVAILABLE, {
          eventId: req.params.eventId,
          organizerId: eventMeta.organizerId,
          title: eventMeta.title,
          startsAt: eventMeta.startsAt,
          endsAt: eventMeta.endsAt,
          replayUrl: playbackUrl,
          durationSeconds
        });
      }

      sendSuccess(
        res,
        buildReplayResponse({
          cloudinary,
          session: streamSession,
          canEdit: true
        })
      );
    } catch (error) {
      await markRecordingFailed({
        eventId: req.params.eventId,
        recordingSessionId: req.body.recordingSessionId,
        errorMessage: error.message || 'Replay finalization failed'
      });
      throw error;
    }
  })
);

router.post(
  '/:eventId/recordings/abort',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    await assertCanManageEvent(req, req.params.eventId);

    const recordingSessionId = String(req.body.recordingSessionId || '').trim();
    if (!recordingSessionId) {
      throw new AppError('Recording session id is required', 400, 'recording_session_required');
    }

    const aborted = req.services.recordingUploadService.abortUpload({
      recordingSessionId,
      reason: 'recording_aborted_by_client'
    });

    if (aborted) {
      await markRecordingFailed({
        eventId: req.params.eventId,
        recordingSessionId,
        errorMessage: 'Recording upload was aborted before finalization.'
      });
    }

    sendSuccess(res, {
      eventId: req.params.eventId,
      recordingSessionId,
      aborted
    });
  })
);

router.get(
  '/:eventId/replay',
  authenticate(),
  asyncHandler(async (req, res) => {
    const replayAccess = await loadReplayAccess(req, req.params.eventId);
    if (!hasEventEnded(replayAccess.eventMeta)) {
      throw new AppError(
        'Replay becomes available after the event ends.',
        409,
        'replay_not_ready'
      );
    }

    const streamSession = await StreamSession.findOne({ eventId: req.params.eventId });
    if (!streamSession || streamSession.recording?.status !== 'ready') {
      throw new AppError('Replay is not available for this event yet.', 404, 'replay_unavailable');
    }

    const payload = buildReplayResponse({
      cloudinary,
      session: streamSession,
      canEdit: replayAccess.canEdit
    });

    if (!payload.replayAvailable) {
      throw new AppError('Replay is not available for this event yet.', 404, 'replay_unavailable');
    }

    sendSuccess(res, payload);
  })
);

router.get(
  '/internal/:eventId/replay-meta',
  asyncHandler(async (req, res) => {
    assertInternalService(req, ['notification-service']);

    const streamSession = await StreamSession.findOne({ eventId: req.params.eventId }).lean();
    const recording = streamSession?.recording || {};
    const replayAvailable =
      recording.status === 'ready' && Boolean(recording.playbackUrl || streamSession?.recordingUrl);

    sendSuccess(res, {
      eventId: req.params.eventId,
      available: replayAvailable,
      playbackUrl: replayAvailable ? recording.playbackUrl || streamSession.recordingUrl : null,
      durationSeconds: Number(recording.durationSeconds || 0),
      readyAt: recording.readyAt || null,
      clipsCount: Array.isArray(recording.clips) ? recording.clips.length : 0
    });
  })
);

router.get(
  '/internal/:eventId/summary-context',
  asyncHandler(async (req, res) => {
    assertInternalService(req, ['event-service']);

    const [polls, questions, announcements, reactions, engagementSeries] = await Promise.all([
      Poll.find({ eventId: req.params.eventId }).sort({ createdAt: 1 }).lean(),
      Question.find({ eventId: req.params.eventId, hidden: false }).sort({ createdAt: 1 }).lean(),
      Announcement.find({ eventId: req.params.eventId }).sort({ createdAt: 1 }).lean(),
      ReactionCounter.find({ eventId: req.params.eventId }).lean(),
      EngagementMinute.find({ eventId: req.params.eventId }).sort({ minuteBucket: 1 }).limit(240).lean()
    ]);

    sendSuccess(res, {
      eventId: req.params.eventId,
      polls: polls.map((poll) => ({
        question: poll.question,
        status: poll.status,
        options: (poll.options || []).map((option) => ({
          label: option.label,
          votes: Number(option.votes || 0)
        })),
        responseCount: (poll.responses || []).length
      })),
      questions: serializeQuestionFeed(questions).slice(0, 80),
      announcements: announcements.slice(0, 30).map((announcement) => ({
        body: announcement.body,
        createdAt: announcement.createdAt
      })),
      reactions: reactions.map((reaction) => ({
        emoji: reaction.emoji,
        count: Number(reaction.count || 0)
      })),
      engagement: buildEngagementHeatmap({
        eventId: req.params.eventId,
        documents: engagementSeries,
        windowMinutes: Math.max(30, engagementSeries.length)
      })
    });
  })
);

router.patch(
  '/:eventId/replay/editor',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  validateSchema(replayEditorSchema),
  asyncHandler(async (req, res) => {
    const eventMeta = await assertCanManageEvent(req, req.params.eventId);
    if (!hasEventEnded(eventMeta)) {
      throw new AppError(
        'Replay editing opens after the event has ended.',
        409,
        'replay_editing_not_open'
      );
    }

    const streamSession = await StreamSession.findOne({ eventId: req.params.eventId });
    if (!streamSession || streamSession.recording?.status !== 'ready' || !streamSession.recording?.publicId) {
      throw new AppError('Replay is not available for editing yet.', 404, 'replay_unavailable');
    }

    const durationSeconds = Number(streamSession.recording.durationSeconds || 0);
    const trim = normalizeTrimWindow({
      startOffsetSeconds: req.body.trim.startOffsetSeconds,
      endOffsetSeconds: req.body.trim.endOffsetSeconds,
      durationSeconds
    });
    if (trim.durationSeconds <= 0) {
      throw new AppError('Replay trim must keep at least one moment of video.', 409, 'replay_trim_invalid');
    }

    const clips = req.body.clips.map((clip) =>
      buildReplayClip({
        cloudinary,
        publicId: streamSession.recording.publicId,
        format: streamSession.recording.format,
        clip,
        durationSeconds,
        createdBy: req.user.sub
      })
    );
    if (clips.some((clip) => clip.durationSeconds <= 0)) {
      throw new AppError('Each replay clip needs a valid start and end time.', 409, 'replay_clip_invalid');
    }

    streamSession.recording.playbackUrl = buildReplayPlaybackUrl({
      cloudinary,
      publicId: streamSession.recording.publicId,
      format: streamSession.recording.format,
      startOffsetSeconds: trim.startOffsetSeconds,
      endOffsetSeconds: trim.endOffsetSeconds
    });
    streamSession.recording.trim = {
      startOffsetSeconds: trim.startOffsetSeconds,
      endOffsetSeconds: trim.endOffsetSeconds,
      updatedAt: new Date(),
      updatedBy: req.user.sub
    };
    streamSession.recording.clips = clips;
    streamSession.recordingUrl = streamSession.recording.playbackUrl;
    await streamSession.save();
    req.io.to(`live:${req.params.eventId}`).emit('stream:replay-ready', {
      eventId: req.params.eventId,
      durationSeconds,
      clipsCount: clips.length
    });

    sendSuccess(
      res,
      buildReplayResponse({
        cloudinary,
        session: streamSession,
        canEdit: true
      })
    );
  })
);

router.get(
  '/:eventId/engagement-heatmap',
  authenticate(),
  asyncHandler(async (req, res) => {
    await assertCanAccessHeatmap(req, req.params.eventId);

    const windowMinutes = Math.max(30, Math.min(720, Number(req.query.windowMinutes || 180)));
    const from = new Date(Date.now() - windowMinutes * 60 * 1000);
    const documents = await EngagementMinute.find({
      eventId: req.params.eventId,
      minuteBucket: { $gte: from }
    })
      .sort({ minuteBucket: 1 })
      .lean();

    sendSuccess(
      res,
      buildEngagementHeatmap({
        eventId: req.params.eventId,
        documents,
        windowMinutes
      })
    );
  })
);

router.get(
  '/:eventId/polls',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadEventMeta(req, req.params.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });

    const polls = await Poll.find({ eventId: req.params.eventId }).sort({ createdAt: -1 });
    sendSuccess(res, polls);
  })
);

router.post(
  '/:eventId/polls',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  validateSchema(createPollSchema),
  asyncHandler(async (req, res) => {
    await assertCanManageEvent(req, req.params.eventId);

    const poll = await Poll.create({
      eventId: req.params.eventId,
      question: req.body.question,
      options: req.body.options,
      createdBy: req.user.sub
    });

    req.io.to(`live:${req.params.eventId}`).emit('live:poll-created', poll);
    await req.eventBus.publish(DomainEvents.POLL_CREATED, {
      eventId: req.params.eventId,
      pollId: poll._id.toString()
    });

    sendSuccess(res, poll, 201);
  })
);

router.post(
  '/polls/:pollId/vote',
  authenticate(),
  validateSchema(voteSchema),
  asyncHandler(async (req, res) => {
    const poll = await Poll.findById(req.params.pollId);
    if (!poll) {
      throw new AppError('Poll not found', 404, 'poll_not_found');
    }
    if (poll.status === 'closed') {
      throw new AppError('Poll is closed', 409, 'poll_closed');
    }
    const eventMeta = await loadEventMeta(req, poll.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });
    if (poll.responses.some((item) => item.userId === req.user.sub)) {
      throw new AppError('Already voted on this poll', 409, 'poll_already_voted');
    }

    const selectedOption = poll.options.find((item) => item.id === req.body.optionId);
    if (!selectedOption) {
      throw new AppError('Poll option not found', 404, 'poll_option_not_found');
    }

    selectedOption.votes += 1;
    poll.responses.push({ userId: req.user.sub, optionId: req.body.optionId });
    await poll.save();

    req.io.to(`live:${poll.eventId}`).emit('live:poll-updated', poll);
    await req.eventBus.publish(DomainEvents.POLL_RESPONSE, {
      pollId: poll._id.toString(),
      eventId: poll.eventId,
      userId: req.user.sub
    });

    sendSuccess(res, poll);
  })
);

router.patch(
  '/polls/:pollId/close',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const poll = await Poll.findById(req.params.pollId);
    if (!poll) {
      throw new AppError('Poll not found', 404, 'poll_not_found');
    }

    await assertCanManageEvent(req, poll.eventId);

    poll.status = 'closed';
    await poll.save();

    req.io.to(`live:${poll.eventId}`).emit('live:poll-updated', poll);
    sendSuccess(res, poll);
  })
);

router.get(
  '/:eventId/questions',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadEventMeta(req, req.params.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });

    const questions = await Question.find({
      eventId: req.params.eventId,
      hidden: false
    }).lean();

    sendSuccess(res, serializeQuestionFeed(questions));
  })
);

router.post(
  '/:eventId/questions',
  authenticate(),
  validateSchema(questionSchema),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadEventMeta(req, req.params.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });

    const question = await Question.create({
      eventId: req.params.eventId,
      userId: req.user.sub,
      body: req.body.body.trim(),
      createdByRole: req.user.role,
      author: buildAuthorProfile({
        user: req.user,
        eventMeta
      })
    });

    const serializedQuestion = serializeQuestionThread(question);
    req.io.to(`live:${req.params.eventId}`).emit('live:question-created', serializedQuestion);
    await req.eventBus.publish(DomainEvents.QUESTION_POSTED, {
      questionId: question._id.toString(),
      eventId: req.params.eventId,
      userId: req.user.sub
    });

    sendSuccess(res, serializedQuestion, 201);
  })
);

router.post(
  '/questions/:questionId/replies',
  authenticate(),
  validateSchema(questionReplySchema),
  asyncHandler(async (req, res) => {
    const question = await Question.findById(req.params.questionId);
    if (!question) {
      throw new AppError('Question not found', 404, 'question_not_found');
    }

    const eventMeta = await loadEventMeta(req, question.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });

    const author = buildAuthorProfile({
      user: req.user,
      eventMeta
    });
    const parentReplyId = req.body.parentReplyId || null;

    if (parentReplyId) {
      const parentReply = (question.replies || []).find(
        (reply) => reply.replyId === parentReplyId && !reply.hidden
      );
      if (!parentReply) {
        throw new AppError('Reply target not found', 404, 'reply_parent_not_found');
      }
    }

    question.replies.push({
      parentReplyId,
      body: req.body.body.trim(),
      author,
      updatedAt: new Date()
    });

    if (shouldAutoResolveQuestion(author)) {
      question.answered = true;
    }

    await question.save();

    const serializedQuestion = serializeQuestionThread(question);
    req.io.to(`live:${question.eventId}`).emit('live:question-updated', serializedQuestion);
    sendSuccess(res, serializedQuestion, 201);
  })
);

router.post(
  '/questions/:questionId/upvote',
  authenticate(),
  asyncHandler(async (req, res) => {
    const ownedQuestion = await Question.findById(req.params.questionId)
      .select('userId eventId')
      .lean();

    if (!ownedQuestion) {
      throw new AppError('Question not found', 404, 'question_not_found');
    }

    const eventMeta = await loadEventMeta(req, ownedQuestion.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });

    if (ownedQuestion.userId === req.user.sub) {
      throw new AppError(
        'You cannot upvote your own question',
        409,
        'question_self_vote_forbidden'
      );
    }

    const question = await Question.findOneAndUpdate(
      {
        _id: req.params.questionId,
        voterIds: { $ne: req.user.sub }
      },
      {
        $inc: { upvotes: 1 },
        $addToSet: { voterIds: req.user.sub }
      },
      { new: true }
    );

    if (!question) {
      const existing = await Question.findById(req.params.questionId).lean();
      return sendSuccess(res, serializeQuestionThread(existing));
    }

    const serializedQuestion = serializeQuestionThread(question);
    req.io.to(`live:${question.eventId}`).emit('live:question-updated', serializedQuestion);
    await req.eventBus.publish(DomainEvents.QUESTION_UPVOTED, {
      questionId: question._id.toString(),
      eventId: question.eventId,
      userId: req.user.sub,
      authorUserId: question.userId,
      upvotes: Number(question.upvotes || 0)
    });
    sendSuccess(res, serializedQuestion);
  })
);

router.patch(
  '/questions/:questionId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  validateSchema(updateQuestionSchema),
  asyncHandler(async (req, res) => {
    const question = await Question.findById(req.params.questionId);
    if (!question) {
      throw new AppError('Question not found', 404, 'question_not_found');
    }

    await assertCanManageEvent(req, question.eventId);

    if (typeof req.body.answered === 'boolean') {
      question.answered = req.body.answered;
      if (!req.body.answered && req.body.pinned !== true) {
        question.pinnedAt = undefined;
        question.pinnedBy = undefined;
      }
    }

    if (typeof req.body.hidden === 'boolean') {
      question.hidden = req.body.hidden;
    }

    if (typeof req.body.pinned === 'boolean') {
      if (req.body.pinned && !question.answered) {
        throw new AppError('Only resolved questions can be pinned', 409, 'question_pin_requires_answer');
      }

      question.pinnedAt = req.body.pinned ? new Date() : undefined;
      question.pinnedBy = req.body.pinned ? req.user.sub : undefined;
    }

    await question.save();

    const serializedQuestion = serializeQuestionThread(question);
    req.io.to(`live:${question.eventId}`).emit('live:question-updated', serializedQuestion);
    sendSuccess(res, serializedQuestion);
  })
);

router.post(
  '/:eventId/announcements',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  validateSchema(announcementSchema),
  asyncHandler(async (req, res) => {
    await assertCanManageEvent(req, req.params.eventId);

    const announcement = await Announcement.create({
      eventId: req.params.eventId,
      body: req.body.body,
      createdBy: req.user.sub
    });

    req.io.to(`live:${req.params.eventId}`).emit('live:announcement', announcement);
    await req.eventBus.publish(DomainEvents.ANNOUNCEMENT_POSTED, {
      eventId: req.params.eventId,
      announcementId: announcement._id.toString(),
      body: announcement.body
    });

    sendSuccess(res, announcement, 201);
  })
);

router.get(
  '/:eventId/announcements',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadEventMeta(req, req.params.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });

    const announcements = await Announcement.find({ eventId: req.params.eventId })
      .sort({ createdAt: -1 })
      .limit(20);
    sendSuccess(res, announcements);
  })
);

router.get(
  '/:eventId/reactions',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadEventMeta(req, req.params.eventId);
    assertCanAccessEventRoom({
      eventMeta,
      user: req.user
    });

    const reactions = await ReactionCounter.find({ eventId: req.params.eventId }).lean();
    sendSuccess(res, reactions);
  })
);

module.exports = router;
