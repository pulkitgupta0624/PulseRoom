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
const { createPollSchema, voteSchema, questionSchema, announcementSchema } = require('../validators/liveSchemas');

const router = express.Router();

router.get(
  '/:eventId/stream-session',
  authenticate(),
  asyncHandler(async (req, res) => {
    const session = await StreamSession.findOne({ eventId: req.params.eventId }).lean();

    sendSuccess(res, session || {
      eventId: req.params.eventId,
      status: 'idle',
      viewerCount: 0,
      startedAt: null,
      endedAt: null
    });
  })
);

// ── Polls ─────────────────────────────────────────────────────────────────────
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

// Close a poll (organizer/admin)
router.patch(
  '/polls/:pollId/close',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const poll = await Poll.findByIdAndUpdate(
      req.params.pollId,
      { status: 'closed' },
      { new: true }
    );
    if (!poll) {
      throw new AppError('Poll not found', 404, 'poll_not_found');
    }

    req.io.to(`live:${poll.eventId}`).emit('live:poll-updated', poll);
    sendSuccess(res, poll);
  })
);

// ── Questions / Q&A ───────────────────────────────────────────────────────────
router.get(
  '/:eventId/questions',
  authenticate(),
  asyncHandler(async (req, res) => {
    const questions = await Question.find({
      eventId: req.params.eventId,
      hidden: false
    }).sort({ answered: 1, upvotes: -1, createdAt: -1 });
    sendSuccess(res, questions);
  })
);

router.post(
  '/:eventId/questions',
  authenticate(),
  validateSchema(questionSchema),
  asyncHandler(async (req, res) => {
    const question = await Question.create({
      eventId: req.params.eventId,
      userId: req.user.sub,
      body: req.body.body,
      createdByRole: req.user.role
    });

    req.io.to(`live:${req.params.eventId}`).emit('live:question-created', question);
    await req.eventBus.publish(DomainEvents.QUESTION_POSTED, {
      questionId: question._id.toString(),
      eventId: req.params.eventId,
      userId: req.user.sub
    });

    sendSuccess(res, question, 201);
  })
);

// Upvote a question (NEW) ──────────────────────────────────────────────────────
// Prevents duplicate upvotes by tracking voterIds in a lightweight Set field.
router.post(
  '/questions/:questionId/upvote',
  authenticate(),
  asyncHandler(async (req, res) => {
    // Use findOneAndUpdate with $addToSet to ensure idempotency atomically.
    const question = await Question.findOneAndUpdate(
      {
        _id: req.params.questionId,
        voterIds: { $ne: req.user.sub }   // only if not already voted
      },
      {
        $inc: { upvotes: 1 },
        $addToSet: { voterIds: req.user.sub }
      },
      { new: true }
    );

    if (!question) {
      // Either not found or already upvoted — return current state gracefully
      const existing = await Question.findById(req.params.questionId).lean();
      if (!existing) {
        throw new AppError('Question not found', 404, 'question_not_found');
      }
      return sendSuccess(res, existing); // idempotent — already voted
    }

    req.io.to(`live:${question.eventId}`).emit('live:question-updated', question);
    sendSuccess(res, question);
  })
);

// Update question (answer / hide) — organizer/mod/admin
router.patch(
  '/questions/:questionId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const question = await Question.findById(req.params.questionId);
    if (!question) {
      throw new AppError('Question not found', 404, 'question_not_found');
    }

    if (typeof req.body.answered === 'boolean') question.answered = req.body.answered;
    if (typeof req.body.hidden === 'boolean') question.hidden = req.body.hidden;
    await question.save();

    req.io.to(`live:${question.eventId}`).emit('live:question-updated', question);
    sendSuccess(res, question);
  })
);

// ── Announcements ─────────────────────────────────────────────────────────────
router.post(
  '/:eventId/announcements',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  validateSchema(announcementSchema),
  asyncHandler(async (req, res) => {
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

// ── Reactions ─────────────────────────────────────────────────────────────────
router.get(
  '/:eventId/reactions',
  authenticate(),
  asyncHandler(async (req, res) => {
    const reactions = await ReactionCounter.find({ eventId: req.params.eventId }).lean();
    sendSuccess(res, reactions);
  })
);

module.exports = router;
