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
  announcementSchema
} = require('../validators/liveSchemas');
const { buildEngagementHeatmap } = require('../services/engagementAnalyticsService');
const {
  buildAuthorProfile,
  serializeQuestionFeed,
  serializeQuestionThread,
  shouldAutoResolveQuestion
} = require('../services/questionThreadService');

const router = express.Router();

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
    const session = await StreamSession.findOne({ eventId: req.params.eventId }).lean();

    sendSuccess(
      res,
      session || {
        eventId: req.params.eventId,
        status: 'idle',
        viewerCount: 0,
        startedAt: null,
        endedAt: null
      }
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
      if (!existing) {
        throw new AppError('Question not found', 404, 'question_not_found');
      }

      return sendSuccess(res, serializeQuestionThread(existing));
    }

    const serializedQuestion = serializeQuestionThread(question);
    req.io.to(`live:${question.eventId}`).emit('live:question-updated', serializedQuestion);
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
    const reactions = await ReactionCounter.find({ eventId: req.params.eventId }).lean();
    sendSuccess(res, reactions);
  })
);

module.exports = router;
