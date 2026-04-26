const crypto = require('crypto');
const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  authorize,
  sendSuccess,
  validateSchema,
  DomainEvents,
  EventVisibility,
  Roles,
  decodeOptionalToken
} = require('@pulseroom/common');
const Event = require('../models/Event');
const {
  createEventSchema,
  updateEventSchema,
  updateStatusSchema,
  aiEventDraftSchema,
  aiAssistantQuestionSchema
} = require('../validators/eventSchemas');
const { slugify } = require('../services/slugify');
const { generateEventDraft, answerEventQuestion } = require('../services/aiAssistant');
const { buildCalendarFile, buildCalendarFileName } = require('../services/calendarService');
const { buildPriceSummary } = require('../services/searchService');
const {
  buildReferralCode,
  ensureEventReferralCode,
  serializeEventForViewer
} = require('../services/referralService');

const router = express.Router();

const canManageEvent = (event, user) => user.role === Roles.ADMIN || event.organizerId === user.sub;

const cacheKeyFromQuery = (query) => `events:list:${JSON.stringify(query)}`;

const normalizeSearchResult = (events, limit) => ({
  items: events.map((event) => {
    const priceSummary = buildPriceSummary(event.ticketTiers || []);
    const eventItem = { ...event };
    delete eventItem.referral;
    return {
      ...eventItem,
      lowestPrice: priceSummary.lowestPrice,
      lowestPriceCurrency: priceSummary.lowestPriceCurrency,
      isFree: priceSummary.isFree
    };
  }),
  facets: {
    categories: [],
    city: [],
    type: []
  },
  meta: {
    found: events.length,
    page: 1,
    perPage: limit,
    engine: 'mongo'
  }
});

const syncSearchDocument = async (req, event) => {
  try {
    if (req.services?.searchService?.isEnabled()) {
      await req.services.searchService.upsertEvent(event);
    }
  } catch (error) {
    req.logger.warn({
      message: 'Failed to sync event search document',
      eventId: event?._id?.toString?.(),
      error: error.message
    });
  }
};

const deleteSearchDocument = async (req, eventId) => {
  try {
    if (req.services?.searchService?.isEnabled()) {
      await req.services.searchService.deleteEvent(eventId.toString());
    }
  } catch (error) {
    req.logger.warn({
      message: 'Failed to delete event search document',
      eventId: eventId.toString(),
      error: error.message
    });
  }
};

const syncCompletionSchedule = async (req, event) => {
  try {
    await req.services?.completionService?.scheduleEventCompletion(event);
  } catch (error) {
    req.logger.warn({
      message: 'Failed to sync event completion schedule',
      eventId: event?._id?.toString?.(),
      error: error.message
    });
  }
};

const removeCompletionSchedule = async (req, eventId) => {
  try {
    await req.services?.completionService?.removeScheduledCompletion(eventId.toString());
  } catch (error) {
    req.logger.warn({
      message: 'Failed to remove event completion schedule',
      eventId: eventId.toString(),
      error: error.message
    });
  }
};

router.get(
  '/organizer/dashboard',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const filter = req.user.role === Roles.ADMIN ? {} : { organizerId: req.user.sub };
    const events = await Event.find(filter).sort({ startsAt: 1 });
    await Promise.all(events.map((event) => ensureEventReferralCode(event)));

    const serializedEvents = events.map((event) =>
      serializeEventForViewer({
        event,
        viewer: req.user,
        appOrigin: req.config.appOrigin
      })
    );
    const totalRevenue = serializedEvents.reduce((sum, item) => sum + (item.analytics?.revenue || 0), 0);

    sendSuccess(res, {
      totals: {
        events: serializedEvents.length,
        published: serializedEvents.filter((item) => item.status === 'published').length,
        upcoming: serializedEvents.filter((item) => new Date(item.startsAt) > new Date()).length,
        revenue: totalRevenue
      },
      events: serializedEvents
    });
  })
);

