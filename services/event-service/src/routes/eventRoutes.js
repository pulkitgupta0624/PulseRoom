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
const EventReview = require('../models/EventReview');
const WebhookEndpoint = require('../models/WebhookEndpoint');
const {
  createEventSchema,
  updateEventSchema,
  updateStatusSchema,
  aiEventDraftSchema,
  aiAssistantQuestionSchema,
  promoCodeSchema,
  updatePromoCodeSchema,
  webhookEndpointSchema,
  updateWebhookEndpointSchema,
  networkingSettingsSchema,
  networkingOptInSchema,
  networkingGenerateSchema,
  promoPreviewSchema,
  promoConsumeSchema,
  promoReleaseSchema,
  eventReviewSchema,
  organizerReplySchema
} = require('../validators/eventSchemas');
const { slugify } = require('../services/slugify');
const { generateEventDraft, answerEventQuestion } = require('../services/aiAssistant');
const { buildCalendarFile, buildCalendarFileName } = require('../services/calendarService');
const { buildEventPageTheme } = require('../services/eventThemeService');
const { buildPriceSummary } = require('../services/searchService');
const {
  buildReviewSummary,
  buildReviewWindowOpensAt,
  getReviewWindowOpensAt,
  hasReviewWindowOpened,
  serializeReview
} = require('../services/reviewService');
const {
  buildSponsorRevenueSummary,
  syncSponsorPackageSlots
} = require('../services/sponsorService');
const {
  buildReferralRecord,
  ensureActiveReferralCode,
  rotateReferralCode,
  isReferralExpired,
  serializeEventForViewer
} = require('../services/referralService');
const {
  assertPromoCanBeApplied,
  buildPromoCodeRecord,
  calculatePromoDiscountAmount,
  findPromoCode,
  normalizePromoCode,
  serializePromoCodeForManager
} = require('../services/promoCodeService');
const {
  WEBHOOK_EVENT_OPTIONS,
  SUPPORTED_WEBHOOK_EVENTS,
  generateWebhookSigningSecret,
  serializeWebhookEndpoint,
  validateWebhookTargetUrl
} = require('../services/webhookService');

const router = express.Router();

const canManageEvent = (event, user) => user.role === Roles.ADMIN || event.organizerId === user.sub;

const cacheKeyFromQuery = (query) => `events:list:${JSON.stringify(query)}`;

const assertInternalBookingService = (req) => {
  if (req.headers['x-service-name'] !== 'booking-service') {
    throw new AppError('Forbidden', 403, 'forbidden');
  }
};

const assertInternalService = (req, allowedServices = []) => {
  if (!allowedServices.includes(req.headers['x-service-name'])) {
    throw new AppError('Forbidden', 403, 'forbidden');
  }
};

const assertCanViewEvent = (event, viewer) => {
  if (event.visibility !== EventVisibility.PRIVATE) {
    return;
  }

  const canAccessPrivateEvent = viewer && (viewer.sub === event.organizerId || viewer.role === Roles.ADMIN);
  if (!canAccessPrivateEvent) {
    throw new AppError('Event not available', 403, 'event_private');
  }
};

const getViewerDisplayName = (viewer, fallback = 'Attendee') =>
  viewer?.email?.split('@')?.[0] || fallback;

const loadReviewEligibility = async (req, eventId, userId) => {
  try {
    const response = await req.clients.bookingService.get(
      `/api/bookings/internal/events/${eventId}/review-eligibility`,
      {
        params: {
          userId
        }
      }
    );
    return response.data.data;
  } catch (error) {
    if (error.response?.status === 400) {
      throw new AppError('Review eligibility lookup failed', 400, 'review_eligibility_invalid');
    }

    throw new AppError('Unable to verify attendee eligibility', 502, 'review_eligibility_unavailable');
  }
};

const loadReviewSummary = async (eventId) => {
  const [aggregate] = await EventReview.aggregate([
    {
      $match: {
        eventId: eventId.toString()
      }
    },
    {
      $group: {
        _id: '$eventId',
        averageRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 },
        oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        twoStar: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        threeStar: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        fourStar: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        fiveStar: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } }
      }
    }
  ]);

  return buildReviewSummary(aggregate);
};

