const crypto = require('crypto');
const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  authorize,
  decodeOptionalToken,
  sendSuccess,
  validateSchema,
  Roles,
  DomainEvents,
  PaymentStatus
} = require('@pulseroom/common');
const Event = require('../models/Event');
const EventSeries = require('../models/EventSeries');
const SeriesMembership = require('../models/SeriesMembership');
const SeriesMembershipPurchase = require('../models/SeriesMembershipPurchase');
const {
  createEventSeriesSchema,
  updateEventSeriesSchema,
  seriesCloneEventSchema
} = require('../validators/eventSchemas');
const {
  applySeriesSnapshotToEvent,
  buildSeriesMembershipPerksSnapshot,
  buildSeriesSlug,
  clearSeriesFromEvent,
  cloneEventForSeries,
  normalizeSeriesMembershipSettings,
  serializeSeries,
  serializeSeriesMembership
} = require('../services/seriesService');
const {
  buildSeriesPaymentResponse,
  constructSeriesWebhookEvent,
  createSeriesPaymentIntent,
  retrieveSeriesPaymentIntent,
  syncSeriesPaymentStatusFromIntent
} = require('../services/seriesPaymentService');
const { slugify } = require('../services/slugify');
const {
  ensureActiveReferralCode,
  serializeEventForViewer
} = require('../services/referralService');

const router = express.Router();

const canManageSeries = (series, user) =>
  Boolean(series && user && (user.role === Roles.ADMIN || series.organizerId === user.sub));

const canManageEvent = (event, user) =>
  Boolean(event && user && (user.role === Roles.ADMIN || event.organizerId === user.sub));

const canAccessPurchase = (purchase, user) =>
  Boolean(
    purchase &&
      user &&
      (user.role === Roles.ADMIN || purchase.userId === user.sub || purchase.organizerId === user.sub)
  );

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

const syncSearchDocument = async (req, event) => {
  try {
    if (req.services?.searchService?.isEnabled()) {
      await req.services.searchService.upsertEvent(event);
    }
  } catch (error) {
    req.logger.warn({
      message: 'Failed to sync event search document after series change',
      eventId: event?._id?.toString?.(),
      error: error.message
    });
  }
};

const loadSeriesOrThrow = async (seriesId) => {
  const series = await EventSeries.findById(seriesId);
  if (!series) {
    throw new AppError('Series not found', 404, 'series_not_found');
  }

  return series;
};

const serializeSeriesMembershipPurchase = (purchase) => {
  if (!purchase) {
    return null;
  }

  const raw = typeof purchase.toObject === 'function' ? purchase.toObject() : { ...purchase };

  return {
    _id: raw._id?.toString?.() || raw._id,
    seriesId: String(raw.seriesId || ''),
    organizerId: String(raw.organizerId || ''),
    userId: String(raw.userId || ''),
    provider: raw.provider || 'manual',
    providerPaymentId: raw.providerPaymentId || null,
    amount: Number(raw.amount || 0),
    currency: raw.currency || 'INR',
    status: raw.status || PaymentStatus.CREATED,
    membershipId: raw.membershipId?.toString?.() || raw.membershipId || null,
    seriesSnapshot: raw.seriesSnapshot || {},
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null
  };
};

const activateSeriesMembershipFromPurchase = async ({ req, purchase, providerPaymentId = null }) => {
  const series = await loadSeriesOrThrow(purchase.seriesId);
  const perksSnapshot = buildSeriesMembershipPerksSnapshot(series);
  let membership = await SeriesMembership.findOne({
    seriesId: purchase.seriesId,
    userId: purchase.userId
  });

  if (membership) {
    membership.status = 'active';
    membership.attendee = purchase.attendee || membership.attendee || {};
    membership.perks = perksSnapshot;
    membership.lastUsedAt = new Date();
    if (!membership.joinedAt) {
      membership.joinedAt = new Date();
    }
    await membership.save();
  } else {
    membership = await SeriesMembership.create({
      seriesId: purchase.seriesId,
      organizerId: purchase.organizerId,
      userId: purchase.userId,
      attendee: purchase.attendee || {},
      source: 'self_join',
      lastUsedAt: new Date(),
      perks: perksSnapshot
    });
  }

  purchase.membershipId = membership._id;
  purchase.status = PaymentStatus.SUCCEEDED;
  if (providerPaymentId) {
    purchase.providerPaymentId = providerPaymentId;
  }
  await purchase.save();

  await req.eventBus.publish(DomainEvents.SERIES_MEMBERSHIP_ACTIVATED, {
    membershipId: membership._id.toString(),
    seriesId: series._id.toString(),
    seriesName: series.name,
    seriesSlug: series.slug,
    organizerId: series.organizerId,
    userId: membership.userId,
    attendeeEmail: membership.attendee?.email || '',
    attendeeName: membership.attendee?.name || '',
    planName: perksSnapshot.planName,
    amount: purchase.amount,
    currency: purchase.currency
  });

  return {
    series,
    membership
  };
};

