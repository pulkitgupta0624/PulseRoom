const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  authorize,
  decodeOptionalToken,
  sendSuccess,
  validateSchema,
  DomainEvents,
  BookingStatus,
  PaymentStatus,
  Roles
} = require('@pulseroom/common');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const WaitlistEntry = require('../models/WaitlistEntry');
const config = require('../config');
const {
  checkoutSchema,
  quoteSchema,
  confirmPaymentSchema,
  joinWaitlistSchema,
  checkInSchema,
  agendaSessionUpdateSchema
} = require('../validators/bookingSchemas');
const {
  buildInvoiceNumber,
  buildInvoicePdf
} = require('../services/invoiceService');
const {
  createPaymentIntent,
  createRefund,
  retrievePaymentIntent,
  constructWebhookEvent
} = require('../services/paymentService');
const { buildTicketToken, serializeBooking } = require('../services/ticketService');
const { assertTicketTierAccessible } = require('../services/ticketAccessService');
const { buildBookingAnalytics, clampWindowDays } = require('../services/analyticsService');
const { buildReferralAnalytics } = require('../services/referralAnalyticsService');
const {
  buildEventBookingsCsv,
  buildOrganizerGrowthDashboard
} = require('../services/organizerGrowthService');
const { buildAgendaState, stripAgendaSessionForStorage } = require('../services/agendaService');
const {
  roundCurrencyAmount,
  resolveSettlementCurrency,
  calculatePricingBreakdown
} = require('../services/pricingService');
const {
  serializeWaitlistEntry,
  getCommittedQuantity,
  findActiveWaitlistEntry
} = require('../services/waitlistService');

const router = express.Router();

const calculateReferralDiscountAmount = ({ subtotal, referral }) => {
  const safeSubtotal = Number(subtotal || 0);
  if (!safeSubtotal || !referral?.code) {
    return 0;
  }

  if (referral.discountType === 'fixed') {
    return Number(Math.min(safeSubtotal, referral.discountValue || 0).toFixed(2));
  }

  return Number(Math.min(safeSubtotal, safeSubtotal * ((referral.discountValue || 0) / 100)).toFixed(2));
};

const releasePromoReservationIfNeeded = async ({ booking, req }) => {
  if (!booking?.promoCode?.promoCodeId || booking?.promoCode?.releasedAt) {
    return false;
  }

  const released = await req.automationService.releasePromoReservationForBooking(booking);
  if (released) {
    await booking.save();
  }

  return released;
};

const buildPricingContext = async ({
  req,
  event,
  tier,
  quantity,
  requestedCurrency,
  discountBaseAmount = 0
}) => {
  const currencySelection = resolveSettlementCurrency({
    event,
    tier,
    requestedCurrency
  });

  if (!currencySelection.isAccepted) {
    throw new AppError(
      'This event does not accept the selected currency',
      409,
      'currency_not_supported'
    );
  }

  const taxRule = await req.services.taxRuleService.findByCountry(event.country);
  const pricing = await calculatePricingBreakdown({
    quantity,
    subtotalBaseAmount: roundCurrencyAmount(Number(tier.price || 0) * Number(quantity || 0)),
    discountBaseAmount,
    baseCurrency: tier.currency || currencySelection.settlementCurrency,
    settlementCurrency: currencySelection.settlementCurrency,
    taxRule,
    taxRegistrationNumber: event.taxRegistrationNumber,
    exchangeRateService: req.services.exchangeRateService,
    reportingCurrency: req.config.reportingCurrency
  });

  return {
    acceptedCurrencies: currencySelection.acceptedCurrencies,
    pricing
  };
};

const buildReferralPreview = async ({ event, referralCode, viewerUserId, subtotal }) => {
  const normalizedReferralCode = referralCode?.trim();
  if (
    !normalizedReferralCode ||
    event?.referral?.code !== normalizedReferralCode ||
    event?.referral?.status !== 'active' ||
    viewerUserId === event?.organizerId
  ) {
    return {
      applied: false,
      discountBaseAmount: 0
    };
  }

  if (viewerUserId) {
    const isEligible = !(await Booking.exists({
      userId: viewerUserId,
      status: BookingStatus.CONFIRMED
    }));
    if (!isEligible) {
      return {
        applied: false,
        discountBaseAmount: 0
      };
    }
  }

  return {
    applied: true,
    code: event.referral.code,
    discountBaseAmount: calculateReferralDiscountAmount({
      subtotal,
      referral: event.referral
    })
  };
};

const canAccessBooking = (booking, user) =>
  Boolean(
    booking &&
      user &&
      (booking.userId === user.sub ||
        booking.eventSnapshot?.organizerId === user.sub ||
        user.role === Roles.ADMIN)
  );

const getReportingAmount = (booking) =>
  Number(booking?.pricing?.reportingAmount ?? booking?.amount ?? 0);

const buildPaymentResponse = (payment, paymentIntentStatus = null) => ({
  id: payment._id,
  status: payment.status,
  provider: payment.provider,
  clientSecret: payment.clientSecret,
  paymentIntentId: payment.providerPaymentId,
  paymentIntentStatus
});