const ensurePromoCodeUnique = (event, code, excludePromoCodeId = null) => {
  const normalizedCode = normalizePromoCode(code);
  const alreadyExists = (event.promoCodes || []).some(
    (promoCode) =>
      promoCode.code === normalizedCode &&
      promoCode.promoCodeId !== excludePromoCodeId
  );

  if (alreadyExists) {
    throw new AppError('Promo code already exists for this event', 409, 'promo_code_exists');
  }

  return normalizedCode;
};

const buildWebhookManageResponse = async (eventId) => {
  const endpoints = await WebhookEndpoint.find({ eventId }).sort({ createdAt: -1 });
  return {
    endpoints: endpoints.map(serializeWebhookEndpoint),
    availableEvents: WEBHOOK_EVENT_OPTIONS
  };
};

const loadWebhookEndpointOrThrow = async ({ eventId, webhookId }) => {
  const endpoint = await WebhookEndpoint.findOne({
    _id: webhookId,
    eventId
  });

  if (!endpoint) {
    throw new AppError('Webhook endpoint not found', 404, 'webhook_not_found');
  }

  return endpoint;
};

const serializeNetworkingSettings = (event) => ({
  enabled: Boolean(event?.networking?.enabled),
  matchesPerAttendee: Number(event?.networking?.matchesPerAttendee || 2),
  lastMatchedAt: event?.networking?.lastMatchedAt || null,
  lastMatchedCount: Number(event?.networking?.lastMatchedCount || 0)
});

const normalizeSearchResult = (events, limit) => ({
  items: events.map((event) => {
    const priceSummary = buildPriceSummary(event.ticketTiers || []);
    const eventItem = { ...event };
    delete eventItem.referral;
    delete eventItem.sponsors;
    delete eventItem.sponsorPackages;
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
    await Promise.all(events.map((event) => ensureActiveReferralCode(event)));
    events.forEach((event) => syncSponsorPackageSlots(event));

    const serializedEvents = events.map((event) => {
      const serializedEvent = serializeEventForViewer({
        event,
        viewer: req.user,
        appOrigin: req.config.appOrigin,
        includeReferralLink: true
      });
      return {
        ...serializedEvent,
        sponsorSummary: buildSponsorRevenueSummary(serializedEvent.sponsors || [])
      };
    }
    );
    const totalRevenue = serializedEvents.reduce((sum, item) => sum + (item.analytics?.revenue || 0), 0);
    const totalSponsorRevenue = serializedEvents.reduce(
      (sum, item) => sum + (item.sponsorSummary?.grossRevenue || 0),
      0
    );

    sendSuccess(res, {
      totals: {
        events: serializedEvents.length,
        published: serializedEvents.filter((item) => item.status === 'published').length,
        upcoming: serializedEvents.filter((item) => new Date(item.startsAt) > new Date()).length,
        revenue: totalRevenue,
        sponsorRevenue: totalSponsorRevenue,
        totalRevenue: totalRevenue + totalSponsorRevenue
      },
      events: serializedEvents
    });
  })
);

router.get(
  '/:eventId/promo-codes/manage',
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

    sendSuccess(
      res,
      (event.promoCodes || []).map((promoCode) =>
        serializePromoCodeForManager(promoCode, event.ticketTiers || [])
      )
    );
  })
);

router.post(
  '/:eventId/promo-codes',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(promoCodeSchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    ensurePromoCodeUnique(event, req.body.code);
    event.promoCodes.push(buildPromoCodeRecord(req.body));
    await event.save();

    sendSuccess(
      res,
      (event.promoCodes || []).map((promoCode) =>
        serializePromoCodeForManager(promoCode, event.ticketTiers || [])
      ),
      201
    );
  })
);

