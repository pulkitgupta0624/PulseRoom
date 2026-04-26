const crypto = require('crypto');
const { slugify } = require('./slugify');

const buildReferralCode = (title = 'event') => {
  const slug = slugify(title).slice(0, 12) || 'event';
  return `${slug}-${crypto.randomBytes(4).toString('hex')}`;
};

const ensureEventReferralCode = async (event) => {
  if (event?.referral?.code) {
    return event;
  }

  event.referral = {
    ...(event.referral || {}),
    code: buildReferralCode(event.title),
    clicks: Number(event.referral?.clicks || 0)
  };
  await event.save();
  return event;
};

const buildReferralLink = (event, appOrigin) => {
  const baseOrigin = (appOrigin || '').replace(/\/$/, '');
  return `${baseOrigin}/events/${event._id.toString()}?ref=${encodeURIComponent(event.referral.code)}`;
};

const serializeEventForViewer = ({
  event,
  viewer,
  appOrigin,
  includeReferral = false,
  includeReferralLink = false
}) => {
  const raw = typeof event.toObject === 'function' ? event.toObject() : { ...event };
  const canViewReferralData =
    includeReferral ||
    Boolean(viewer && (viewer.role === 'admin' || viewer.sub === raw.organizerId));
  const canViewReferralLink =
    includeReferralLink ||
    Boolean(viewer && (viewer.role === 'admin' || viewer.sub === raw.organizerId));

  if (!canViewReferralData) {
    delete raw.referral;
  }

  if (canViewReferralLink && raw.referral?.code) {
    raw.referralLink = buildReferralLink(raw, appOrigin);
  }

  return raw;
};

module.exports = {
  buildReferralCode,
  ensureEventReferralCode,
  buildReferralLink,
  serializeEventForViewer
};