const syncPaymentStatusFromIntent = (payment, intent) => {
  if (intent.status === 'succeeded') {
    payment.status = PaymentStatus.SUCCEEDED;
    return;
  }

  if (intent.status === 'requires_payment_method' || intent.status === 'canceled') {
    payment.status = PaymentStatus.FAILED;
    return;
  }

  payment.status = PaymentStatus.REQUIRES_ACTION;
};

const finalizeSuccessfulPayment = async ({ booking, payment, req, providerPaymentId }) => {
  if (
    booking.status === BookingStatus.CONFIRMED &&
    payment.status === PaymentStatus.SUCCEEDED &&
    booking.qrCodeToken
  ) {
    return booking;
  }

  booking.status = BookingStatus.CONFIRMED;
  booking.confirmedAt = booking.confirmedAt || new Date();
  booking.qrCodeToken = booking.qrCodeToken || buildTicketToken();
  booking.invoice = {
    invoiceNumber: booking.invoice?.invoiceNumber || buildInvoiceNumber(),
    issuedAt: new Date()
  };
  await booking.save();

  payment.status = PaymentStatus.SUCCEEDED;
  if (providerPaymentId) {
    payment.providerPaymentId = providerPaymentId;
  }
  await payment.save();

  await req.eventBus.publish(DomainEvents.PAYMENT_SUCCEEDED, {
    paymentId: payment._id.toString(),
    bookingId: booking._id.toString(),
    eventId: booking.eventId,
    amount: booking.amount
  });

  await req.eventBus.publish(DomainEvents.BOOKING_CONFIRMED, {
    bookingId: booking._id.toString(),
    eventId: booking.eventId,
    tierId: booking.tierId,
    userId: booking.userId,
    quantity: booking.quantity,
    amount: booking.amount,
    reportingAmount: getReportingAmount(booking),
    eventTitle: booking.eventSnapshot.title,
    eventStartsAt: booking.eventSnapshot.startsAt,
    confirmedAt: booking.confirmedAt,
    attendeeEmail: booking.attendee.email,
    attendeeName: booking.attendee.name,
    organizerId: booking.eventSnapshot.organizerId
  });

  if (booking.sourceWaitlistEntryId) {
    await req.automationService.markWaitlistEntryFulfilled({
      waitlistEntryId: booking.sourceWaitlistEntryId,
      bookingId: booking._id
    });
  }

  return booking;
};

const getOrganizerEvents = async (req) => {
  const response = await req.clients.eventService.get('/api/events/organizer/dashboard', {
    headers: {
      Authorization: req.headers.authorization
    }
  });

  return response.data.data.events;
};

const loadUserLocations = async (req, userIds = []) => {
  const uniqueUserIds = [...new Set(userIds.map((userId) => String(userId || '').trim()).filter(Boolean))];
  if (!uniqueUserIds.length) {
    return [];
  }

  try {
    const response = await req.clients.userService.post('/api/users/internal/profiles/locations', {
      userIds: uniqueUserIds
    });
    return response.data.data || [];
  } catch (_error) {
    return [];
  }
};

const buildCsvFileName = (title = 'event') => {
  const slug = String(title || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return `${slug || 'event'}-bookings.csv`;
};

const assertInternalService = (req, allowedServices = []) => {
  if (!allowedServices.includes(req.headers['x-service-name'])) {
    throw new AppError('Forbidden', 403, 'forbidden');
  }
};

const assertInternalEventService = (req) => {
  assertInternalService(req, ['event-service']);
};

const loadEventMeta = async (req, eventId) => {
  try {
    const response = await req.clients.eventService.get(`/api/events/${eventId}/internal-meta`);
    return response.data.data;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    throw new AppError('Unable to load event schedule right now', 502, 'event_lookup_failed');
  }
};

const loadViewableEventMeta = async (req, eventId) => {
  try {
    const response = await req.clients.eventService.get(`/api/events/${eventId}`, {
      headers: {
        Authorization: req.headers.authorization
      }
    });
    const event = response.data.data;

    return {
      title: event.title,
      venueName: event.venueName || '',
      timezone: event.timezone || 'Asia/Calcutta',
      sessions: event.sessions || []
    };
  } catch (error) {
    if (error.response?.status === 404) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }
    if (error.response?.status === 403) {
      throw new AppError('Event not available', 403, 'event_not_available');
    }

    throw new AppError('Unable to load event schedule right now', 502, 'event_lookup_failed');
  }
};

const loadConfirmedAgendaBooking = async ({ eventId, userId }) =>
  Booking.findOne({
    eventId,
    userId,
    status: BookingStatus.CONFIRMED
  }).sort({ confirmedAt: -1, createdAt: -1 });