const syncLinkedSeriesEvents = async ({ req, series }) => {
  const linkedEvents = await Event.find({
    'series.seriesId': series._id.toString()
  }).sort({ 'series.position': 1, startsAt: 1 });

  for (const [index, event] of linkedEvents.entries()) {
    applySeriesSnapshotToEvent(event, series, {
      position: index + 1,
      seasonLabel: event.series?.seasonLabel
    });
    await event.save();
    await syncSearchDocument(req, event);
  }
};

const serializeSeriesEventsForViewer = (events = [], viewer = null, appOrigin = '') =>
  events.map((event) =>
    serializeEventForViewer({
      event,
      viewer,
      appOrigin,
      includeReferralLink: Boolean(viewer && (viewer.role === Roles.ADMIN || viewer.sub === event.organizerId))
    })
  );

const buildSeriesManagePayload = async ({ req, seriesRecords = [] }) => {
  const seriesIds = seriesRecords.map((series) => series._id.toString());
  const linkedEvents = seriesIds.length
    ? await Event.find({
        'series.seriesId': {
          $in: seriesIds
        }
      }).sort({ startsAt: 1 })
    : [];
  const membershipCounts = seriesIds.length
    ? await SeriesMembership.aggregate([
        {
          $match: {
            seriesId: {
              $in: seriesIds
            },
            status: 'active'
          }
        },
        {
          $group: {
            _id: '$seriesId',
            count: {
              $sum: 1
            }
          }
        }
      ])
    : [];
  const membershipCountMap = membershipCounts.reduce((accumulator, item) => {
    accumulator[String(item._id)] = Number(item.count || 0);
    return accumulator;
  }, {});
  const eventsBySeriesId = linkedEvents.reduce((accumulator, event) => {
    const key = String(event.series?.seriesId || '');
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push(event);
    return accumulator;
  }, {});
  const now = Date.now();

  return {
    series: seriesRecords.map((series) => {
      const id = series._id.toString();
      const events = eventsBySeriesId[id] || [];
      const upcomingEvents = events.filter((event) => new Date(event.startsAt).getTime() > now);

      return {
        ...serializeSeries(series),
        stats: {
          totalEvents: events.length,
          upcomingEvents: upcomingEvents.length,
          activeMembers: Number(membershipCountMap[id] || 0),
          nextEventAt: upcomingEvents[0]?.startsAt || null
        },
        events: serializeSeriesEventsForViewer(events, req.user, req.config.appOrigin)
      };
    })
  };
};

const buildSeriesInternalMeta = async (series) => {
  const upcomingPublishedEvent = await Event.findOne({
    'series.seriesId': series._id.toString(),
    status: 'published',
    startsAt: {
      $gt: new Date()
    }
  })
    .sort({ startsAt: 1 })
    .select('_id title startsAt endsAt status visibility')
    .lean();

  return {
    seriesId: series._id.toString(),
    organizerId: series.organizerId,
    name: series.name,
    slug: series.slug,
    status: series.status,
    nextEventId: upcomingPublishedEvent?._id?.toString?.() || null,
    nextEventTitle: upcomingPublishedEvent?.title || '',
    nextEventStartsAt: upcomingPublishedEvent?.startsAt || null,
    nextEventEndsAt: upcomingPublishedEvent?.endsAt || null,
    nextEventVisibility: upcomingPublishedEvent?.visibility || '',
    nextEventStatus: upcomingPublishedEvent?.status || ''
  };
};

