const normalizePositiveNumber = (value, fallback = 1) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const normalizeCurrencyAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const getReportingAmount = (payload = {}) =>
  normalizeCurrencyAmount(payload.reportingAmount ?? payload.amount);

const buildBookingConfirmedUpdate = (payload = {}) => ({
  $inc: {
    attendeesCount: normalizePositiveNumber(payload.quantity),
    'analytics.bookings': 1,
    'analytics.revenue': getReportingAmount(payload)
  }
});

const buildPaymentRefundedUpdate = (payload = {}) => ({
  $inc: {
    attendeesCount: -normalizePositiveNumber(payload.quantity),
    'analytics.revenue': -getReportingAmount(payload)
  }
});

module.exports = {
  buildBookingConfirmedUpdate,
  buildPaymentRefundedUpdate,
  normalizePositiveNumber
};
