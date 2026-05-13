const CRM_FILTER_DEFAULTS = Object.freeze({
  search: '',
  checkedIn: 'all',
  networking: 'all',
  sessionState: 'all',
  ticketType: 'all',
  referral: 'all'
});

const FILTER_OPTIONS = Object.freeze({
  checkedIn: new Set(['all', 'checked-in', 'not-checked-in', 'no-show']),
  networking: new Set(['all', 'opted-in', 'not-opted-in']),
  sessionState: new Set(['all', 'registered', 'waitlisted']),
  ticketType: new Set(['all', 'single-ticket', 'multi-ticket']),
  referral: new Set(['all', 'referred', 'direct'])
});

const normalizeText = (value, maxLength = 160) =>
  String(value || '').trim().slice(0, maxLength);

const normalizeFilterOption = (value, validOptions, fallback) => {
  const normalized = String(value || '').trim().toLowerCase();
  return validOptions.has(normalized) ? normalized : fallback;
};

const normalizeAudienceCrmFilters = (filters = {}) => ({
  search: normalizeText(filters.search),
  checkedIn: normalizeFilterOption(
    filters.checkedIn,
    FILTER_OPTIONS.checkedIn,
    CRM_FILTER_DEFAULTS.checkedIn
  ),
  networking: normalizeFilterOption(
    filters.networking,
    FILTER_OPTIONS.networking,
    CRM_FILTER_DEFAULTS.networking
  ),
  sessionState: normalizeFilterOption(
    filters.sessionState,
    FILTER_OPTIONS.sessionState,
    CRM_FILTER_DEFAULTS.sessionState
  ),
  ticketType: normalizeFilterOption(
    filters.ticketType,
    FILTER_OPTIONS.ticketType,
    CRM_FILTER_DEFAULTS.ticketType
  ),
  referral: normalizeFilterOption(
    filters.referral,
    FILTER_OPTIONS.referral,
    CRM_FILTER_DEFAULTS.referral
  )
});

const hasNetworkingProfile = (networking = {}) =>
  Boolean(
    String(networking?.meetingGoal || '').trim() ||
    (Array.isArray(networking?.canHelpWith) && networking.canHelpWith.length) ||
    (Array.isArray(networking?.lookingFor) && networking.lookingFor.length) ||
    String(networking?.availabilityNote || '').trim()
  );

const isEventEnded = (eventMeta = {}, now = new Date()) => {
  if (eventMeta?.status === 'completed') {
    return true;
  }

  if (!eventMeta?.endsAt) {
    return false;
  }

  return new Date(eventMeta.endsAt).getTime() <= now.getTime();
};

const mergeAudienceCrmRecords = ({
  bookingAudience = [],
  networkingAudience = [],
  eventMeta = {},
  now = new Date()
}) => {
  const networkingByUserId = new Map(
    (Array.isArray(networkingAudience) ? networkingAudience : [])
      .filter((entry) => entry?.userId)
      .map((entry) => [entry.userId, entry])
  );
  const eventEnded = isEventEnded(eventMeta, now);

  return (Array.isArray(bookingAudience) ? bookingAudience : []).map((entry) => {
    const networking = networkingByUserId.get(entry.userId)?.networking || {};
    const attendeeName = normalizeText(entry.attendeeName || networkingByUserId.get(entry.userId)?.attendeeName || 'Attendee', 80);
    const email = normalizeText(entry.email || networkingByUserId.get(entry.userId)?.email || '', 120);
    const optedIn = Boolean(networking.optedIn);

    return {
      ...entry,
      attendeeName,
      email,
      isNetworkingOptedIn: optedIn,
      networkingOptedInAt: networking.optedInAt || null,
      networkingLastMatchedAt: networking.lastMatchedAt || null,
      hasNetworkingProfile: hasNetworkingProfile(networking),
      isNoShow: eventEnded && !entry.hasCheckedIn
    };
  });
};

const matchesSearch = (entry, search) => {
  if (!search) {
    return true;
  }

  const haystack = [
    entry.attendeeName,
    entry.email,
    entry.tierName
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return haystack.includes(String(search).toLowerCase());
};

const applyAudienceCrmFilters = (audience = [], filters = {}) => {
  const normalized = normalizeAudienceCrmFilters(filters);

  return (Array.isArray(audience) ? audience : []).filter((entry) => {
    if (!matchesSearch(entry, normalized.search)) {
      return false;
    }

    if (normalized.checkedIn === 'checked-in' && !entry.hasCheckedIn) {
      return false;
    }
    if (normalized.checkedIn === 'not-checked-in' && entry.hasCheckedIn) {
      return false;
    }
    if (normalized.checkedIn === 'no-show' && !entry.isNoShow) {
      return false;
    }

    if (normalized.networking === 'opted-in' && !entry.isNetworkingOptedIn) {
      return false;
    }
    if (normalized.networking === 'not-opted-in' && entry.isNetworkingOptedIn) {
      return false;
    }

    if (normalized.sessionState === 'registered' && entry.registeredSessionCount < 1) {
      return false;
    }
    if (normalized.sessionState === 'waitlisted' && entry.waitlistedSessionCount < 1) {
      return false;
    }

    if (normalized.ticketType === 'single-ticket' && entry.ticketCount !== 1) {
      return false;
    }
    if (normalized.ticketType === 'multi-ticket' && entry.ticketCount <= 1) {
      return false;
    }

    if (normalized.referral === 'referred' && !entry.referredBooking) {
      return false;
    }
    if (normalized.referral === 'direct' && entry.referredBooking) {
      return false;
    }

    return true;
  });
};

const buildAudienceCrmSummary = (audience = []) => ({
  audienceCount: audience.length,
  checkedInCount: audience.filter((entry) => entry.hasCheckedIn).length,
  noShowCount: audience.filter((entry) => entry.isNoShow).length,
  networkingOptInCount: audience.filter((entry) => entry.isNetworkingOptedIn).length,
  reservedSessionCount: audience.filter((entry) => entry.registeredSessionCount > 0).length,
  waitlistedSessionCount: audience.filter((entry) => entry.waitlistedSessionCount > 0).length,
  multiTicketCount: audience.filter((entry) => entry.ticketCount > 1).length,
  referredCount: audience.filter((entry) => entry.referredBooking).length
});

module.exports = {
  CRM_FILTER_DEFAULTS,
  applyAudienceCrmFilters,
  buildAudienceCrmSummary,
  isEventEnded,
  mergeAudienceCrmRecords,
  normalizeAudienceCrmFilters
};
