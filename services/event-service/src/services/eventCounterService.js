const normalizePositiveNumber = (value, fallback = 1) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const normalizeCurrencyAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const buildBookingConfirmedUpdate = (payload = {}) => ({
  $inc: {
    attendeesCount: normalizePositiveNumber(payload.quantity),
    'analytics.bookings': 1,
    'analytics.revenue': normalizeCurrencyAmount(payload.amount)
  }
});

const buildPaymentRefundedUpdate = (payload = {}) => ({
  $inc: {
    attendeesCount: -normalizePositiveNumber(payload.quantity),
    'analytics.revenue': -normalizeCurrencyAmount(payload.amount)
  }
});

module.exports = {
  buildBookingConfirmedUpdate,
  buildPaymentRefundedUpdate,
  normalizePositiveNumber
};
