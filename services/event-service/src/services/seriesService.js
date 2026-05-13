const { slugify } = require('./slugify');

const DEFAULT_SERIES_ACCENT_COLOR = '#1D7A85';
const DEFAULT_SERIES_PLAN_NAME = 'Series Pass';

const normalizeSeriesMembershipSettings = (settings = {}) => ({
  enabled: settings?.enabled !== false,
  allowSelfJoin: settings?.allowSelfJoin !== false,
  planName: String(settings?.planName || DEFAULT_SERIES_PLAN_NAME).trim() || DEFAULT_SERIES_PLAN_NAME,
  price: Number(settings?.price || 0),
  currency: String(settings?.currency || 'INR').trim().toUpperCase() || 'INR',
  discountPercent: Math.max(0, Number(settings?.discountPercent || 0)),
  earlyAccessHours: Math.max(0, Number(settings?.earlyAccessHours || 0)),
  includesReplayLibrary: settings?.includesReplayLibrary !== false,
  vipNetworking: Boolean(settings?.vipNetworking),
  membersOnlyBooking: Boolean(settings?.membersOnlyBooking),
  perks: [...new Set((Array.isArray(settings?.perks) ? settings.perks : [])
    .map((perk) => String(perk || '').trim())
    .filter(Boolean))]
});

const buildSeriesEventSnapshot = (series, existing = {}) => {
  const membershipSettings = normalizeSeriesMembershipSettings(series?.membershipSettings);

  return {
    seriesId: series?._id?.toString?.() || String(series?.seriesId || ''),
    slug: String(series?.slug || '').trim(),
    name: String(series?.name || '').trim(),
    summary: String(series?.summary || '').trim(),
    cadenceLabel: String(series?.cadenceLabel || '').trim(),
    accentColor: String(series?.theme?.accentColor || DEFAULT_SERIES_ACCENT_COLOR).trim() || DEFAULT_SERIES_ACCENT_COLOR,
    coverImageUrl: String(series?.theme?.coverImageUrl || '').trim(),
    planName: membershipSettings.planName,
    discountPercent: membershipSettings.discountPercent,
    earlyAccessHours: membershipSettings.earlyAccessHours,
    membersOnlyBooking: membershipSettings.membersOnlyBooking,
    position: Number.isFinite(Number(existing?.position)) ? Number(existing.position) : undefined,
    seasonLabel: String(existing?.seasonLabel || '').trim()
  };
};

const buildSeriesMembershipPerksSnapshot = (series) => {
  const settings = normalizeSeriesMembershipSettings(series?.membershipSettings);

  return {
    planName: settings.planName,
    price: settings.price,
    currency: settings.currency,
    discountPercent: settings.discountPercent,
    earlyAccessHours: settings.earlyAccessHours,
    includesReplayLibrary: settings.includesReplayLibrary,
    vipNetworking: settings.vipNetworking,
    membersOnlyBooking: settings.membersOnlyBooking,
    perks: settings.perks
  };
};

const serializeSeriesMembership = (membership) => {
  if (!membership) {
    return null;
  }

  const raw = typeof membership.toObject === 'function' ? membership.toObject() : { ...membership };

  return {
    _id: raw._id?.toString?.() || raw._id,
    seriesId: String(raw.seriesId || ''),
    organizerId: String(raw.organizerId || ''),
    userId: String(raw.userId || ''),
    status: raw.status || 'active',
    source: raw.source || 'self_join',
    joinedAt: raw.joinedAt || raw.createdAt || null,
    lastUsedAt: raw.lastUsedAt || null,
    attendee: raw.attendee || {},
    perks: buildSeriesMembershipPerksSnapshot({ membershipSettings: raw.perks || {} })
  };
};

const serializeSeries = (series) => {
  if (!series) {
    return null;
  }

  const raw = typeof series.toObject === 'function' ? series.toObject() : { ...series };

  return {
    _id: raw._id?.toString?.() || raw._id,
    organizerId: String(raw.organizerId || ''),
    name: String(raw.name || ''),
    slug: String(raw.slug || ''),
    summary: String(raw.summary || ''),
    description: String(raw.description || ''),
    cadenceLabel: String(raw.cadenceLabel || ''),
    categories: raw.categories || [],
    tags: raw.tags || [],
    status: raw.status || 'active',
    membershipSettings: normalizeSeriesMembershipSettings(raw.membershipSettings),
    theme: {
      accentColor: String(raw.theme?.accentColor || DEFAULT_SERIES_ACCENT_COLOR),
      coverImageUrl: String(raw.theme?.coverImageUrl || '')
    },
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null
  };
};