router.get(
  '/recommendations/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    const cacheKey = `events:recommendations:${req.user.sub}`;
    const cached = await req.cache.get(cacheKey);
    if (cached) {
      return sendSuccess(res, JSON.parse(cached));
    }

    let context = { interests: [] };
    try {
      const response = await req.clients.userService.get(`/api/users/recommendation-context/${req.user.sub}`);
      context = response.data.data;
    } catch (_error) {
      req.logger.warn({ message: 'Falling back to generic recommendations' });
    }

    const events = await Event.find({
      status: 'published',
      visibility: EventVisibility.PUBLIC,
      startsAt: { $gte: new Date() }
    })
      .sort({ startsAt: 1 })
      .lean();

    const scored = events
      .map((event) => {
        const matchingTags = event.tags.filter((tag) => context.interests.includes(tag)).length;
        const matchingCategories = event.categories.filter((category) => context.interests.includes(category)).length;
        const popularityScore = Math.min(event.attendeesCount / 10, 15);
        const publicEvent = { ...event };
        delete publicEvent.referral;
        return {
          ...publicEvent,
          recommendationScore: matchingTags * 6 + matchingCategories * 8 + popularityScore
        };
      })
      .sort((left, right) => right.recommendationScore - left.recommendationScore)
      .slice(0, 8);

    await req.cache.set(cacheKey, JSON.stringify(scored), 'EX', 120);
    return sendSuccess(res, scored);
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const key = cacheKeyFromQuery(req.query);
    const cached = await req.cache.get(key);
    if (cached) {
      return sendSuccess(res, JSON.parse(cached));
    }

    const visibility = req.query.visibility || EventVisibility.PUBLIC;
    const limit = Math.min(Number(req.query.limit || 20), 100);

    try {
      if (req.services?.searchService?.isEnabled()) {
        const searchResult = await req.services.searchService.searchEvents({
          ...req.query,
          status: 'published',
          visibility
        });

        await req.cache.set(key, JSON.stringify(searchResult), 'EX', 60);
        return sendSuccess(res, searchResult);
      }
    } catch (error) {
      req.logger.warn({
        message: 'Typesense search failed, falling back to MongoDB search',
        error: error.message
      });
    }

    const filters = {
      status: 'published',
      visibility
    };

    if (req.query.type) {
      filters.type = req.query.type;
    }
    if (req.query.category) {
      filters.categories = req.query.category;
    }
    if (req.query.tag) {
      filters.tags = req.query.tag;
    }
    if (req.query.city) {
      filters.city = new RegExp(`^${req.query.city}$`, 'i');
    }
    if (req.query.startsAfter || req.query.startsBefore) {
      filters.startsAt = {};
      if (req.query.startsAfter) {
        filters.startsAt.$gte = new Date(req.query.startsAfter);
      }
      if (req.query.startsBefore) {
        filters.startsAt.$lte = new Date(req.query.startsBefore);
      }
    }
    if (req.query.q) {
      filters.$text = { $search: req.query.q };
    }
    if (req.query.minPrice || req.query.maxPrice) {
      filters.ticketTiers = {
        $elemMatch: {
          price: {
            ...(req.query.minPrice ? { $gte: Number(req.query.minPrice) } : {}),
            ...(req.query.maxPrice ? { $lte: Number(req.query.maxPrice) } : {})
          }
        }
      };
    }

    const events = await Event.find(filters)
      .sort(req.query.sort === 'popular' ? { attendeesCount: -1 } : { startsAt: 1 })
      .limit(limit)
      .lean();

    const result = normalizeSearchResult(events, limit);
    await req.cache.set(key, JSON.stringify(result), 'EX', 60);
    return sendSuccess(res, result);
  })
);

router.post(
  '/ai/generate',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(aiEventDraftSchema),
  asyncHandler(async (req, res) => {
    const draft = await generateEventDraft({
      idea: req.body.idea,
      userId: req.user.sub
    });

    sendSuccess(res, draft);
  })
);

router.post(
  '/',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(createEventSchema),
  asyncHandler(async (req, res) => {
    const slugBase = slugify(req.body.title);
    const event = await Event.create({
      ...req.body,
      organizerId: req.user.sub,
      slug: `${slugBase}-${crypto.randomBytes(3).toString('hex')}`,
      referral: {
        code: buildReferralCode(req.body.title),
        clicks: 0
      }
    });

    await syncSearchDocument(req, event);
    await syncCompletionSchedule(req, event);

    await req.eventBus.publish(DomainEvents.EVENT_CREATED, {
      eventId: event._id.toString(),
      organizerId: event.organizerId,
      title: event.title,
      startsAt: event.startsAt
    });

    sendSuccess(res, event, 201);
  })
);

router.post(
  '/:eventId/assistant/ask',
  authenticate(),
  validateSchema(aiAssistantQuestionSchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId).lean();
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    if (event.visibility === EventVisibility.PRIVATE) {
      const canAccessPrivateEvent = req.user.sub === event.organizerId || req.user.role === Roles.ADMIN;
      if (!canAccessPrivateEvent) {
        throw new AppError('Event not available', 403, 'event_private');
      }
    }

    const answer = await answerEventQuestion({
      event,
      question: req.body.question,
      userId: req.user.sub
    });

    sendSuccess(res, answer);
  })
);

router.get(
  '/:eventId/calendar.ics',
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId).lean();
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    if (event.visibility === EventVisibility.PRIVATE) {
      const viewer = decodeOptionalToken(req);
      const canAccessPrivateEvent = viewer && (viewer.sub === event.organizerId || viewer.role === Roles.ADMIN);
      if (!canAccessPrivateEvent) {
        throw new AppError('Event not available', 403, 'event_private');
      }
    }

    const ics = buildCalendarFile(event, req.config.appOrigin);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${buildCalendarFileName(event)}"`
    );
    res.status(200).send(ics);
  })
);

