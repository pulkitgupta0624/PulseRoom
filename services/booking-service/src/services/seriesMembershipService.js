const { roundCurrencyAmount } = require('./pricingService');
const { DEFAULT_EARLY_ACCESS_WINDOW_HOURS } = require('./ticketAccessService');

const resolveSeriesMembershipBenefit = ({ entitlement = null, subtotal = 0 }) => {
  if (!entitlement?.active || !entitlement?.membership) {
    return {
      active: false,
      membershipId: null,
      seriesId: entitlement?.series?._id || entitlement?.seriesId || null,
      planName: entitlement?.membershipSettings?.planName || 'Series Pass',
      discountPercent: Number(entitlement?.membershipSettings?.discountPercent || 0),
      earlyAccessHours: Number(entitlement?.membershipSettings?.earlyAccessHours || 0),
      membersOnlyBooking: Boolean(entitlement?.membershipSettings?.membersOnlyBooking),
      discountBaseAmount: 0
    };
  }

  const perks = entitlement.membership?.perks || {};
  const discountPercent = Math.max(0, Number(perks.discountPercent || 0));
  const safeSubtotal = Number(subtotal || 0);

  return {
    active: true,
    membershipId: String(entitlement.membership._id || ''),
    seriesId: String(entitlement.membership.seriesId || entitlement.series?._id || ''),
    planName: String(perks.planName || entitlement.membershipSettings?.planName || 'Series Pass'),
    discountPercent,
    earlyAccessHours: Math.max(0, Number(perks.earlyAccessHours || entitlement.membershipSettings?.earlyAccessHours || 0)),
    membersOnlyBooking: Boolean(perks.membersOnlyBooking || entitlement.membershipSettings?.membersOnlyBooking),
    discountBaseAmount: roundCurrencyAmount(
      Math.min(safeSubtotal, safeSubtotal * (discountPercent / 100))
    )
  };
};

const buildTicketAccessEntitlements = ({
  gamificationEntitlements = null,
  membershipBenefit = null
}) => {
  const gamificationWindowHours = Number(
    gamificationEntitlements?.perks?.earlyAccess?.windowHours || 0
  );
  const membershipWindowHours = Number(membershipBenefit?.earlyAccessHours || 0);
  const unlocked =
    Boolean(gamificationEntitlements?.perks?.earlyAccess?.unlocked) ||
    Boolean(membershipBenefit?.active && membershipWindowHours > 0);

  if (!unlocked) {
    return null;
  }

  return {
    perks: {
      earlyAccess: {
        unlocked: true,
        windowHours:
          Math.max(
            gamificationWindowHours,
            membershipWindowHours,
            DEFAULT_EARLY_ACCESS_WINDOW_HOURS
          ) || DEFAULT_EARLY_ACCESS_WINDOW_HOURS
      }
    }
  };
};

const DISCOUNT_PRIORITIES = {
  promo: 3,
  referral: 2,
  membership: 1
};

const selectBestDiscount = ({
  membershipBenefit = null,
  referralDiscountBaseAmount = 0,
  promoDiscountBaseAmount = 0
}) => {
  const candidates = [
    membershipBenefit?.discountBaseAmount > 0
      ? {
          source: 'membership',
          amount: Number(membershipBenefit.discountBaseAmount || 0)
        }
      : null,
    referralDiscountBaseAmount > 0
      ? {
          source: 'referral',
          amount: Number(referralDiscountBaseAmount || 0)
        }
      : null,
    promoDiscountBaseAmount > 0
      ? {
          source: 'promo',
          amount: Number(promoDiscountBaseAmount || 0)
        }
      : null
  ].filter(Boolean);

  if (!candidates.length) {
    return {
      source: null,
      discountBaseAmount: 0
    };
  }

  candidates.sort((left, right) => {
    if (right.amount !== left.amount) {
      return right.amount - left.amount;
    }

    return (DISCOUNT_PRIORITIES[right.source] || 0) - (DISCOUNT_PRIORITIES[left.source] || 0);
  });

  return {
    source: candidates[0].source,
    discountBaseAmount: roundCurrencyAmount(candidates[0].amount)
  };
};

module.exports = {
  buildTicketAccessEntitlements,
  resolveSeriesMembershipBenefit,
  selectBestDiscount
};
