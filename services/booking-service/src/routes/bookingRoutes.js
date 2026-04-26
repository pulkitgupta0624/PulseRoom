const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  authorize,
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
const { checkoutSchema, joinWaitlistSchema, checkInSchema } = require('../validators/bookingSchemas');
const { buildInvoiceNumber } = require('../services/invoiceService');
const { createPaymentIntent, createRefund, constructWebhookEvent } = require('../services/paymentService');
const { buildTicketToken, serializeBooking } = require('../services/ticketService');
const { buildBookingAnalytics, clampWindowDays } = require('../services/analyticsService');
const { buildReferralAnalytics } = require('../services/referralAnalyticsService');
const {
  serializeWaitlistEntry,
  getCommittedQuantity,
  findActiveWaitlistEntry
} = require('../services/waitlistService');

const router = express.Router();

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
    eventTitle: booking.eventSnapshot.title,
    eventStartsAt: booking.eventSnapshot.startsAt,
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
        buildBookingAnalytics({
          bookings: [],
          days: clampWindowDays(req.query.days)
        })
      );
    }

    const bookings = await Booking.find({
      status: BookingStatus.CONFIRMED,
      eventId: { $in: eventIds }
    })
      .select('eventId eventSnapshot amount quantity confirmedAt createdAt checkedInAt')
      .lean();

    sendSuccess(res, buildBookingAnalytics({ bookings, days: req.query.days }));
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
        buildReferralAnalytics({
          bookings: [],
          events: [],
          days: req.query.days
        })
      );
    }

    const bookings = await Booking.find({
      status: BookingStatus.CONFIRMED,
      eventId: { $in: eventIds },
      'referral.code': { $exists: true, $ne: null }
    })
      .select('eventId eventSnapshot amount quantity confirmedAt createdAt referral')
      .lean();

    sendSuccess(
      res,
      buildReferralAnalytics({
        bookings,
        events,
        days: req.query.days
      })
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
      .select('eventId eventSnapshot amount quantity confirmedAt createdAt checkedInAt')
      .lean();

    sendSuccess(res, buildBookingAnalytics({ bookings, days: req.query.days }));
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

    const normalizedReferralCode = req.body.referralCode?.trim();
    const referralCode =
      normalizedReferralCode &&
      event.referral?.code === normalizedReferralCode &&
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

    const amount = Number((tier.price * quantity).toFixed(2));
    const booking = await Booking.create({
      bookingNumber: `BK-${Date.now()}`,
      userId: req.user.sub,
      eventId: event._id,
      tierId: tier.tierId,
      tierName: tier.name,
      quantity,
      amount,
      currency: tier.currency || 'INR',
      attendee,
      ...(referralCode
        ? {
            referral: {
              code: referralCode,
              referrerUserId: event.organizerId,
              trackedAt: new Date()
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

    const payment = await Payment.create({
      bookingId: booking._id,
      userId: req.user.sub,
      eventId: event._id,
      amount,
      currency: tier.currency || 'INR',
      provider: config.paymentProvider === 'stripe' && amount > 0 ? 'stripe' : 'manual',
      status: amount === 0 ? PaymentStatus.SUCCEEDED : PaymentStatus.CREATED
    });

    booking.paymentId = payment._id;
    await booking.save();
    await req.automationService.scheduleBookingExpiration(booking);

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
        payment: {
          id: payment._id,
          status: payment.status,
          provider: payment.provider,
          clientSecret: payment.clientSecret
        },
        paymentIntent: paymentIntentMeta
      },
      201
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
    await payment.save();
    await booking.save();

    await req.eventBus.publish(DomainEvents.PAYMENT_REFUNDED, {
      paymentId: payment._id.toString(),
      bookingId: booking._id.toString(),
      eventId: booking.eventId,
      amount: booking.amount
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
