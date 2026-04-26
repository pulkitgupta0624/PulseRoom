const crypto = require('crypto');
const { BookingStatus, WaitlistStatus } = require('@pulseroom/common');
const Booking = require('../models/Booking');
const WaitlistEntry = require('../models/WaitlistEntry');

const buildWaitlistOfferToken = () => crypto.randomBytes(18).toString('hex');

const serializeWaitlistEntry = (entry) => {
  const raw = typeof entry.toObject === 'function' ? entry.toObject() : entry;

  return {
    ...raw,
    isOfferActive:
      raw.status === WaitlistStatus.OFFERED &&
      raw.offerExpiresAt &&
      new Date(raw.offerExpiresAt).getTime() > Date.now()
  };
};

const getReservedBookingQuantity = async (eventId, tierId) => {
  const now = new Date();
  const bookings = await Booking.find({
    eventId,
    tierId,
    $or: [
      { status: BookingStatus.CONFIRMED },
      {
        status: BookingStatus.PENDING,
        reservationExpiresAt: { $gt: now }
      }
    ]
  }).lean();

  return bookings.reduce((sum, item) => sum + item.quantity, 0);
};

const getActiveWaitlistOfferQuantity = async (eventId, tierId) => {
  const now = new Date();
  const offers = await WaitlistEntry.find({
    eventId,
    tierId,
    status: WaitlistStatus.OFFERED,
    offerExpiresAt: { $gt: now }
  }).lean();

  return offers.reduce((sum, item) => sum + item.quantity, 0);
};

const getCommittedQuantity = async (eventId, tierId) => {
  const [reservedBookings, reservedOffers] = await Promise.all([
    getReservedBookingQuantity(eventId, tierId),
    getActiveWaitlistOfferQuantity(eventId, tierId)
  ]);

  return reservedBookings + reservedOffers;
};

const findActiveWaitlistEntry = async ({ eventId, tierId, userId }) =>
  WaitlistEntry.findOne({
    eventId,
    tierId,
    userId,
    status: {
      $in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED, WaitlistStatus.CLAIMED]
    }
  }).sort({ createdAt: -1 });

module.exports = {
  buildWaitlistOfferToken,
  serializeWaitlistEntry,
  getReservedBookingQuantity,
  getActiveWaitlistOfferQuantity,
  getCommittedQuantity,
  findActiveWaitlistEntry
};