router.patch(
  '/:eventId/promo-codes/:promoCodeId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(updatePromoCodeSchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    const promoCode = (event.promoCodes || []).find(
      (item) => item.promoCodeId === req.params.promoCodeId
    );
    if (!promoCode) {
      throw new AppError('Promo code not found', 404, 'promo_code_not_found');
    }

    if (req.body.code) {
      promoCode.code = ensurePromoCodeUnique(event, req.body.code, promoCode.promoCodeId);
    }

    if (req.body.discountType) {
      promoCode.discountType = req.body.discountType;
    }
    if (req.body.discountValue !== undefined) {
      promoCode.discountValue = Number(req.body.discountValue);
    }
    if (req.body.maxRedemptions !== undefined) {
      if (Number(req.body.maxRedemptions) < Number(promoCode.redemptionsUsed || 0)) {
        throw new AppError(
          `This promo code already has ${promoCode.redemptionsUsed || 0} redemption(s).`,
          409,
          'promo_code_redemptions_locked'
        );
      }
      promoCode.maxRedemptions = Number(req.body.maxRedemptions);
    }
    if (req.body.startsAt !== undefined) {
      promoCode.startsAt = req.body.startsAt || undefined;
    }
    if (req.body.expiresAt !== undefined) {
      promoCode.expiresAt = req.body.expiresAt || undefined;
    }
    if (req.body.appliesToTierIds) {
      promoCode.appliesToTierIds = req.body.appliesToTierIds;
    }
    if (req.body.active !== undefined) {
      promoCode.active = Boolean(req.body.active);
    }

    await event.save();

    sendSuccess(
      res,
      (event.promoCodes || []).map((item) =>
        serializePromoCodeForManager(item, event.ticketTiers || [])
      )
    );
  })
);

router.delete(
  '/:eventId/promo-codes/:promoCodeId',
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

    const previousCount = (event.promoCodes || []).length;
    event.promoCodes = (event.promoCodes || []).filter(
      (promoCode) => promoCode.promoCodeId !== req.params.promoCodeId
    );

    if (event.promoCodes.length === previousCount) {
      throw new AppError('Promo code not found', 404, 'promo_code_not_found');
    }

    await event.save();
    sendSuccess(res, { deleted: true });
  })
);

router.post(
  '/:eventId/promo-codes/preview',
  validateSchema(promoPreviewSchema),
  asyncHandler(async (req, res) => {
    assertInternalBookingService(req);

    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    const promoCode = findPromoCode(event, req.body.code);
    assertPromoCanBeApplied({
      promoCode,
      tierId: req.body.tierId
    });

    sendSuccess(res, {
      promoCodeId: promoCode.promoCodeId,
      code: promoCode.code,
      discountType: promoCode.discountType,
      discountValue: promoCode.discountValue,
      discountAmount: calculatePromoDiscountAmount({
        subtotal: req.body.subtotal,
        promoCode
      }),
      appliesToTierIds: promoCode.appliesToTierIds || [],
      expiresAt: promoCode.expiresAt || null
    });
  })
);

router.post(
  '/:eventId/promo-codes/consume',
  validateSchema(promoConsumeSchema),
  asyncHandler(async (req, res) => {
    assertInternalBookingService(req);

    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    const promoCode = (event.promoCodes || []).find(
      (item) =>
        item.promoCodeId === req.body.promoCodeId &&
        item.code === normalizePromoCode(req.body.code)
    );
    assertPromoCanBeApplied({
      promoCode,
      tierId: req.body.tierId || promoCode?.appliesToTierIds?.[0]
    });

    const updateResult = await Event.updateOne(
      {
        _id: event._id
      },
      {
        $inc: {
          'promoCodes.$[promoCode].redemptionsUsed': 1,
          'promoCodes.$[promoCode].totalDiscountGiven': Number(req.body.discountAmount || 0)
        },
        $set: {
          'promoCodes.$[promoCode].lastRedeemedAt': new Date(),
          'promoCodes.$[promoCode].lastRedeemedByUserId': req.body.redeemedByUserId
        }
      },
      {
        arrayFilters: [
          {
            'promoCode.promoCodeId': req.body.promoCodeId,
            'promoCode.code': normalizePromoCode(req.body.code),
            'promoCode.active': true,
            'promoCode.redemptionsUsed': { $lt: Number(promoCode.maxRedemptions || 0) }
          }
        ]
      }
    );

    if (!updateResult.modifiedCount) {
      throw new AppError('This promo code has reached its usage cap', 409, 'promo_code_exhausted');
    }

    sendSuccess(res, {
      consumed: true,
      bookingId: req.body.bookingId
    });
  })
);

