const Redis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const {
  BookingStatus,
  DomainEvents,
  PaymentStatus,
  WaitlistStatus
} = require('@pulseroom/common');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const WaitlistEntry = require('../models/WaitlistEntry');
const {
  buildWaitlistOfferToken,
  findActiveWaitlistEntry,
  getCommittedQuantity
} = require('./waitlistService');

const AUTOMATION_QUEUE = 'booking-automation-jobs';

const buildBookingExpiryJobId = (bookingId) => `booking-expiry__${bookingId}`;
const buildWaitlistOfferExpiryJobId = (waitlistEntryId) => `waitlist-offer-expiry__${waitlistEntryId}`;

const createBookingAutomationService = ({
  redisUrl,
  logger,
  eventBus,
  appOrigin,
  fetchEventById,
  releasePromoReservation
}) => {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(AUTOMATION_QUEUE, { connection });

  const buildClaimUrl = (entry) =>
    `${appOrigin.replace(/\/$/, '')}/events/${entry.eventId}?waitlistOfferToken=${entry.offerToken}&tierId=${entry.tierId}`;

  const removeJobIfExists = async (jobId) => {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  };

  const scheduleBookingExpiration = async (booking) => {
    if (!booking?.reservationExpiresAt || booking.status !== BookingStatus.PENDING) {
      return;
    }

    const bookingId = booking._id.toString();
    await removeJobIfExists(buildBookingExpiryJobId(bookingId));
    await queue.add(
      'expire-booking-reservation',
      { bookingId },
      {
        jobId: buildBookingExpiryJobId(bookingId),
        delay: Math.max(0, new Date(booking.reservationExpiresAt).getTime() - Date.now()),
        removeOnComplete: true,
        removeOnFail: 50
      }
    );
  };

  const scheduleWaitlistOfferExpiration = async (entry) => {
    if (!entry?.offerExpiresAt || entry.status !== WaitlistStatus.OFFERED) {
      return;
    }

    const waitlistEntryId = entry._id.toString();
    await removeJobIfExists(buildWaitlistOfferExpiryJobId(waitlistEntryId));
    await queue.add(
      'expire-waitlist-offer',
      { waitlistEntryId },
      {
        jobId: buildWaitlistOfferExpiryJobId(waitlistEntryId),
        delay: Math.max(0, new Date(entry.offerExpiresAt).getTime() - Date.now()),
        removeOnComplete: true,
        removeOnFail: 50
      }
    );
  };

  const publishWaitlistOffer = async (entry) => {
    await eventBus.publish(DomainEvents.WAITLIST_SPOT_OFFERED, {
      waitlistEntryId: entry._id.toString(),
      eventId: entry.eventId,
      tierId: entry.tierId,
      userId: entry.userId,
      quantity: entry.quantity,
      attendeeEmail: entry.attendee.email,
      attendeeName: entry.attendee.name,
      eventTitle: entry.eventSnapshot.title,
      tierName: entry.eventSnapshot.tierName,
      eventStartsAt: entry.eventSnapshot.startsAt,
      offerExpiresAt: entry.offerExpiresAt,
      claimUrl: buildClaimUrl(entry)
    });
  };

  const releasePromoReservationForBooking = async (booking) => {
    if (
      !booking?.promoCode?.promoCodeId ||
      booking?.promoCode?.releasedAt ||
      typeof releasePromoReservation !== 'function'
    ) {
      return false;
    }

    await releasePromoReservation(booking);
    booking.promoCode.releasedAt = new Date();
    return true;
  };

  const expirePendingBooking = async (bookingId) => {
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.status !== BookingStatus.PENDING) {
      return;
    }

    if (booking.reservationExpiresAt && new Date(booking.reservationExpiresAt).getTime() > Date.now()) {
      await scheduleBookingExpiration(booking);
      return;
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancelledAt = new Date();
    await booking.save();

    if (booking.paymentId) {
      const payment = await Payment.findById(booking.paymentId);
      if (payment && payment.status !== PaymentStatus.REFUNDED && payment.status !== PaymentStatus.SUCCEEDED) {
        payment.status = PaymentStatus.FAILED;
        await payment.save();
      }
    }

    if (await releasePromoReservationForBooking(booking)) {
      await booking.save();
    }

    if (booking.sourceWaitlistEntryId) {
      await WaitlistEntry.updateOne(
        {
          _id: booking.sourceWaitlistEntryId,
          status: WaitlistStatus.CLAIMED
        },
        {
          $set: {
            status: WaitlistStatus.EXPIRED,
            expiredAt: new Date()
          }
        }
      );
    }

    await eventBus.publish(DomainEvents.BOOKING_CANCELLED, {
      bookingId: booking._id.toString(),
      eventId: booking.eventId,
      tierId: booking.tierId,
      userId: booking.userId,
      quantity: booking.quantity,
      reason: 'reservation_expired'
    });
  };

  const expireWaitlistOffer = async (waitlistEntryId) => {
    const entry = await WaitlistEntry.findById(waitlistEntryId);
    if (!entry || entry.status !== WaitlistStatus.OFFERED) {
      return;
    }

    if (entry.offerExpiresAt && new Date(entry.offerExpiresAt).getTime() > Date.now()) {
      await scheduleWaitlistOfferExpiration(entry);
      return;
    }

    entry.status = WaitlistStatus.EXPIRED;
    entry.expiredAt = new Date();
    await entry.save();

    await eventBus.publish(DomainEvents.WAITLIST_SPOT_EXPIRED, {
      waitlistEntryId: entry._id.toString(),
      eventId: entry.eventId,
      tierId: entry.tierId,
      userId: entry.userId,
      attendeeEmail: entry.attendee.email,
      eventTitle: entry.eventSnapshot.title
    });
  };

  const worker = new Worker(
    AUTOMATION_QUEUE,
    async (job) => {
      if (job.name === 'expire-booking-reservation') {
        await expirePendingBooking(job.data.bookingId);
      }

      if (job.name === 'expire-waitlist-offer') {
        await expireWaitlistOffer(job.data.waitlistEntryId);
      }
    },
    { connection }
  );

  worker.on('failed', (job, error) => {
    logger.error({
      message: 'Booking automation job failed',
      jobId: job?.id,
      error: error.message
    });
  });

  const offerWaitlistSpots = async ({ eventId, tierId }) => {
    const event = await fetchEventById(eventId);
    const tier = event?.ticketTiers?.find((item) => item.tierId === tierId);
    if (!tier) {
      return;
    }

    let remaining = Math.max(0, tier.quantity - (await getCommittedQuantity(eventId, tierId)));
    while (remaining > 0) {
      const entry = await WaitlistEntry.findOne({
        eventId,
        tierId,
        status: WaitlistStatus.WAITING,
        quantity: { $lte: remaining }
      }).sort({ createdAt: 1 });

      if (!entry) {
        break;
      }

      entry.status = WaitlistStatus.OFFERED;
      entry.offerToken = buildWaitlistOfferToken();
      entry.offerSentAt = new Date();
      entry.offerExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await entry.save();

      await scheduleWaitlistOfferExpiration(entry);
      await publishWaitlistOffer(entry);

      remaining -= entry.quantity;
    }
  };

  const getOfferForUser = async ({ offerToken, userId, eventId, tierId }) =>
    WaitlistEntry.findOne({
      offerToken,
      userId,
      ...(eventId ? { eventId } : {}),
      ...(tierId ? { tierId } : {}),
      status: WaitlistStatus.OFFERED,
      offerExpiresAt: { $gt: new Date() }
    });

  const markWaitlistEntryClaimed = async ({ entry, bookingId }) => {
    entry.status = WaitlistStatus.CLAIMED;
    entry.claimedAt = new Date();
    entry.claimBookingId = bookingId;
    await entry.save();
  };

  const markWaitlistEntryFulfilled = async ({ waitlistEntryId, bookingId }) => {
    if (!waitlistEntryId) {
      return;
    }

    const entry = await WaitlistEntry.findById(waitlistEntryId);
    if (!entry || entry.status === WaitlistStatus.FULFILLED) {
      return;
    }

    entry.status = WaitlistStatus.FULFILLED;
    entry.fulfilledAt = new Date();
    if (bookingId) {
      entry.claimBookingId = bookingId;
    }
    await entry.save();

    await eventBus.publish(DomainEvents.WAITLIST_SPOT_CLAIMED, {
      waitlistEntryId: entry._id.toString(),
      eventId: entry.eventId,
      tierId: entry.tierId,
      userId: entry.userId,
      attendeeEmail: entry.attendee.email,
      eventTitle: entry.eventSnapshot.title
    });
  };

  const getMyWaitlistEntry = async ({ userId, eventId, tierId }) =>
    findActiveWaitlistEntry({ userId, eventId, tierId });

  return {
    scheduleBookingExpiration,
    scheduleWaitlistOfferExpiration,
    offerWaitlistSpots,
    getOfferForUser,
    markWaitlistEntryClaimed,
    markWaitlistEntryFulfilled,
    getMyWaitlistEntry,
    releasePromoReservationForBooking
  };
};

module.exports = {
  createBookingAutomationService
};