const applyAgendaSync = async ({ booking, eventMeta }) => {
  if (!booking) {
    return {
      canPersonalize: false,
      bookingId: null,
      sessions: buildAgendaState({
        eventSessions: eventMeta.sessions || [],
        savedSessions: []
      }).scheduleSessions,
      savedSessions: [],
      summary: {
        savedCount: 0,
        scheduledCount: 0,
        totalMinutes: 0,
        roomCount: 0,
        conflictCount: 0,
        staleSessions: 0
      },
      updatedAt: null
    };
  }

  const agendaState = buildAgendaState({
    eventSessions: eventMeta.sessions || [],
    savedSessions: booking.savedAgenda?.sessions || []
  });
  const nextStoredSessions = agendaState.storedSessions.map(stripAgendaSessionForStorage);
  const previousStoredSessions = (booking.savedAgenda?.sessions || []).map(stripAgendaSessionForStorage);

  if (JSON.stringify(previousStoredSessions) !== JSON.stringify(nextStoredSessions)) {
    booking.savedAgenda = {
      sessions: nextStoredSessions,
      updatedAt: new Date()
    };
    await booking.save();
  }

  return {
    canPersonalize: true,
    bookingId: booking._id.toString(),
    sessions: agendaState.scheduleSessions,
    savedSessions: agendaState.savedSessions,
    summary: agendaState.summary,
    updatedAt: booking.savedAgenda?.updatedAt || booking.updatedAt || null
  };
};

router.post(
  '/webhooks/stripe',
  asyncHandler(async (req, res) => {
    if (config.paymentProvider !== 'stripe') {
      return sendSuccess(res, { ignored: true });
    }

    const signature = req.headers['stripe-signature'];
    const event = constructWebhookEvent(req.rawBody, signature);

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const payment = await Payment.findOne({ providerPaymentId: intent.id });
      if (payment) {
        const booking = await Booking.findById(payment.bookingId);
        if (booking) {
          await finalizeSuccessfulPayment({
            booking,
            payment,
            req,
            providerPaymentId: intent.id
          });
        }
      }
    }

    res.status(200).json({ received: true });
  })
);

router.post(
  '/quote',
  validateSchema(quoteSchema),
  asyncHandler(async (req, res) => {
    const eventResponse = await req.clients.eventService.get(`/api/events/${req.body.eventId}`);
    const event = eventResponse.data.data;
    const tier = event.ticketTiers.find((item) => item.tierId === req.body.tierId);
    if (!tier) {
      throw new AppError('Ticket tier not found', 404, 'tier_not_found');
    }

    const subtotal = roundCurrencyAmount(Number(tier.price || 0) * Number(req.body.quantity || 0));
    const viewer = decodeOptionalToken(req);
    const referralPreview = req.body.promoCode
      ? {
          applied: false,
          discountBaseAmount: 0
        }
      : await buildReferralPreview({
          event,
          referralCode: req.body.referralCode,
          viewerUserId: viewer?.sub,
          subtotal
        });

    const { acceptedCurrencies, pricing } = await buildPricingContext({
      req,
      event,
      tier,
      quantity: req.body.quantity,
      requestedCurrency: req.body.currency,
      discountBaseAmount: referralPreview.discountBaseAmount
    });

    sendSuccess(res, {
      pricing,
      acceptedCurrencies,
      referral: referralPreview.applied
        ? {
            code: referralPreview.code,
            discountAmount: pricing.discountAmount
          }
        : null
    });
  })
);

router.get(
  '/analytics/organizer',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const events = await getOrganizerEvents(req);
    const eventIds = events.map((event) => event._id);

    if (!eventIds.length) {
      return sendSuccess(
        res,
        {
          ...buildBookingAnalytics({
            bookings: [],
            days: clampWindowDays(req.query.days)
          }),
          currency: req.config.reportingCurrency
        }
      );
    }

    const bookings = await Booking.find({
      status: BookingStatus.CONFIRMED,
      eventId: { $in: eventIds }
    })
      .select('eventId eventSnapshot amount quantity confirmedAt createdAt checkedInAt pricing')
      .lean();

    sendSuccess(res, {
      ...buildBookingAnalytics({ bookings, days: req.query.days }),
      currency: req.config.reportingCurrency
    });
  })
);

router.get(
  '/analytics/organizer/growth',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const events = await getOrganizerEvents(req);
    const eventIds = events.map((event) => event._id);

    if (!eventIds.length) {
      return sendSuccess(
        res,
        buildOrganizerGrowthDashboard({
          events: [],
          bookings: [],
          userLocations: [],
          reportingCurrency: req.config.reportingCurrency
        })
      );
    }

    const bookings = await Booking.find({
      eventId: { $in: eventIds }
    })
      .select(
        'bookingNumber userId eventId tierId tierName quantity amount currency status attendee promoCode referral invoice createdAt confirmedAt checkedInAt cancelledAt refundedAt eventSnapshot pricing'
      )
      .lean();

    const userLocations = await loadUserLocations(
      req,
      bookings.map((booking) => booking.userId)
    );

    sendSuccess(
      res,
      buildOrganizerGrowthDashboard({
        events,
        bookings,
        userLocations,
        reportingCurrency: req.config.reportingCurrency
      })
    );
  })
);

router.get(
  '/analytics/referrals/organizer',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const events = await getOrganizerEvents(req);
    const eventIds = events.map((event) => event._id.toString());

    if (!eventIds.length) {
      return sendSuccess(
        res,
        {
          ...buildReferralAnalytics({
            bookings: [],
            events: [],
            days: req.query.days
          }),
          currency: req.config.reportingCurrency
        }
      );
    }

    const bookings = await Booking.find({
      status: BookingStatus.CONFIRMED,
      eventId: { $in: eventIds },
      'referral.code': { $exists: true, $ne: null }
    })
      .select('eventId eventSnapshot amount quantity confirmedAt createdAt referral pricing')
      .lean();

    sendSuccess(
      res,
      {
        ...buildReferralAnalytics({
          bookings,
          events,
          days: req.query.days
        }),
        currency: req.config.reportingCurrency
      }
    );
  })
);