router.get(
  '/series/organizer/manage',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const filter = req.user.role === Roles.ADMIN ? {} : { organizerId: req.user.sub };
    const seriesRecords = await EventSeries.find(filter).sort({ createdAt: -1 });
    sendSuccess(res, await buildSeriesManagePayload({ req, seriesRecords }));
  })
);

router.post(
  '/series',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(createEventSeriesSchema),
  asyncHandler(async (req, res) => {
    const series = await EventSeries.create({
      organizerId: req.user.sub,
      name: req.body.name.trim(),
      slug: `${buildSeriesSlug(req.body.name)}-${crypto.randomBytes(3).toString('hex')}`,
      summary: req.body.summary.trim(),
      description: req.body.description?.trim() || '',
      cadenceLabel: req.body.cadenceLabel?.trim() || '',
      categories: req.body.categories || [],
      tags: req.body.tags || [],
      status: req.body.status || 'active',
      membershipSettings: normalizeSeriesMembershipSettings(req.body.membershipSettings),
      theme: {
        accentColor: req.body.theme?.accentColor || '#1D7A85',
        coverImageUrl: req.body.theme?.coverImageUrl || ''
      }
    });

    sendSuccess(res, serializeSeries(series), 201);
  })
);

router.patch(
  '/series/:seriesId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(updateEventSeriesSchema),
  asyncHandler(async (req, res) => {
    const series = await loadSeriesOrThrow(req.params.seriesId);
    if (!canManageSeries(series, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    if (req.body.name) {
      series.name = req.body.name.trim();
      series.slug = `${buildSeriesSlug(req.body.name)}-${series._id.toString().slice(-6)}`;
    }
    if (req.body.summary !== undefined) {
      series.summary = req.body.summary.trim();
    }
    if (req.body.description !== undefined) {
      series.description = req.body.description?.trim() || '';
    }
    if (req.body.cadenceLabel !== undefined) {
      series.cadenceLabel = req.body.cadenceLabel?.trim() || '';
    }
    if (req.body.categories) {
      series.categories = req.body.categories;
    }
    if (req.body.tags) {
      series.tags = req.body.tags;
    }
    if (req.body.status) {
      series.status = req.body.status;
    }
    if (req.body.membershipSettings) {
      series.membershipSettings = normalizeSeriesMembershipSettings({
        ...series.membershipSettings?.toObject?.(),
        ...req.body.membershipSettings
      });
    }
    if (req.body.theme) {
      series.theme = {
        accentColor: req.body.theme.accentColor || series.theme?.accentColor || '#1D7A85',
        coverImageUrl: req.body.theme.coverImageUrl ?? series.theme?.coverImageUrl ?? ''
      };
    }

    await series.save();
    await syncLinkedSeriesEvents({ req, series });

    sendSuccess(res, serializeSeries(series));
  })
);

router.post(
  '/series/:seriesId/events/:eventId/attach',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const [series, event] = await Promise.all([
      loadSeriesOrThrow(req.params.seriesId),
      Event.findById(req.params.eventId)
    ]);

    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageSeries(series, req.user) || !canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    const siblingCount = await Event.countDocuments({
      'series.seriesId': series._id.toString(),
      _id: {
        $ne: event._id
      }
    });

    applySeriesSnapshotToEvent(event, series, {
      position: siblingCount + 1,
      seasonLabel: event.series?.seasonLabel
    });
    await event.save();
    await syncLinkedSeriesEvents({ req, series });
    await syncSearchDocument(req, event);

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
  '/series/:seriesId/events/:eventId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const [series, event] = await Promise.all([
      loadSeriesOrThrow(req.params.seriesId),
      Event.findById(req.params.eventId)
    ]);

    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (!canManageSeries(series, req.user) || !canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }
    if (event.series?.seriesId !== series._id.toString()) {
      throw new AppError('Event is not linked to this series', 404, 'series_event_not_found');
    }

    clearSeriesFromEvent(event);
    await event.save();
    await syncLinkedSeriesEvents({ req, series });
    await syncSearchDocument(req, event);

    sendSuccess(res, { detached: true });
  })
);