router.get(
  '/:eventId',
  asyncHandler(async (req, res) => {
    const viewer = decodeOptionalToken(req);
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    if (event.visibility === EventVisibility.PRIVATE) {
      const canAccessPrivateEvent = viewer && (viewer.sub === event.organizerId || viewer.role === Roles.ADMIN);
      if (!canAccessPrivateEvent) {
        throw new AppError('Event not available', 403, 'event_private');
      }
    }

    const isReferralVisit =
      Boolean(req.query.ref) &&
      event.referral?.code === req.query.ref &&
      viewer?.sub !== event.organizerId;

    if (!event.referral?.code && viewer && (viewer.sub === event.organizerId || viewer.role === Roles.ADMIN)) {
      await ensureEventReferralCode(event);
    }

    await Event.updateOne(
      { _id: event._id },
      {
        $inc: {
          'analytics.views': 1,
          ...(isReferralVisit ? { 'referral.clicks': 1 } : {})
        }
      }
    );

    if (isReferralVisit) {
      event.referral = {
        ...(event.referral || {}),
        clicks: Number(event.referral?.clicks || 0) + 1
      };
    }
    event.analytics = {
      ...(event.analytics || {}),
      views: Number(event.analytics?.views || 0) + 1
    };

    sendSuccess(
      res,
      serializeEventForViewer({
        event,
        viewer,
        appOrigin: req.config.appOrigin,
        includeReferral: req.headers['x-service-name'] === 'booking-service'
      })
    );
  })
);

router.patch(
  '/:eventId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(updateEventSchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    Object.assign(event, req.body);
    if (req.body.title) {
      event.slug = `${slugify(req.body.title)}-${event._id.toString().slice(-6)}`;
    }
    await event.save();

    await syncSearchDocument(req, event);
    await syncCompletionSchedule(req, event);

    await req.eventBus.publish(DomainEvents.EVENT_UPDATED, {
      eventId: event._id.toString(),
      title: event.title,
      organizerId: event.organizerId,
      startsAt: event.startsAt
    });

    sendSuccess(res, event);
  })
);

router.post(
  '/:eventId/publish',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    if (event.status === 'published') {
      await ensureEventReferralCode(event);
      return sendSuccess(
        res,
        serializeEventForViewer({
          event,
          viewer: req.user,
          appOrigin: req.config.appOrigin
        })
      );
    }

    event.status = 'published';
    await event.save();
    await ensureEventReferralCode(event);

    await syncSearchDocument(req, event);
    await syncCompletionSchedule(req, event);

    await req.eventBus.publish(DomainEvents.EVENT_PUBLISHED, {
      eventId: event._id.toString(),
      title: event.title,
      organizerId: event.organizerId,
      startsAt: event.startsAt,
      visibility: event.visibility
    });

    sendSuccess(
      res,
      serializeEventForViewer({
        event,
        viewer: req.user,
        appOrigin: req.config.appOrigin
      })
    );
  })
);

router.post(
  '/:eventId/status',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(updateStatusSchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    const previousStatus = event.status;
    const wasCompleted = previousStatus === 'completed';
    event.status = req.body.status;
    await event.save();

    await syncSearchDocument(req, event);

    if (event.status === 'completed' && !wasCompleted) {
      await removeCompletionSchedule(req, event._id);
      await req.services?.completionService?.publishCompletedEvent(event);
    } else if (event.status === 'cancelled' || event.status === 'draft') {
      await removeCompletionSchedule(req, event._id);
    } else {
      await syncCompletionSchedule(req, event);
    }

    await req.eventBus.publish(DomainEvents.EVENT_UPDATED, {
      eventId: event._id.toString(),
      title: event.title,
      organizerId: event.organizerId,
      startsAt: event.startsAt,
      status: event.status
    });

    if (previousStatus !== 'published' && event.status === 'published') {
      await ensureEventReferralCode(event);
      await req.eventBus.publish(DomainEvents.EVENT_PUBLISHED, {
        eventId: event._id.toString(),
        title: event.title,
        organizerId: event.organizerId,
        startsAt: event.startsAt,
        visibility: event.visibility
      });
    }

    sendSuccess(
      res,
      serializeEventForViewer({
        event,
        viewer: req.user,
        appOrigin: req.config.appOrigin
      })
    );
  })
);

router.delete(
  '/:eventId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    await removeCompletionSchedule(req, event._id);
    await deleteSearchDocument(req, event._id);
    await event.deleteOne();
    sendSuccess(res, { deleted: true });
  })
);

module.exports = router;