const applySeriesSnapshotToEvent = (event, series, existing = {}) => {
  if (!event) {
    return event;
  }

  event.series = buildSeriesEventSnapshot(series, existing);
  return event;
};

const clearSeriesFromEvent = (event) => {
  if (event) {
    event.series = null;
  }

  return event;
};

const buildSeriesSlug = (name) => slugify(name || 'series');

const shiftDateByDelta = (value, deltaMs) => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return undefined;
  }

  return new Date(parsed.getTime() + deltaMs);
};

const cloneTicketTier = (tier = {}, deltaMs = 0) => ({
  ...tier,
  saleStart: shiftDateByDelta(tier.saleStart, deltaMs),
  saleEnd: shiftDateByDelta(tier.saleEnd, deltaMs)
});

const cloneSponsorPackage = (pkg = {}) => ({
  ...pkg,
  slotsUsed: 0,
  createdAt: undefined,
  updatedAt: undefined
});

const cloneEventForSeries = ({
  sourceEvent,
  series,
  organizerId,
  title,
  startsAt,
  endsAt,
  position
}) => {
  const normalizedStart = new Date(startsAt);
  const sourceStart = new Date(sourceEvent.startsAt);
  const sourceEnd = new Date(sourceEvent.endsAt);
  const sourceDurationMs = Math.max(30 * 60 * 1000, sourceEnd.getTime() - sourceStart.getTime());
  const normalizedEnd = endsAt
    ? new Date(endsAt)
    : new Date(normalizedStart.getTime() + sourceDurationMs);
  const deltaMs = normalizedStart.getTime() - sourceStart.getTime();

  return {
    organizerId,
    title: String(title || sourceEvent.title || '').trim() || 'Series event',
    summary: sourceEvent.summary,
    description: sourceEvent.description,
    coverImageUrl: sourceEvent.coverImageUrl || '',
    type: sourceEvent.type,
    visibility: sourceEvent.visibility,
    status: 'draft',
    timezone: sourceEvent.timezone || 'Asia/Calcutta',
    startsAt: normalizedStart,
    endsAt: normalizedEnd,
    venueName: sourceEvent.venueName || '',
    venueAddress: sourceEvent.venueAddress || '',
    city: sourceEvent.city || '',
    country: sourceEvent.country || '',
    taxRegistrationNumber: sourceEvent.taxRegistrationNumber || '',
    streamUrl: sourceEvent.streamUrl || '',
    organizerSignatureName: sourceEvent.organizerSignatureName || '',
    categories: sourceEvent.categories || [],
    tags: sourceEvent.tags || [],
    speakers: sourceEvent.speakers || [],
    teamMembers: sourceEvent.teamMembers || [],
    sessions: (sourceEvent.sessions || []).map((session) => ({
      ...session,
      startsAt: shiftDateByDelta(session.startsAt, deltaMs),
      endsAt: shiftDateByDelta(session.endsAt, deltaMs)
    })),
    ticketTiers: (sourceEvent.ticketTiers || []).map((tier) => cloneTicketTier(tier, deltaMs)),
    acceptedCurrencies: sourceEvent.acceptedCurrencies || ['INR'],
    sponsorPackages: (sourceEvent.sponsorPackages || []).map((pkg) => cloneSponsorPackage(pkg)),
    sponsors: [],
    promoCodes: [],
    networking: sourceEvent.networking || {},
    pageTheme: sourceEvent.pageTheme || undefined,
    featured: false,
    allowsChat: sourceEvent.allowsChat !== false,
    allowsQa: sourceEvent.allowsQa !== false,
    liveStatus: 'scheduled',
    series: buildSeriesEventSnapshot(series, {
      position
    })
  };
};

module.exports = {
  DEFAULT_SERIES_ACCENT_COLOR,
  DEFAULT_SERIES_PLAN_NAME,
  applySeriesSnapshotToEvent,
  buildSeriesEventSnapshot,
  buildSeriesMembershipPerksSnapshot,
  buildSeriesSlug,
  clearSeriesFromEvent,
  cloneEventForSeries,
  normalizeSeriesMembershipSettings,
  serializeSeries,
  serializeSeriesMembership
};
