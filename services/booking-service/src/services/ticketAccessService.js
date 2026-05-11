const { AppError } = require('@pulseroom/common');

const DEFAULT_EARLY_ACCESS_WINDOW_HOURS = 24;

const toDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const formatDateTime = (value) => new Date(value).toLocaleString();

const assertTicketTierAccessible = ({ tier, entitlements = null, now = new Date() }) => {
  const currentDate = toDate(now) || new Date();
  const saleStart = toDate(tier?.saleStart);
  const saleEnd = toDate(tier?.saleEnd);

  if (saleEnd && currentDate.getTime() > saleEnd.getTime()) {
    throw new AppError('This ticket tier is no longer on sale', 409, 'tier_sale_closed');
  }

  if (!saleStart || currentDate.getTime() >= saleStart.getTime()) {
    return {
      earlyAccessUsed: false,
      saleStart,
      saleEnd
    };
  }

  const earlyAccess = entitlements?.perks?.earlyAccess || {};
  const windowHours = Number(
    earlyAccess.windowHours || DEFAULT_EARLY_ACCESS_WINDOW_HOURS
  );
  const earlyAccessOpensAt = new Date(
    saleStart.getTime() - windowHours * 60 * 60 * 1000
  );

  if (
    earlyAccess.unlocked &&
    currentDate.getTime() >= earlyAccessOpensAt.getTime()
  ) {
    return {
      earlyAccessUsed: true,
      saleStart,
      saleEnd,
      earlyAccessOpensAt
    };
  }

  throw new AppError(
    `Ticket sales open on ${formatDateTime(saleStart)}. Power Attendees unlock ${windowHours}-hour early access.`,
    409,
    'tier_sale_not_started'
  );
};

module.exports = {
  DEFAULT_EARLY_ACCESS_WINDOW_HOURS,
  assertTicketTierAccessible
};
