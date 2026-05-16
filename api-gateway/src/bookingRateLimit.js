const BOOKING_RATE_LIMITED_POST_PATHS = [
  /^\/checkout\/?$/i,
  /^\/waitlist\/?$/i,
  /^\/[^/]+\/confirm-payment\/?$/i,
  /^\/[^/]+\/refund\/?$/i
];

const normalizeBookingPath = (req = {}) => {
  const sourcePath =
    typeof req.path === 'string' && req.path
      ? req.path
      : String(req.originalUrl || '').replace(/^\/api\/bookings/i, '').split('?')[0];

  if (!sourcePath) {
    return '/';
  }

  return sourcePath.startsWith('/') ? sourcePath : `/${sourcePath}`;
};

const shouldApplyBookingUserRateLimit = (req = {}) => {
  if (String(req.method || '').toUpperCase() !== 'POST') {
    return false;
  }

  const normalizedPath = normalizeBookingPath(req);
  return BOOKING_RATE_LIMITED_POST_PATHS.some((pattern) => pattern.test(normalizedPath));
};

module.exports = {
  normalizeBookingPath,
  shouldApplyBookingUserRateLimit
};