router.post(
  '/:eventId/promo-codes/release',
  validateSchema(promoReleaseSchema),
  asyncHandler(async (req, res) => {
    assertInternalBookingService(req);

    const updateResult = await Event.updateOne(
      {
        _id: req.params.eventId
      },
      {
        $inc: {
          'promoCodes.$[promoCode].redemptionsUsed': -1,
          'promoCodes.$[promoCode].totalDiscountGiven': -Number(req.body.discountAmount || 0)
        }
      },
      {
        arrayFilters: [
          {
            'promoCode.promoCodeId': req.body.promoCodeId,
            'promoCode.code': normalizePromoCode(req.body.code),
            'promoCode.redemptionsUsed': { $gt: 0 }
          }
        ]
      }
    );

    sendSuccess(res, {
      released: Boolean(updateResult.modifiedCount),
      bookingId: req.body.bookingId
    });
  })
);

router.get(
  '/:eventId/webhooks/manage',
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

    sendSuccess(res, await buildWebhookManageResponse(req.params.eventId));
  })
);

router.post(
  '/:eventId/webhooks',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(webhookEndpointSchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    const invalidEvent = req.body.subscribedEvents.find(
      (eventName) => !SUPPORTED_WEBHOOK_EVENTS.has(eventName)
    );
    if (invalidEvent) {
      throw new AppError('Webhook event type is not supported', 422, 'webhook_event_invalid');
    }

    const targetUrl = await validateWebhookTargetUrl(req.body.targetUrl);
    const signingSecret = generateWebhookSigningSecret();
    const endpoint = await WebhookEndpoint.create({
      organizerId: event.organizerId,
      eventId: event._id.toString(),
      targetUrl,
      subscribedEvents: req.body.subscribedEvents,
      signingSecret,
      active: req.body.active !== false
    });

    sendSuccess(
      res,
      {
        endpoint: serializeWebhookEndpoint(endpoint),
        signingSecret
      },
      201
    );
  })
);

router.patch(
  '/:eventId/webhooks/:webhookId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(updateWebhookEndpointSchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    if (req.body.subscribedEvents) {
      const invalidEvent = req.body.subscribedEvents.find(
        (eventName) => !SUPPORTED_WEBHOOK_EVENTS.has(eventName)
      );
      if (invalidEvent) {
        throw new AppError('Webhook event type is not supported', 422, 'webhook_event_invalid');
      }
    }

    const endpoint = await loadWebhookEndpointOrThrow({
      eventId: req.params.eventId,
      webhookId: req.params.webhookId
    });

    if (req.body.targetUrl !== undefined) {
      endpoint.targetUrl = await validateWebhookTargetUrl(req.body.targetUrl);
    }
    if (req.body.subscribedEvents) {
      endpoint.subscribedEvents = req.body.subscribedEvents;
    }
    if (req.body.active !== undefined) {
      endpoint.active = Boolean(req.body.active);
    }

    await endpoint.save();
    sendSuccess(res, serializeWebhookEndpoint(endpoint));
  })
);

router.post(
  '/:eventId/webhooks/:webhookId/test',
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

    const endpoint = await loadWebhookEndpointOrThrow({
      eventId: req.params.eventId,
      webhookId: req.params.webhookId
    });

    await req.services.webhookService.queueTestDelivery({
      endpoint,
      event: {
        eventId: event._id.toString(),
        title: event.title
      }
    });

    sendSuccess(res, { queued: true });
  })
);

router.delete(
  '/:eventId/webhooks/:webhookId',
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

    const endpoint = await loadWebhookEndpointOrThrow({
      eventId: req.params.eventId,
      webhookId: req.params.webhookId
    });
    await endpoint.deleteOne();

    sendSuccess(res, { deleted: true });
  })
);

router.get(
  '/:eventId/networking/manage',
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

    const response = await req.clients.notificationService.get(
      `/api/notifications/internal/networking/${req.params.eventId}/manage`
    );

    sendSuccess(res, {
      settings: serializeNetworkingSettings(event),
      stats: response.data.data
    });
  })
);

router.patch(
  '/:eventId/networking',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(networkingSettingsSchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    event.networking = {
      ...(event.networking || {}),
      ...(req.body.enabled !== undefined ? { enabled: Boolean(req.body.enabled) } : {}),
      ...(req.body.matchesPerAttendee !== undefined
        ? { matchesPerAttendee: Number(req.body.matchesPerAttendee) }
        : {})
    };
    await event.save();

    sendSuccess(res, serializeNetworkingSettings(event));
  })
);