router.get(
  '/analytics/admin',
  authenticate(),
  authorize(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const bookings = await Booking.find({
      status: BookingStatus.CONFIRMED
    })
      .select('eventId eventSnapshot amount quantity confirmedAt createdAt checkedInAt pricing')
      .lean();

    sendSuccess(res, {
      ...buildBookingAnalytics({ bookings, days: req.query.days }),
      currency: req.config.reportingCurrency
    });
  })
);

router.get(
  '/capacity/:eventId',
  asyncHandler(async (req, res) => {
    const eventResponse = await req.clients.eventService.get(
      `/api/events/${req.params.eventId}`
    );
    const tiers = eventResponse.data.data.ticketTiers || [];
 
    const capacityData = await Promise.all(
      tiers.map(async (tier) => {
        const reserved = await getCommittedQuantity(req.params.eventId, tier.tierId);
        return {
          tierId: tier.tierId,
          name: tier.name,
          total: tier.quantity,
          reserved,
          remaining: Math.max(0, tier.quantity - reserved)
        };
      })
    );
 
    sendSuccess(res, capacityData);
  })
);

router.get(
  '/internal/events/:eventId/review-eligibility',
  asyncHandler(async (req, res) => {
    assertInternalEventService(req);

    const userId = String(req.query.userId || '').trim();
    if (!userId) {
      throw new AppError('userId is required', 400, 'review_eligibility_invalid');
    }

    const booking = await Booking.findOne({
      eventId: req.params.eventId,
      userId,
      status: BookingStatus.CONFIRMED
    })
      .sort({ confirmedAt: -1, createdAt: -1 })
      .lean();

    sendSuccess(res, {
      eligible: Boolean(booking),
      booking: booking
        ? {
            bookingId: booking._id.toString(),
            attendee: booking.attendee || {},
            confirmedAt: booking.confirmedAt || null,
            checkedInAt: booking.checkedInAt || null,
            ticketTierName: booking.tierName || ''
          }
        : null
    });
  })
);

router.get(
  '/internal/events/:eventId/replay-access',
  asyncHandler(async (req, res) => {
    assertInternalService(req, ['live-service']);

    const userId = String(req.query.userId || '').trim();
    if (!userId) {
      throw new AppError('userId is required', 400, 'replay_access_invalid');
    }

    const booking = await Booking.findOne({
      eventId: req.params.eventId,
      userId,
      status: BookingStatus.CONFIRMED
    })
      .sort({ confirmedAt: -1, createdAt: -1 })
      .lean();

    sendSuccess(res, {
      allowed: Boolean(booking),
      booking: booking
        ? {
            bookingId: booking._id.toString(),
            tierName: booking.tierName || '',
            attendee: booking.attendee || {},
            confirmedAt: booking.confirmedAt || null
          }
        : null
    });
  })
);

router.get(
  '/waitlist/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    const { eventId, tierId } = req.query;
    if (!eventId || !tierId) {
      throw new AppError('eventId and tierId are required', 400, 'waitlist_lookup_invalid');
    }

    const entry = await req.automationService.getMyWaitlistEntry({
      userId: req.user.sub,
      eventId,
      tierId
    });

    sendSuccess(res, entry ? serializeWaitlistEntry(entry) : null);
  })
);

router.get(
  '/waitlist/offers/:offerToken',
  authenticate(),
  asyncHandler(async (req, res) => {
    const entry = await req.automationService.getOfferForUser({
      offerToken: req.params.offerToken,
      userId: req.user.sub,
      eventId: req.query.eventId,
      tierId: req.query.tierId
    });

    if (!entry) {
      throw new AppError('Waitlist offer is no longer available', 410, 'waitlist_offer_unavailable');
    }

    sendSuccess(res, serializeWaitlistEntry(entry));
  })
);

router.post(
  '/waitlist',
  authenticate(),
  validateSchema(joinWaitlistSchema),
  asyncHandler(async (req, res) => {
    const eventResponse = await req.clients.eventService.get(`/api/events/${req.body.eventId}`);
    const event = eventResponse.data.data;

    if (event.status !== 'published') {
      throw new AppError('Waitlist opens once the event is published', 409, 'waitlist_not_open');
    }

    const tier = event.ticketTiers.find((item) => item.tierId === req.body.tierId);
    if (!tier) {
      throw new AppError('Ticket tier not found', 404, 'tier_not_found');
    }

    const committedQuantity = await getCommittedQuantity(req.body.eventId, req.body.tierId);
    if (committedQuantity + req.body.quantity <= tier.quantity) {
      throw new AppError('Tickets are still available for direct booking', 409, 'tier_still_available');
    }

    const existingEntry = await findActiveWaitlistEntry({
      eventId: req.body.eventId,
      tierId: req.body.tierId,
      userId: req.user.sub
    });
    if (existingEntry) {
      throw new AppError('You already have an active waitlist entry for this tier', 409, 'waitlist_exists');
    }

    const entry = await WaitlistEntry.create({
      eventId: req.body.eventId,
      tierId: req.body.tierId,
      userId: req.user.sub,
      quantity: req.body.quantity,
      attendee: req.body.attendee,
      eventSnapshot: {
        title: event.title,
        startsAt: event.startsAt,
        organizerId: event.organizerId,
        tierName: tier.name,
        currency: tier.currency || 'INR'
      }
    });

    await req.eventBus.publish(DomainEvents.WAITLIST_JOINED, {
      waitlistEntryId: entry._id.toString(),
      eventId: entry.eventId,
      tierId: entry.tierId,
      userId: entry.userId,
      quantity: entry.quantity,
      attendeeEmail: entry.attendee.email,
      attendeeName: entry.attendee.name,
      eventTitle: entry.eventSnapshot.title,
      tierName: entry.eventSnapshot.tierName
    });

    sendSuccess(res, serializeWaitlistEntry(entry), 201);
  })
);