router.post(
  '/series/:seriesId/events/clone',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(seriesCloneEventSchema),
  asyncHandler(async (req, res) => {
    const series = await loadSeriesOrThrow(req.params.seriesId);
    if (!canManageSeries(series, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    const sourceEvent = req.body.sourceEventId
      ? await Event.findById(req.body.sourceEventId)
      : await Event.findOne({
          organizerId: series.organizerId,
          'series.seriesId': series._id.toString()
        }).sort({ startsAt: -1, createdAt: -1 });

    if (!sourceEvent) {
      throw new AppError('Choose a source event to clone from', 404, 'series_clone_source_missing');
    }
    if (!canManageEvent(sourceEvent, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    const nextPosition =
      (await Event.countDocuments({
        'series.seriesId': series._id.toString()
      })) + 1;
    const eventPayload = cloneEventForSeries({
      sourceEvent,
      series,
      organizerId: req.user.sub,
      title: req.body.title,
      startsAt: req.body.startsAt,
      endsAt: req.body.endsAt,
      position: nextPosition
    });
    const event = new Event({
      ...eventPayload,
      slug: `${slugify(eventPayload.title)}-${crypto.randomBytes(3).toString('hex')}`
    });
    await ensureActiveReferralCode(event);
    await syncSearchDocument(req, event);

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
  '/series/webhooks/stripe',
  asyncHandler(async (req, res) => {
    if (req.config.paymentProvider !== 'stripe') {
      return sendSuccess(res, { ignored: true });
    }

    const signature = req.headers['stripe-signature'];
    const webhookEvent = constructSeriesWebhookEvent(req.rawBody, signature);

    if (webhookEvent.type === 'payment_intent.succeeded') {
      const intent = webhookEvent.data.object;
      const purchase = await SeriesMembershipPurchase.findOne({
        providerPaymentId: intent.id
      });

      if (purchase && purchase.status !== PaymentStatus.SUCCEEDED) {
        await activateSeriesMembershipFromPurchase({
          req,
          purchase,
          providerPaymentId: intent.id
        });
      }
    }

    res.status(200).json({ received: true });
  })
);

router.get(
  '/series/:seriesId/internal-meta',
  asyncHandler(async (req, res) => {
    assertInternalService(req, ['notification-service']);

    const series = await loadSeriesOrThrow(req.params.seriesId);

    sendSuccess(res, await buildSeriesInternalMeta(series));
  })
);

router.get(
  '/series/:seriesId/internal-members',
  asyncHandler(async (req, res) => {
    assertInternalService(req, ['notification-service']);

    const series = await loadSeriesOrThrow(req.params.seriesId);
    const memberships = await SeriesMembership.find({
      seriesId: series._id.toString(),
      status: 'active'
    })
      .sort({ joinedAt: 1, createdAt: 1 })
      .lean();

    sendSuccess(res, {
      series: serializeSeries(series),
      meta: await buildSeriesInternalMeta(series),
      members: memberships.map((membership) => ({
        membershipId: membership._id.toString(),
        userId: membership.userId,
        email: membership.attendee?.email || '',
        attendeeName: membership.attendee?.name || '',
        source: membership.source || 'self_join',
        status: membership.status || 'active',
        joinedAt: membership.joinedAt || membership.createdAt || null,
        lastUsedAt: membership.lastUsedAt || null,
        planName: membership.perks?.planName || series.membershipSettings?.planName || 'Series Pass',
        price: Number(membership.perks?.price || 0),
        isPaid: Number(membership.perks?.price || 0) > 0,
        currency: membership.perks?.currency || series.membershipSettings?.currency || 'INR',
        includesReplayLibrary:
          membership.perks?.includesReplayLibrary !== undefined
            ? membership.perks.includesReplayLibrary !== false
            : series.membershipSettings?.includesReplayLibrary !== false,
        vipNetworking:
          membership.perks?.vipNetworking !== undefined
            ? Boolean(membership.perks.vipNetworking)
            : Boolean(series.membershipSettings?.vipNetworking),
        membersOnlyBooking:
          membership.perks?.membersOnlyBooking !== undefined
            ? Boolean(membership.perks.membersOnlyBooking)
            : Boolean(series.membershipSettings?.membersOnlyBooking)
      }))
    });
  })
);

router.get(
  '/series/:seriesId/internal-membership',
  asyncHandler(async (req, res) => {
    assertInternalBookingService(req);

    const series = await loadSeriesOrThrow(req.params.seriesId);
    const membership = req.query.userId
      ? await SeriesMembership.findOne({
          seriesId: series._id.toString(),
          userId: req.query.userId,
          status: 'active'
        })
      : null;

    sendSuccess(res, {
      series: serializeSeries(series),
      membershipSettings: normalizeSeriesMembershipSettings(series.membershipSettings),
      active: Boolean(membership),
      membership: serializeSeriesMembership(membership)
    });
  })
);

router.get(
  '/series/:seriesId/memberships/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    const series = await loadSeriesOrThrow(req.params.seriesId);
    const membership = await SeriesMembership.findOne({
      seriesId: series._id.toString(),
      userId: req.user.sub,
      status: 'active'
    });
    const pendingPurchase = await SeriesMembershipPurchase.findOne({
      seriesId: series._id.toString(),
      userId: req.user.sub,
      status: {
        $in: [PaymentStatus.CREATED, PaymentStatus.REQUIRES_ACTION]
      }
    }).sort({ createdAt: -1 });

    sendSuccess(res, {
      seriesId: series._id.toString(),
      membership: serializeSeriesMembership(membership),
      pendingPurchase: serializeSeriesMembershipPurchase(pendingPurchase)
    });
  })
);

router.post(
  '/series/:seriesId/memberships/checkout',
  authenticate(),
  asyncHandler(async (req, res) => {
    const series = await loadSeriesOrThrow(req.params.seriesId);
    const membershipSettings = normalizeSeriesMembershipSettings(series.membershipSettings);

    if (!membershipSettings.enabled) {
      throw new AppError('Memberships are disabled for this series', 409, 'series_membership_disabled');
    }
    if (!membershipSettings.allowSelfJoin && !canManageSeries(series, req.user)) {
      throw new AppError('This membership can only be granted by the organizer', 403, 'series_membership_invite_only');
    }

    const existingMembership = await SeriesMembership.findOne({
      seriesId: series._id.toString(),
      userId: req.user.sub,
      status: 'active'
    });
    if (existingMembership) {
      throw new AppError('Your series pass is already active', 409, 'series_membership_active');
    }

    const attendeeName =
      req.user.name?.trim?.() ||
      req.user.email?.split?.('@')?.[0] ||
      'Series member';
    const amount = Number(membershipSettings.price || 0);
    const currency = membershipSettings.currency || 'INR';

    if (amount > 0 && req.config.paymentProvider === 'stripe' && !req.config.stripeSecretKey) {
      throw new AppError(
        'Stripe is enabled but not configured. Add STRIPE_SECRET_KEY before taking series payments.',
        503,
        'stripe_not_configured'
      );
    }

    const purchase = await SeriesMembershipPurchase.create({
      seriesId: series._id.toString(),
      organizerId: series.organizerId,
      userId: req.user.sub,
      attendee: {
        name: attendeeName,
        email: req.user.email
      },
      provider: req.config.paymentProvider === 'stripe' && amount > 0 ? 'stripe' : 'manual',
      amount,
      currency,
      status: amount > 0 ? PaymentStatus.CREATED : PaymentStatus.SUCCEEDED,
      seriesSnapshot: {
        name: series.name,
        slug: series.slug,
        planName: membershipSettings.planName
      }
    });

    let paymentIntentMeta = null;
    let membership = null;
    if (amount > 0 && req.config.paymentProvider === 'stripe') {
      const intent = await createSeriesPaymentIntent({
        amount,
        currency,
        purchaseId: purchase._id,
        seriesId: series._id.toString(),
        userId: req.user.sub
      });

      purchase.providerPaymentId = intent.id;
      purchase.clientSecret = intent.client_secret;
      purchase.status = PaymentStatus.REQUIRES_ACTION;
      await purchase.save();

      paymentIntentMeta = {
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id
      };
    } else {
      const activation = await activateSeriesMembershipFromPurchase({
        req,
        purchase,
        providerPaymentId: purchase.providerPaymentId
      });
      membership = activation.membership;
    }

    sendSuccess(
      res,
      {
        purchase: serializeSeriesMembershipPurchase(purchase),
        membership: serializeSeriesMembership(membership),
        payment: buildSeriesPaymentResponse(purchase, paymentIntentMeta?.paymentIntentId ? 'requires_action' : null),
        paymentIntent: paymentIntentMeta
      },
      201
    );
  })
);

router.post(
  '/series/memberships/:purchaseId/confirm-payment',
  authenticate(),
  asyncHandler(async (req, res) => {
    const purchase = await SeriesMembershipPurchase.findById(req.params.purchaseId);
    if (!purchase) {
      throw new AppError('Membership purchase not found', 404, 'series_membership_purchase_not_found');
    }
    if (!canAccessPurchase(purchase, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    if (purchase.provider !== 'stripe') {
      throw new AppError('This membership purchase does not use Stripe payment', 409, 'payment_provider_invalid');
    }
    if (!purchase.providerPaymentId) {
      throw new AppError('Stripe payment intent not found', 409, 'payment_intent_missing');
    }
    if (req.body?.paymentIntentId && req.body.paymentIntentId !== purchase.providerPaymentId) {
      throw new AppError('Stripe payment intent mismatch', 409, 'payment_intent_mismatch');
    }

    if (purchase.status === PaymentStatus.SUCCEEDED && purchase.membershipId) {
      const membership = await SeriesMembership.findById(purchase.membershipId);
      return sendSuccess(res, {
        purchase: serializeSeriesMembershipPurchase(purchase),
        membership: serializeSeriesMembership(membership),
        payment: buildSeriesPaymentResponse(purchase, 'succeeded'),
        paymentIntent: {
          id: purchase.providerPaymentId,
          status: 'succeeded'
        },
        membershipActivated: true
      });
    }

    const intent = await retrieveSeriesPaymentIntent(purchase.providerPaymentId);
    syncSeriesPaymentStatusFromIntent(purchase, intent);
    purchase.providerPaymentId = intent.id;
    await purchase.save();

    if (intent.status === 'succeeded') {
      const activation = await activateSeriesMembershipFromPurchase({
        req,
        purchase,
        providerPaymentId: intent.id
      });

      return sendSuccess(res, {
        purchase: serializeSeriesMembershipPurchase(purchase),
        membership: serializeSeriesMembership(activation.membership),
        payment: buildSeriesPaymentResponse(purchase, intent.status),
        paymentIntent: {
          id: intent.id,
          status: intent.status
        },
        membershipActivated: true
      });
    }

    if (intent.status === 'processing') {
      return sendSuccess(
        res,
        {
          purchase: serializeSeriesMembershipPurchase(purchase),
          membership: null,
          payment: buildSeriesPaymentResponse(purchase, intent.status),
          paymentIntent: {
            id: intent.id,
            status: intent.status
          },
          membershipActivated: false,
          message:
            'Stripe is still processing this payment. Your series pass will unlock once payment confirmation arrives.'
        },
        202
      );
    }

    throw new AppError(
      intent.last_payment_error?.message || 'Stripe payment has not completed yet',
      409,
      purchase.status === PaymentStatus.FAILED ? 'payment_failed' : 'payment_incomplete'
    );
  })
);

router.post(
  '/series/:seriesId/memberships/join',
  authenticate(),
  asyncHandler(async (req, res) => {
    const series = await loadSeriesOrThrow(req.params.seriesId);
    const membershipSettings = normalizeSeriesMembershipSettings(series.membershipSettings);

    if (!membershipSettings.enabled) {
      throw new AppError('Memberships are disabled for this series', 409, 'series_membership_disabled');
    }
    if (!membershipSettings.allowSelfJoin && !canManageSeries(series, req.user)) {
      throw new AppError('This membership can only be granted by the organizer', 403, 'series_membership_invite_only');
    }
    if (Number(membershipSettings.price || 0) > 0) {
      throw new AppError(
        'This series pass requires checkout before activation',
        409,
        'series_membership_checkout_required'
      );
    }

    const existingMembership = await SeriesMembership.findOne({
      seriesId: series._id.toString(),
      userId: req.user.sub
    });

    const attendeeName =
      req.user.name?.trim?.() ||
      req.user.email?.split?.('@')?.[0] ||
      'Series member';

    if (existingMembership) {
      if (existingMembership.status === 'active') {
        return sendSuccess(res, serializeSeriesMembership(existingMembership));
      }

      existingMembership.status = 'active';
      existingMembership.attendee = {
        name: attendeeName,
        email: req.user.email
      };
      existingMembership.perks = buildSeriesMembershipPerksSnapshot(series);
      existingMembership.lastUsedAt = new Date();
      if (!existingMembership.joinedAt) {
        existingMembership.joinedAt = new Date();
      }
      await existingMembership.save();
      await req.eventBus.publish(DomainEvents.SERIES_MEMBERSHIP_ACTIVATED, {
        membershipId: existingMembership._id.toString(),
        seriesId: series._id.toString(),
        seriesName: series.name,
        seriesSlug: series.slug,
        organizerId: series.organizerId,
        userId: existingMembership.userId,
        attendeeEmail: existingMembership.attendee?.email || '',
        attendeeName: existingMembership.attendee?.name || '',
        planName: existingMembership.perks?.planName || membershipSettings.planName,
        amount: Number(membershipSettings.price || 0),
        currency: membershipSettings.currency || 'INR'
      });
      return sendSuccess(res, serializeSeriesMembership(existingMembership));
    }

    const membership = await SeriesMembership.create({
      seriesId: series._id.toString(),
      organizerId: series.organizerId,
      userId: req.user.sub,
      attendee: {
        name: attendeeName,
        email: req.user.email
      },
      source: canManageSeries(series, req.user) && !membershipSettings.allowSelfJoin ? 'organizer_grant' : 'self_join',
      lastUsedAt: new Date(),
      perks: buildSeriesMembershipPerksSnapshot(series)
    });

    await req.eventBus.publish(DomainEvents.SERIES_MEMBERSHIP_ACTIVATED, {
      membershipId: membership._id.toString(),
      seriesId: series._id.toString(),
      seriesName: series.name,
      seriesSlug: series.slug,
      organizerId: series.organizerId,
      userId: membership.userId,
      attendeeEmail: membership.attendee?.email || '',
      attendeeName: membership.attendee?.name || '',
      planName: membership.perks?.planName || membershipSettings.planName,
      amount: Number(membershipSettings.price || 0),
      currency: membershipSettings.currency || 'INR'
    });

    sendSuccess(res, serializeSeriesMembership(membership), 201);
  })
);

router.get(
  '/series/:seriesId',
  asyncHandler(async (req, res) => {
    const viewer = decodeOptionalToken(req);
    const series = await loadSeriesOrThrow(req.params.seriesId);
    const canManage = canManageSeries(series, viewer);
    const eventFilter = canManage
      ? { 'series.seriesId': series._id.toString() }
      : {
          'series.seriesId': series._id.toString(),
          status: 'published',
          visibility: 'public'
        };
    const events = await Event.find(eventFilter).sort({ startsAt: 1 });
    const membership = viewer
      ? await SeriesMembership.findOne({
          seriesId: series._id.toString(),
          userId: viewer.sub,
          status: 'active'
        })
      : null;

    sendSuccess(res, {
      series: {
        ...serializeSeries(series),
        stats: {
          totalEvents: events.length,
          upcomingEvents: events.filter((event) => new Date(event.startsAt).getTime() > Date.now()).length,
          activeMembers: await SeriesMembership.countDocuments({
            seriesId: series._id.toString(),
            status: 'active'
          })
        },
        viewerMembership: serializeSeriesMembership(membership),
        canJoinMembership:
          Boolean(viewer) &&
          !membership &&
          normalizeSeriesMembershipSettings(series.membershipSettings).enabled &&
          normalizeSeriesMembershipSettings(series.membershipSettings).allowSelfJoin
      },
      events: serializeSeriesEventsForViewer(events, viewer, req.config.appOrigin)
    });
  })
);

module.exports = router;