router.post(
  '/:eventId/networking/generate',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(networkingGenerateSchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }
    if (!event.networking?.enabled) {
      throw new AppError('Networking is disabled for this event', 409, 'networking_disabled');
    }

    const response = await req.clients.notificationService.post(
      `/api/notifications/internal/networking/${req.params.eventId}/generate`,
      {
        organizerId: event.organizerId,
        eventTitle: event.title,
        startsAt: event.startsAt,
        matchesPerAttendee: Number(event.networking?.matchesPerAttendee || 2),
        forceRegenerate: Boolean(req.body.forceRegenerate)
      }
    );

    event.networking = {
      ...(event.networking || {}),
      lastMatchedAt: new Date(),
      lastMatchedCount: Number(response.data.data.createdMatches || 0)
    };
    await event.save();

    sendSuccess(res, {
      settings: serializeNetworkingSettings(event),
      ...response.data.data
    });
  })
);

router.get(
  '/:eventId/networking/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    const response = await req.clients.notificationService.post(
      `/api/notifications/internal/networking/${req.params.eventId}/me`,
      {
        userId: req.user.sub
      }
    );

    sendSuccess(res, {
      ...response.data.data,
      settings: serializeNetworkingSettings(event)
    });
  })
);

router.post(
  '/:eventId/networking/me',
  authenticate(),
  validateSchema(networkingOptInSchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    if (req.body.optedIn && !event.networking?.enabled) {
      throw new AppError('Networking is not enabled for this event yet', 409, 'networking_disabled');
    }

    const response = await req.clients.notificationService.post(
      `/api/notifications/internal/networking/${req.params.eventId}/opt-in`,
      {
        userId: req.user.sub,
        optedIn: Boolean(req.body.optedIn)
      }
    );

    sendSuccess(res, {
      ...response.data.data,
      settings: serializeNetworkingSettings(event)
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
    const event = new Event({
      ...req.body,
      pageTheme: buildEventPageTheme(req.body.pageTheme || {}),
      organizerId: req.user.sub,
      slug: `${slugBase}-${crypto.randomBytes(3).toString('hex')}`
    });
    await ensureActiveReferralCode(event);

    await syncSearchDocument(req, event);
    await syncCompletionSchedule(req, event);

    await req.eventBus.publish(DomainEvents.EVENT_CREATED, {
      eventId: event._id.toString(),
      organizerId: event.organizerId,
      title: event.title,
      startsAt: event.startsAt
    });

    sendSuccess(
      res,
      serializeEventForViewer({
        event,
        viewer: req.user,
        appOrigin: req.config.appOrigin,
        includeReferralLink: true
      }),
      201
    );
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
  '/:eventId/internal-meta',
  asyncHandler(async (req, res) => {
    assertInternalService(req, ['live-service', 'notification-service', 'booking-service', 'chat-service']);

    const event = await Event.findById(req.params.eventId)
      .select('organizerId title startsAt endsAt visibility status networking speakers')
      .lean();

    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    sendSuccess(res, {
      eventId: req.params.eventId,
      organizerId: event.organizerId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      visibility: event.visibility,
      status: event.status,
      speakers: (event.speakers || []).map((speaker) => ({
        userId: speaker.userId || '',
        email: speaker.email || '',
        name: speaker.name,
        title: speaker.title || '',
        company: speaker.company || ''
      })),
      networking: {
        enabled: Boolean(event.networking?.enabled),
        matchesPerAttendee: Number(event.networking?.matchesPerAttendee || 2),
        lastMatchedAt: event.networking?.lastMatchedAt || null,
        lastMatchedCount: Number(event.networking?.lastMatchedCount || 0)
      }
    });
  })
);

router.get(
  '/:eventId/reviews',
  asyncHandler(async (req, res) => {
    const viewer = decodeOptionalToken(req);
    const event = await Event.findById(req.params.eventId)
      .select('organizerId visibility status endsAt updatedAt reviewWindowOpensAt')
      .lean();
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    assertCanViewEvent(event, viewer);

    const reviews = await EventReview.find({
      eventId: req.params.eventId
    })
      .sort({ createdAt: -1 })
      .limit(24)
      .lean();

    sendSuccess(res, {
      summary: await loadReviewSummary(req.params.eventId),
      reviewWindow: {
        opensAt: getReviewWindowOpensAt(event),
        isOpen: hasReviewWindowOpened(event)
      },
      items: reviews.map(serializeReview)
    });
  })
);

router.get(
  '/:eventId/reviews/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId)
      .select('organizerId visibility status endsAt updatedAt reviewWindowOpensAt')
      .lean();
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    assertCanViewEvent(event, req.user);

    const reviewWindow = {
      opensAt: getReviewWindowOpensAt(event),
      isOpen: hasReviewWindowOpened(event)
    };

    if (req.user.sub === event.organizerId) {
      return sendSuccess(res, {
        eligible: false,
        canReview: false,
        reason: 'Organizers cannot rate their own events.',
        booking: null,
        reviewWindow,
        review: null
      });
    }

    const eligibility = await loadReviewEligibility(req, req.params.eventId, req.user.sub);
    const review = await EventReview.findOne({
      eventId: req.params.eventId,
      userId: req.user.sub
    }).lean();

    let reason = null;
    if (!eligibility.eligible) {
      reason = 'Only confirmed attendees can leave a review for this event.';
    } else if (!reviewWindow.isOpen) {
      reason = reviewWindow.opensAt
        ? `Reviews open 48 hours after the event is completed on ${new Date(reviewWindow.opensAt).toLocaleString()}.`
        : 'Reviews open 48 hours after the organizer marks the event as completed.';
    }

    sendSuccess(res, {
      eligible: Boolean(eligibility.eligible),
      canReview: Boolean(eligibility.eligible && reviewWindow.isOpen),
      reason,
      booking: eligibility.booking,
      reviewWindow,
      review: serializeReview(review)
    });
  })
);

router.post(
  '/:eventId/reviews',
  authenticate(),
  validateSchema(eventReviewSchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId)
      .select('organizerId visibility status endsAt updatedAt reviewWindowOpensAt')
      .lean();
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    assertCanViewEvent(event, req.user);

    if (req.user.sub === event.organizerId) {
      throw new AppError('Organizers cannot rate their own events', 403, 'review_forbidden');
    }

    if (event.status !== 'completed' || !hasReviewWindowOpened(event)) {
      throw new AppError('Reviews open 48 hours after the event is completed', 409, 'review_window_closed');
    }

    const eligibility = await loadReviewEligibility(req, req.params.eventId, req.user.sub);
    if (!eligibility.eligible) {
      throw new AppError('Only confirmed attendees can review this event', 403, 'review_not_eligible');
    }

    const existingReview = await EventReview.findOne({
      eventId: req.params.eventId,
      userId: req.user.sub
    });

    const review = existingReview || new EventReview({
      eventId: req.params.eventId,
      organizerId: event.organizerId,
      userId: req.user.sub
    });

    review.authorName =
      eligibility.booking?.attendee?.name?.trim() ||
      getViewerDisplayName(req.user);
    review.rating = Number(req.body.rating);
    review.reviewText = req.body.reviewText?.trim() || '';

    await review.save();

    sendSuccess(
      res,
      {
        review: serializeReview(review),
        summary: await loadReviewSummary(req.params.eventId)
      },
      existingReview ? 200 : 201
    );
  })
);

