const crypto = require('crypto');

const buildTicketToken = () => crypto.randomBytes(18).toString('hex');

const buildQrCodeValue = (booking) =>
  JSON.stringify({
    type: 'pulseroom-ticket',
    bookingId: booking._id.toString(),
    eventId: booking.eventId,
    bookingNumber: booking.bookingNumber,
    token: booking.qrCodeToken
  });

const serializeBooking = (booking) => {
  const raw = typeof booking.toObject === 'function' ? booking.toObject() : booking;
  const checkedIn = Boolean(raw.checkedInAt);

  return {
    ...raw,
    ticket: raw.qrCodeToken
      ? {
          qrCodeValue: buildQrCodeValue(raw),
          checkedIn,
          checkedInAt: raw.checkedInAt || null
        }
      : null
  };
};

module.exports = {
  buildTicketToken,
  buildQrCodeValue,
  serializeBooking
};