router.post(
  '/checkout',
  authenticate(),
  validateSchema(checkoutSchema),
  asyncHandler(async (req, res) => {
    const eventResponse = await req.clients.eventService.get(`/api/events/${req.body.eventId}`);
    const event = eventResponse.data.data;

    if (event.status !== 'published') {
      throw new AppError('Event is not open for bookings', 409, 'event_unavailable');
    }

    const tier = event.ticketTiers.find((item) => item.tierId === req.body.tierId);
    if (!tier) {
      throw new AppError('Ticket tier not found', 404, 'tier_not_found');
    }

    const saleStart = tier.saleStart ? new Date(tier.saleStart) : null;
    let gamificationEntitlements = null;
    if (saleStart && saleStart.getTime() > Date.now()) {
      try {
        const response = await req.clients.gamificationService.get(
          `/api/gamification/internal/users/${req.user.sub}/entitlements`
        );
        gamificationEntitlements = response.data.data;
      } catch (_error) {
        throw new AppError(
          'Unable to verify early-access eligibility right now',
          502,
          'gamification_unavailable'
        );
      }
    }

    assertTicketTierAccessible({
      tier,
      entitlements: gamificationEntitlements,
      now: new Date()
    });

    const normalizedReferralCode = req.body.referralCode?.trim();
    const normalizedPromoCode = req.body.promoCode?.trim();
    if (normalizedReferralCode && normalizedPromoCode) {
      throw new AppError(
        'Promo codes cannot be combined with referral discounts on the same booking.',
        409,
        'discounts_cannot_stack'
      );
    }
    const referralCode =
      normalizedReferralCode &&
      event.referral?.code === normalizedReferralCode &&
      event.referral?.status === 'active' &&
      req.user.sub !== event.organizerId
        ? event.referral.code
        : null;

    let waitlistOffer = null;
    let quantity = req.body.quantity;
    let attendee = req.body.attendee;

    if (req.body.waitlistOfferToken) {
      waitlistOffer = await req.automationService.getOfferForUser({
        offerToken: req.body.waitlistOfferToken,
        userId: req.user.sub,
        eventId: req.body.eventId,
        tierId: req.body.tierId
      });

      if (!waitlistOffer) {
        throw new AppError('Waitlist offer is no longer available', 410, 'waitlist_offer_unavailable');
      }

      quantity = waitlistOffer.quantity;
      attendee = waitlistOffer.attendee;
    }

    const committedQuantity = await getCommittedQuantity(req.body.eventId, req.body.tierId);
    const effectiveCommittedQuantity = waitlistOffer
      ? Math.max(0, committedQuantity - waitlistOffer.quantity)
      : committedQuantity;
    if (effectiveCommittedQuantity + quantity > tier.quantity) {
      throw new AppError('Selected tier is sold out', 409, 'tier_sold_out');
    }

    const subtotal = roundCurrencyAmount(Number(tier.price || 0) * Number(quantity || 0));
    let promoCodeQuote = null;
    if (normalizedPromoCode) {
      try {
        const promoResponse = await req.clients.eventService.post(`/api/events/${req.body.eventId}/promo-codes/preview`, {
          code: normalizedPromoCode,
          tierId: tier.tierId,
          subtotal
        });
        promoCodeQuote = promoResponse.data.data;
      } catch (error) {
        throw new AppError(
          error.response?.data?.message || 'This promo code is no longer valid',
          error.response?.status || 409,
          error.response?.data?.code || 'promo_code_invalid'
        );
      }
    }
    const isEligibleForReferralDiscount = referralCode
      ? !(await Booking.exists({
          userId: req.user.sub,
          status: BookingStatus.CONFIRMED
        }))
      : false;

    if (normalizedReferralCode && !referralCode) {
      throw new AppError('This referral discount link is no longer active', 409, 'referral_inactive');
    }

    if (referralCode && !isEligibleForReferralDiscount) {
      throw new AppError(
        'Referral discounts are only available on a user’s first confirmed PulseRoom booking',
        409,
        'referral_not_eligible'
      );
    }

    const discountBaseAmount = referralCode
      ? calculateReferralDiscountAmount({
          subtotal,
          referral: event.referral
        })
      : promoCodeQuote
        ? Number(promoCodeQuote.discountAmount || 0)
      : 0;
    const { acceptedCurrencies, pricing } = await buildPricingContext({
      req,
      event,
      tier,
      quantity,
      requestedCurrency: req.body.currency,
      discountBaseAmount
    });
    const amount = pricing.total;

    if (config.paymentProvider === 'stripe' && amount > 0 && !config.stripeSecretKey) {
      throw new AppError(
        'Stripe is enabled but not configured. Add STRIPE_SECRET_KEY before taking payments.',
        503,
        'stripe_not_configured'
      );
    }

    if (referralCode) {
      try {
        await req.clients.eventService.post(`/api/events/${req.body.eventId}/referral/consume`, {
          code: referralCode,
          redeemedByUserId: req.user.sub,
          discountAmount: discountBaseAmount
        });
      } catch (error) {
        throw new AppError(
          error.response?.data?.message || 'This referral discount link is no longer active',
          error.response?.status || 409,
          error.response?.data?.code || 'referral_inactive'
        );
      }
    }

    const booking = await Booking.create({
      bookingNumber: `BK-${Date.now()}`,
      userId: req.user.sub,
      eventId: event._id,
      tierId: tier.tierId,
      tierName: tier.name,
      quantity,
      amount,
      currency: pricing.settlementCurrency,
      pricing,
      attendee,
      ...(referralCode
        ? {
            referral: {
              code: referralCode,
              referrerUserId: event.organizerId,
              discountType: event.referral.discountType,
              discountValue: event.referral.discountValue,
              originalAmount: pricing.subtotal,
              discountAmount: pricing.discountAmount,
              finalAmount: pricing.total,
              baseOriginalAmount: pricing.baseSubtotal,
              baseDiscountAmount: pricing.baseDiscountAmount,
              reportingDiscountAmount: pricing.reportingDiscountAmount,
              trackedAt: new Date()
            }
          }
        : {}),
      ...(promoCodeQuote
        ? {
            promoCode: {
              promoCodeId: promoCodeQuote.promoCodeId,
              code: promoCodeQuote.code,
              discountType: promoCodeQuote.discountType,
              discountValue: promoCodeQuote.discountValue,
              originalAmount: pricing.subtotal,
              discountAmount: pricing.discountAmount,
              finalAmount: pricing.total,
              baseOriginalAmount: pricing.baseSubtotal,
              baseDiscountAmount: pricing.baseDiscountAmount,
              reportingDiscountAmount: pricing.reportingDiscountAmount,
              reservedAt: new Date()
            }
          }
        : {}),
      reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      eventSnapshot: {
        title: event.title,
        startsAt: event.startsAt,
        organizerId: event.organizerId
      },
      sourceWaitlistEntryId: waitlistOffer?._id
    });

    if (promoCodeQuote) {
      try {
        await req.clients.eventService.post(`/api/events/${req.body.eventId}/promo-codes/consume`, {
          promoCodeId: promoCodeQuote.promoCodeId,
          code: promoCodeQuote.code,
          tierId: tier.tierId,
          discountAmount: discountBaseAmount,
          redeemedByUserId: req.user.sub,
          bookingId: booking._id.toString()
        });
      } catch (error) {
        await booking.deleteOne();
        throw new AppError(
          error.response?.data?.message || 'This promo code has reached its usage cap',
          error.response?.status || 409,
          error.response?.data?.code || 'promo_code_invalid'
        );
      }
    }

    await req.automationService.scheduleBookingExpiration(booking);

    const payment = await Payment.create({
      bookingId: booking._id,
      userId: req.user.sub,
      eventId: event._id,
      amount,
      currency: pricing.settlementCurrency,
      provider: config.paymentProvider === 'stripe' && amount > 0 ? 'stripe' : 'manual',
      status: amount === 0 ? PaymentStatus.SUCCEEDED : PaymentStatus.CREATED
    });

    booking.paymentId = payment._id;
    await booking.save();

    if (waitlistOffer) {
      await req.automationService.markWaitlistEntryClaimed({
        entry: waitlistOffer,
        bookingId: booking._id
      });
    }

    await req.eventBus.publish(DomainEvents.BOOKING_CREATED, {
      bookingId: booking._id.toString(),
      eventId: event._id,
      userId: req.user.sub,
      quantity: booking.quantity,
      tierId: booking.tierId
    });

    await req.eventBus.publish(DomainEvents.PAYMENT_CREATED, {
      paymentId: payment._id.toString(),
      bookingId: booking._id.toString(),
      eventId: event._id,
      amount
    });

    let paymentIntentMeta = null;
    if (amount > 0 && config.paymentProvider === 'stripe') {
      const intent = await createPaymentIntent({
        amount,
        currency: payment.currency,
        bookingId: booking._id,
        eventId: event._id,
        tierId: tier.tierId
      });

      payment.providerPaymentId = intent.id;
      payment.clientSecret = intent.client_secret;
      payment.status = PaymentStatus.REQUIRES_ACTION;
      await payment.save();

      paymentIntentMeta = {
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id
      };
    } else {
      await finalizeSuccessfulPayment({
        booking,
        payment,
        req,
        providerPaymentId: payment.providerPaymentId
      });
    }

    sendSuccess(
      res,
      {
        booking: serializeBooking(booking),
        payment: buildPaymentResponse(payment, paymentIntentMeta?.paymentIntentId ? 'requires_action' : null),
        paymentIntent: paymentIntentMeta
      },
      201
    );
  })
);

