const crypto = require('crypto');
const { AppError } = require('@pulseroom/common');

const normalizePromoCode = (value = '') =>
  String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

const buildPromoCodeId = () => `promo_${crypto.randomBytes(4).toString('hex')}`;

const buildPromoCodeRecord = (input) => ({
  promoCodeId: buildPromoCodeId(),
  code: normalizePromoCode(input.code),
  discountType: input.discountType,
  discountValue: Number(input.discountValue || 0),
  maxRedemptions: Number(input.maxRedemptions || 0),
  redemptionsUsed: 0,
  active: input.active !== false,
  startsAt: input.startsAt || undefined,
  expiresAt: input.expiresAt || undefined,
  appliesToTierIds: input.appliesToTierIds || [],
  totalDiscountGiven: 0
});

const calculatePromoDiscountAmount = ({ subtotal, promoCode }) => {
  const safeSubtotal = Number(subtotal || 0);
  if (!safeSubtotal || !promoCode) {
    return 0;
  }

  if (promoCode.discountType === 'fixed') {
    return Number(Math.min(safeSubtotal, promoCode.discountValue || 0).toFixed(2));
  }

  return Number(
    Math.min(safeSubtotal, safeSubtotal * ((promoCode.discountValue || 0) / 100)).toFixed(2)
  );
};

const hasPromoStarted = (promoCode, now = new Date()) =>
  !promoCode?.startsAt || new Date(promoCode.startsAt).getTime() <= now.getTime();

const isPromoExpired = (promoCode, now = new Date()) =>
  Boolean(promoCode?.expiresAt && new Date(promoCode.expiresAt).getTime() <= now.getTime());

const hasPromoCapacity = (promoCode) =>
  Number(promoCode?.redemptionsUsed || 0) < Number(promoCode?.maxRedemptions || 0);

const appliesPromoToTier = (promoCode, tierId) =>
  !promoCode?.appliesToTierIds?.length || promoCode.appliesToTierIds.includes(tierId);

const isPromoActiveForTier = ({ promoCode, tierId, now = new Date() }) =>
  Boolean(
    promoCode?.active !== false &&
      hasPromoStarted(promoCode, now) &&
      !isPromoExpired(promoCode, now) &&
      hasPromoCapacity(promoCode) &&
      appliesPromoToTier(promoCode, tierId)
  );

const findPromoCode = (event, code) => {
  const normalizedCode = normalizePromoCode(code);
  return (event?.promoCodes || []).find((promoCode) => promoCode.code === normalizedCode) || null;
};

const assertPromoCanBeApplied = ({ promoCode, tierId, now = new Date() }) => {
  if (!promoCode) {
    throw new AppError('Promo code not found', 404, 'promo_code_not_found');
  }

  if (promoCode.active === false) {
    throw new AppError('This promo code is not active', 409, 'promo_code_inactive');
  }

  if (!hasPromoStarted(promoCode, now)) {
    throw new AppError('This promo code is not active yet', 409, 'promo_code_not_started');
  }

  if (isPromoExpired(promoCode, now)) {
    throw new AppError('This promo code has expired', 409, 'promo_code_expired');
  }

  if (!hasPromoCapacity(promoCode)) {
    throw new AppError('This promo code has reached its usage cap', 409, 'promo_code_exhausted');
  }

  if (!appliesPromoToTier(promoCode, tierId)) {
    throw new AppError('This promo code does not apply to the selected ticket tier', 409, 'promo_code_tier_mismatch');
  }
};

const serializePromoCodeForManager = (promoCode, ticketTiers = []) => {
  const raw = typeof promoCode.toObject === 'function' ? promoCode.toObject() : { ...promoCode };
  const tierNames = (raw.appliesToTierIds || []).map((tierId) => {
    const tier = (ticketTiers || []).find((item) => item.tierId === tierId);
    return {
      tierId,
      name: tier?.name || tierId
    };
  });

  return {
    ...raw,
    redemptionsRemaining: Math.max(0, Number(raw.maxRedemptions || 0) - Number(raw.redemptionsUsed || 0)),
    isExpired: isPromoExpired(raw),
    tierNames,
    appliesToAllTiers: !raw.appliesToTierIds?.length
  };
};

module.exports = {
  assertPromoCanBeApplied,
  buildPromoCodeRecord,
  calculatePromoDiscountAmount,
  findPromoCode,
  isPromoActiveForTier,
  isPromoExpired,
  normalizePromoCode,
  serializePromoCodeForManager
};