router.patch(
  '/:eventId/reviews/:reviewId/reply',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(organizerReplySchema),
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId)
      .select('organizerId organizerSignatureName')
      .lean();
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!(req.user.role === Roles.ADMIN || req.user.sub === event.organizerId)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    const review = await EventReview.findOne({
      _id: req.params.reviewId,
      eventId: req.params.eventId
    });
    if (!review) {
      throw new AppError('Review not found', 404, 'review_not_found');
    }

    const timestamp = new Date();
    review.organizerReply = {
      body: req.body.body.trim(),
      authorName:
        event.organizerSignatureName?.trim() ||
        (req.user.role === Roles.ADMIN ? 'PulseRoom Admin' : getViewerDisplayName(req.user, 'Organizer')),
      createdAt: review.organizerReply?.createdAt || timestamp,
      updatedAt: timestamp
    };
    await review.save();

    sendSuccess(res, {
      review: serializeReview(review),
      summary: await loadReviewSummary(req.params.eventId)
    });
  })
);

router.get(
  '/:eventId/calendar.ics',
  asyncHandler(async (req, res) => {
    const event = await Event.findById(req.params.eventId).lean();
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    assertCanViewEvent(event, decodeOptionalToken(req));

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

    assertCanViewEvent(event, viewer);

    syncSponsorPackageSlots(event);

    const isInternalServiceRequest = Boolean(req.headers['x-service-name']);
    const isReferralVisit =
      !isInternalServiceRequest &&
      Boolean(req.query.ref) &&
      event.referral?.code === req.query.ref &&
      event.referral?.status === 'active' &&
      viewer?.sub !== event.organizerId;

    if (!event.referral?.code && viewer && (viewer.sub === event.organizerId || viewer.role === Roles.ADMIN)) {
      await ensureActiveReferralCode(event);
    }

    if (!isInternalServiceRequest) {
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
    }

    sendSuccess(
      res,
      serializeEventForViewer({
        event,
        viewer,
        appOrigin: req.config.appOrigin,
        includeReferral: req.headers['x-service-name'] === 'booking-service',
        referralCode: req.query.ref
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

    const nextPayload = { ...req.body };
    if (req.body.pageTheme) {
      nextPayload.pageTheme = buildEventPageTheme({
        ...(event.pageTheme || {}),
        ...req.body.pageTheme
      });
    }

    Object.assign(event, nextPayload);
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

    sendSuccess(
      res,
      serializeEventForViewer({
        event,
        viewer: req.user,
        appOrigin: req.config.appOrigin,
        includeReferralLink: true
      })
    );
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
      await ensureActiveReferralCode(event);
      return sendSuccess(
        res,
        serializeEventForViewer({
          event,
          viewer: req.user,
          appOrigin: req.config.appOrigin,
          includeReferralLink: true
        })
      );
    }

    event.status = 'published';
    await event.save();
    await ensureActiveReferralCode(event);

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
        appOrigin: req.config.appOrigin,
        includeReferralLink: true
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
    if (req.body.status === 'completed' && !wasCompleted) {
      event.reviewWindowOpensAt = buildReviewWindowOpensAt();
    }
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
      await ensureActiveReferralCode(event);
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
        appOrigin: req.config.appOrigin,
        includeReferralLink: true
      })
    );
  })
);