router.post(
  '/:bookingId/confirm-payment',
  authenticate(),
  validateSchema(confirmPaymentSchema),
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'booking_not_found');
    }

    if (!canAccessBooking(booking, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    const payment = await Payment.findById(booking.paymentId);
    if (!payment) {
      throw new AppError('Payment not found', 404, 'payment_not_found');
    }

    if (payment.provider !== 'stripe') {
      throw new AppError('This booking does not use Stripe payment', 409, 'payment_provider_invalid');
    }

    if (!payment.providerPaymentId) {
      throw new AppError('Stripe payment intent not found', 409, 'payment_intent_missing');
    }

    if (req.body.paymentIntentId && req.body.paymentIntentId !== payment.providerPaymentId) {
      throw new AppError('Stripe payment intent mismatch', 409, 'payment_intent_mismatch');
    }

    if (
      booking.status === BookingStatus.CONFIRMED &&
      payment.status === PaymentStatus.SUCCEEDED
    ) {
      return sendSuccess(res, {
        booking: serializeBooking(booking),
        payment: buildPaymentResponse(payment, 'succeeded'),
        paymentIntent: {
          id: payment.providerPaymentId,
          status: 'succeeded'
        },
        bookingConfirmed: true
      });
    }

    const intent = await retrievePaymentIntent(payment.providerPaymentId);
    syncPaymentStatusFromIntent(payment, intent);
    payment.providerPaymentId = intent.id;
    await payment.save();

    if (intent.status === 'succeeded') {
      await finalizeSuccessfulPayment({
        booking,
        payment,
        req,
        providerPaymentId: intent.id
      });

      return sendSuccess(res, {
        booking: serializeBooking(booking),
        payment: buildPaymentResponse(payment, intent.status),
        paymentIntent: {
          id: intent.id,
          status: intent.status
        },
        bookingConfirmed: true
      });
    }

    if (intent.status === 'processing') {
      return sendSuccess(
        res,
        {
          booking: serializeBooking(booking),
          payment: buildPaymentResponse(payment, intent.status),
          paymentIntent: {
            id: intent.id,
            status: intent.status
          },
          bookingConfirmed: false,
          message:
            'Stripe is still processing this payment. Your ticket will appear once the webhook confirms it.'
        },
        202
      );
    }

    throw new AppError(
      intent.last_payment_error?.message || 'Stripe payment has not completed yet',
      409,
      payment.status === PaymentStatus.FAILED ? 'payment_failed' : 'payment_incomplete'
    );
  })
);

