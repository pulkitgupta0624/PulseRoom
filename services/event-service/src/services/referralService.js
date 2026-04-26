const crypto = require('crypto');
const { slugify } = require('./slugify');

const DEFAULT_REFERRAL_DISCOUNT_TYPE = 'percentage';
const DEFAULT_REFERRAL_DISCOUNT_VALUE = 10;
const DEFAULT_REFERRAL_MAX_REDEMPTIONS = 1;

const buildReferralCode = (title = 'event') => {
  const slug = slugify(title).slice(0, 12) || 'event';
  return `${slug}-${crypto.randomBytes(4).toString('hex')}`;
};

const buildReferralExpiresAt = (event) => {
  if (!event?.startsAt) {
    return undefined;
  }

  return new Date(event.startsAt);
};

const isReferralExpired = (referral, now = new Date()) => {
  if (!referral?.expiresAt) {
    return false;
  }

  return new Date(referral.expiresAt).getTime() <= now.getTime();
};

const isReferralActive = (referral, now = new Date()) =>
  Boolean(
    referral?.code &&
      referral.status === 'active' &&
      Number(referral.redemptionsUsed || 0) < Number(referral.maxRedemptions || DEFAULT_REFERRAL_MAX_REDEMPTIONS) &&
      !isReferralExpired(referral, now)
  );

const buildReferralRecord = (event, overrides = {}) => ({
  code: buildReferralCode(event?.title),
  discountType: DEFAULT_REFERRAL_DISCOUNT_TYPE,
  discountValue: DEFAULT_REFERRAL_DISCOUNT_VALUE,
  maxRedemptions: DEFAULT_REFERRAL_MAX_REDEMPTIONS,
  redemptionsUsed: 0,
  status: 'active',
  generatedAt: new Date(),
  expiresAt: buildReferralExpiresAt(event),
  clicks: Number(event?.referral?.clicks || 0),
  totalRedemptions: Number(event?.referral?.totalRedemptions || 0),
  totalDiscountGiven: Number(event?.referral?.totalDiscountGiven || 0),
  ...overrides
});

const ensureActiveReferralCode = async (event) => {
  const eventHasStarted = event?.startsAt && new Date(event.startsAt).getTime() <= Date.now();
  const eventShouldAcceptReferrals = !['completed', 'cancelled'].includes(event?.status) && !eventHasStarted;

  if (!eventShouldAcceptReferrals) {
    if (event?.referral?.status !== 'expired') {
      event.referral = {
        ...(event.referral || {}),
        status: 'expired',
        expiresAt: event.referral?.expiresAt || buildReferralExpiresAt(event)
      };
      await event.save();
    }
    return event;
  }

  if (isReferralActive(event?.referral)) {
    return event;
  }

  event.referral = buildReferralRecord(event, {
    clicks: Number(event?.referral?.clicks || 0),
    totalRedemptions: Number(event?.referral?.totalRedemptions || 0),
    totalDiscountGiven: Number(event?.referral?.totalDiscountGiven || 0)
  });
  await event.save();
  return event;
};

const rotateReferralCode = async (event, metadata = {}) => {
  const previousReferral = event?.referral || {};
  event.referral = buildReferralRecord(event, {
    clicks: Number(previousReferral.clicks || 0),
    totalRedemptions: Number(previousReferral.totalRedemptions || 0) + Number(metadata.countAsRedemption ? 1 : 0),
    totalDiscountGiven:
      Number(previousReferral.totalDiscountGiven || 0) + Number(metadata.discountAmount || 0),
    lastRedeemedAt: metadata.redeemedAt,
    lastRedeemedByUserId: metadata.redeemedByUserId
  });
  await event.save();
  return event;
};

const buildReferralLink = (event, appOrigin) => {
  const baseOrigin = (appOrigin || '').replace(/\/$/, '');
  return `${baseOrigin}/events/${event._id.toString()}?ref=${encodeURIComponent(event.referral.code)}`;
};

const getReferralDiscountAmount = ({ subtotal, referral }) => {
  const safeSubtotal = Number(subtotal || 0);
  if (!safeSubtotal || !referral) {
    return 0;
  }

  if (referral.discountType === 'fixed') {
    return Number(Math.min(safeSubtotal, referral.discountValue || 0).toFixed(2));
  }

  return Number(Math.min(safeSubtotal, safeSubtotal * ((referral.discountValue || 0) / 100)).toFixed(2));
};

const buildPublicReferralOffer = ({ event, referralCode, viewerIsOwner = false }) => {
  const referral = event?.referral;
  if (!referralCode || !referral || viewerIsOwner) {
    return null;
  }

  if (referral.code !== referralCode) {
    return {
      status: 'expired',
      message: 'This referral discount link is no longer active.'
    };
  }

  if (isReferralExpired(referral)) {
    return {
      status: 'expired',
      message: 'This referral discount link has expired.'
    };
  }

  if (!isReferralActive(referral)) {
    return {
      status: 'redeemed',
      message: 'This referral discount link has already been used.'
    };
  }

  return {
    status: 'active',
    code: referral.code,
    discountType: referral.discountType,
    discountValue: referral.discountValue,
    maxRedemptions: referral.maxRedemptions,
    redemptionsRemaining: Math.max(0, Number(referral.maxRedemptions || 1) - Number(referral.redemptionsUsed || 0)),
    expiresAt: referral.expiresAt,
    message:
      referral.discountType === 'fixed'
        ? `Referral unlocked ${referral.discountValue} off this booking for a first-time attendee.`
        : `Referral unlocked ${referral.discountValue}% off this booking for a first-time attendee.`
  };
};

const serializeEventForViewer = ({
  event,
  viewer,
  appOrigin,
  includeReferral = false,
  includeReferralLink = false,
  referralCode
}) => {
  const raw = typeof event.toObject === 'function' ? event.toObject() : { ...event };
  const viewerIsOwner = Boolean(viewer && (viewer.role === 'admin' || viewer.sub === raw.organizerId));
  const canViewReferralData = includeReferral || viewerIsOwner;
  const canViewReferralLink = includeReferralLink || viewerIsOwner;
  const referralOffer = buildPublicReferralOffer({
    event: raw,
    referralCode,
    viewerIsOwner
  });

  if (!canViewReferralData) {
    delete raw.referral;
  }

  if (canViewReferralLink && raw.referral?.code) {
    raw.referralLink = buildReferralLink(raw, appOrigin);
  }

  if (referralOffer) {
    raw.referralOffer = referralOffer;
  }

  return raw;
};

module.exports = {
  DEFAULT_REFERRAL_DISCOUNT_TYPE,
  DEFAULT_REFERRAL_DISCOUNT_VALUE,
  DEFAULT_REFERRAL_MAX_REDEMPTIONS,
  buildReferralCode,
  buildReferralRecord,
  buildReferralLink,
  buildPublicReferralOffer,
  ensureActiveReferralCode,
  getReferralDiscountAmount,
  isReferralActive,
  isReferralExpired,
  rotateReferralCode,
  serializeEventForViewer
};