router.post(
  '/:eventId/referral/consume',
  asyncHandler(async (req, res) => {
    if (req.headers['x-service-name'] !== 'booking-service') {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    const referralCode = req.body?.code?.trim();
    const redeemedByUserId = req.body?.redeemedByUserId?.trim();
    const discountAmount = Number(req.body?.discountAmount || 0);

    if (!referralCode || !redeemedByUserId) {
      throw new AppError('Referral code and redeemedByUserId are required', 400, 'referral_consume_invalid');
    }

    const event = await Event.findById(req.params.eventId);
    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    if (event.referral?.code !== referralCode || event.referral?.status !== 'active') {
      throw new AppError('This referral discount link is no longer active', 409, 'referral_inactive');
    }

    if (isReferralExpired(event.referral)) {
      event.referral.status = 'expired';
      await event.save();
      throw new AppError('This referral discount link has expired', 409, 'referral_expired');
    }

    const nextReferral = buildReferralRecord(event, {
      clicks: Number(event.referral?.clicks || 0),
      totalRedemptions: Number(event.referral?.totalRedemptions || 0) + 1,
      totalDiscountGiven: Number(event.referral?.totalDiscountGiven || 0) + discountAmount,
      lastRedeemedAt: new Date(),
      lastRedeemedByUserId: redeemedByUserId
    });

    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: event._id,
        'referral.code': referralCode,
        'referral.status': 'active'
      },
      {
        $set: {
          referral: nextReferral
        }
      },
      {
        new: true
      }
    );

    if (!updatedEvent) {
      throw new AppError('This referral discount link has already been used', 409, 'referral_redeemed');
    }

    sendSuccess(res, {
      consumed: true,
      nextReferralCode: updatedEvent.referral?.code || null,
      nextReferralLink:
        updatedEvent.referral?.code
          ? serializeEventForViewer({
              event: updatedEvent,
              viewer: { sub: updatedEvent.organizerId, role: Roles.ORGANIZER },
              appOrigin: req.config.appOrigin,
              includeReferralLink: true
            }).referralLink
          : null
    });
  })
);

router.post(
  '/:eventId/referral/regenerate',
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

    await rotateReferralCode(event);

    sendSuccess(
      res,
      serializeEventForViewer({
        event,
        viewer: req.user,
        appOrigin: req.config.appOrigin,
        includeReferralLink: true
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