router.get(
  '/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    const bookings = await Booking.find({ userId: req.user.sub }).sort({ createdAt: -1 });
    sendSuccess(res, bookings.map(serializeBooking));
  })
);

router.get(
  '/event/:eventId/agenda',
  authenticate(),
  asyncHandler(async (req, res) => {
    const booking = await loadConfirmedAgendaBooking({
      eventId: req.params.eventId,
      userId: req.user.sub
    });
    const eventMeta = booking
      ? await loadEventMeta(req, req.params.eventId)
      : await loadViewableEventMeta(req, req.params.eventId);

    const agendaData = await applyAgendaSync({
      booking,
      eventMeta
    });

    sendSuccess(res, {
      eventId: req.params.eventId,
      eventTitle: eventMeta.title,
      venueName: eventMeta.venueName || '',
      timezone: eventMeta.timezone || 'Asia/Calcutta',
      ...agendaData
    });
  })
);

router.post(
  '/event/:eventId/agenda',
  authenticate(),
  validateSchema(agendaSessionUpdateSchema),
  asyncHandler(async (req, res) => {
    const [eventMeta, booking] = await Promise.all([
      loadEventMeta(req, req.params.eventId),
      loadConfirmedAgendaBooking({
        eventId: req.params.eventId,
        userId: req.user.sub
      })
    ]);

    if (!booking) {
      throw new AppError(
        'Confirm a ticket for this event before saving sessions to your agenda',
        403,
        'agenda_booking_required'
      );
    }

    const agendaState = buildAgendaState({
      eventSessions: eventMeta.sessions || [],
      savedSessions: booking.savedAgenda?.sessions || []
    });
    const sessionToSave = agendaState.scheduleSessions.find(
      (session) => session.sessionKey === req.body.sessionKey
    );
    const existingSession = agendaState.storedSessions.find(
      (session) => session.sessionKey === req.body.sessionKey
    );

    if (req.body.saved && !sessionToSave) {
      throw new AppError('Session not found on this event schedule', 404, 'agenda_session_not_found');
    }
    if (!req.body.saved && !existingSession) {
      throw new AppError('Session is not saved in your agenda', 404, 'agenda_session_not_saved');
    }

    const remainingSessions = agendaState.storedSessions.filter(
      (session) => session.sessionKey !== req.body.sessionKey
    );
    const nextStoredSessions = req.body.saved
      ? [
          ...remainingSessions,
          stripAgendaSessionForStorage({
            ...sessionToSave,
            savedAt: existingSession?.savedAt || new Date()
          })
        ]
      : remainingSessions;

    booking.savedAgenda = {
      sessions: nextStoredSessions,
      updatedAt: new Date()
    };
    await booking.save();

    const nextAgendaData = await applyAgendaSync({
      booking,
      eventMeta
    });

    sendSuccess(res, {
      eventId: req.params.eventId,
      eventTitle: eventMeta.title,
      venueName: eventMeta.venueName || '',
      timezone: eventMeta.timezone || 'Asia/Calcutta',
      ...nextAgendaData
    });
  })
);

router.get(
  '/:bookingId/invoice.pdf',
  authenticate(),
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'booking_not_found');
    }

    if (!canAccessBooking(booking, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    if (!booking.invoice?.invoiceNumber) {
      throw new AppError('Invoice not available yet', 404, 'invoice_not_found');
    }

    const pdfBuffer = await buildInvoicePdf(booking);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${booking.invoice.invoiceNumber}.pdf"`
    );
    res.status(200).send(pdfBuffer);
  })
);

router.get(
  '/event/:eventId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const filter =
      req.user.role === Roles.ADMIN
        ? { eventId: req.params.eventId }
        : {
            eventId: req.params.eventId,
            'eventSnapshot.organizerId': req.user.sub
          };

    const bookings = await Booking.find(filter).sort({ createdAt: -1 });
    sendSuccess(res, bookings.map(serializeBooking));
  })
);

router.get(
  '/event/:eventId/export.csv',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const events = await getOrganizerEvents(req);
    const event = events.find((item) => String(item._id) === String(req.params.eventId));

    if (!event) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    const bookings = await Booking.find({
      eventId: req.params.eventId
    })
      .sort({ createdAt: -1 })
      .select(
        'bookingNumber userId eventId tierId tierName quantity amount currency status attendee promoCode referral invoice createdAt confirmedAt checkedInAt cancelledAt refundedAt eventSnapshot pricing'
      )
      .lean();

    const userLocations = await loadUserLocations(
      req,
      bookings.map((booking) => booking.userId)
    );
    const csv = buildEventBookingsCsv({
      event,
      bookings,
      userLocations,
      reportingCurrency: req.config.reportingCurrency
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${buildCsvFileName(event.title)}"`);
    res.status(200).send(`\uFEFF${csv}`);
  })
);

router.post(
  '/:bookingId/check-in',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(checkInSchema),
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'booking_not_found');
    }

    const canManage = req.user.role === Roles.ADMIN || booking.eventSnapshot.organizerId === req.user.sub;
    if (!canManage) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new AppError('Only confirmed tickets can be checked in', 409, 'check_in_not_allowed');
    }

    if (!booking.qrCodeToken || booking.qrCodeToken !== req.body.token) {
      throw new AppError('Invalid ticket QR code', 403, 'invalid_ticket_qr');
    }

    const alreadyCheckedIn = Boolean(booking.checkedInAt);
    if (!alreadyCheckedIn) {
      booking.checkedInAt = new Date();
      booking.checkedInBy = req.user.sub;
      await booking.save();

      await req.eventBus.publish(DomainEvents.BOOKING_CHECKED_IN, {
        bookingId: booking._id.toString(),
        eventId: booking.eventId,
        userId: booking.userId,
        eventTitle: booking.eventSnapshot?.title || '',
        checkedInAt: booking.checkedInAt
      });
    }

    sendSuccess(res, {
      booking: serializeBooking(booking),
      alreadyCheckedIn
    });
  })
);

router.post(
  '/:bookingId/refund',
  authenticate(),
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'booking_not_found');
    }

    const isOwner = booking.userId === req.user.sub;
    const isOrganizer = booking.eventSnapshot.organizerId === req.user.sub;
    const isAdmin = req.user.role === Roles.ADMIN;
    if (!isOwner && !isOrganizer && !isAdmin) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new AppError('Only confirmed bookings can be refunded', 409, 'refund_not_allowed');
    }

    const payment = await Payment.findById(booking.paymentId);
    if (!payment) {
      throw new AppError('Payment not found', 404, 'payment_not_found');
    }

    if (payment.provider === 'stripe' && payment.providerPaymentId) {
      const refund = await createRefund(payment.providerPaymentId);
      payment.refundId = refund.id;
    }

    payment.status = PaymentStatus.REFUNDED;
    booking.status = BookingStatus.REFUNDED;
    booking.refundedAt = new Date();
    booking.cancelledAt = new Date();
    await releasePromoReservationIfNeeded({
      booking,
      req
    });
    await payment.save();
    await booking.save();

    await req.eventBus.publish(DomainEvents.PAYMENT_REFUNDED, {
      paymentId: payment._id.toString(),
      bookingId: booking._id.toString(),
      eventId: booking.eventId,
      quantity: booking.quantity,
      amount: booking.amount,
      reportingAmount: getReportingAmount(booking)
    });

    await req.eventBus.publish(DomainEvents.BOOKING_CANCELLED, {
      bookingId: booking._id.toString(),
      eventId: booking.eventId,
      tierId: booking.tierId,
      userId: booking.userId,
      quantity: booking.quantity
    });

    sendSuccess(res, {
      booking: serializeBooking(booking),
      payment
    });
  })
);

module.exports = router;
