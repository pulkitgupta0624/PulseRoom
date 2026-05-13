const SERIES_CRM_FILTER_DEFAULTS = Object.freeze({
  search: '',
  source: 'all',
  joinedWindow: 'all',
  planType: 'all',
  replayAccess: 'all',
  vipNetworking: 'all'
});

const FILTER_OPTIONS = Object.freeze({
  source: new Set(['all', 'self_join', 'organizer_grant']),
  joinedWindow: new Set(['all', 'last_7_days', 'last_30_days', 'older']),
  planType: new Set(['all', 'paid', 'free']),
  replayAccess: new Set(['all', 'included', 'not-included']),
  vipNetworking: new Set(['all', 'enabled', 'not-enabled'])
});

const normalizeText = (value, maxLength = 160) =>
  String(value || '').trim().slice(0, maxLength);

const normalizeFilterOption = (value, validOptions, fallback) => {
  const normalized = String(value || '').trim().toLowerCase();
  return validOptions.has(normalized) ? normalized : fallback;
};

const normalizeSeriesCrmFilters = (filters = {}) => ({
  search: normalizeText(filters.search),
  source: normalizeFilterOption(
    filters.source,
    FILTER_OPTIONS.source,
    SERIES_CRM_FILTER_DEFAULTS.source
  ),
  joinedWindow: normalizeFilterOption(
    filters.joinedWindow,
    FILTER_OPTIONS.joinedWindow,
    SERIES_CRM_FILTER_DEFAULTS.joinedWindow
  ),
  planType: normalizeFilterOption(
    filters.planType,
    FILTER_OPTIONS.planType,
    SERIES_CRM_FILTER_DEFAULTS.planType
  ),
  replayAccess: normalizeFilterOption(
    filters.replayAccess,
    FILTER_OPTIONS.replayAccess,
    SERIES_CRM_FILTER_DEFAULTS.replayAccess
  ),
  vipNetworking: normalizeFilterOption(
    filters.vipNetworking,
    FILTER_OPTIONS.vipNetworking,
    SERIES_CRM_FILTER_DEFAULTS.vipNetworking
  )
});

const matchesSearch = (entry, search) => {
  if (!search) {
    return true;
  }

  const haystack = [
    entry.attendeeName,
    entry.email,
    entry.planName
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return haystack.includes(String(search).toLowerCase());
};

const isJoinedWithinWindow = (joinedAt, windowLabel, now = Date.now()) => {
  if (!joinedAt) {
    return windowLabel === 'older';
  }

  const joinedTime = new Date(joinedAt).getTime();
  if (!Number.isFinite(joinedTime)) {
    return false;
  }

  const ageMs = Math.max(0, now - joinedTime);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  if (windowLabel === 'last_7_days') {
    return ageMs <= sevenDaysMs;
  }
  if (windowLabel === 'last_30_days') {
    return ageMs <= thirtyDaysMs;
  }
  if (windowLabel === 'older') {
    return ageMs > thirtyDaysMs;
  }

  return true;
};

const applySeriesCrmFilters = (audience = [], filters = {}, now = Date.now()) => {
  const normalized = normalizeSeriesCrmFilters(filters);

  return (Array.isArray(audience) ? audience : []).filter((entry) => {
    if (!matchesSearch(entry, normalized.search)) {
      return false;
    }

    if (normalized.source === 'self_join' && entry.source !== 'self_join') {
      return false;
    }
    if (normalized.source === 'organizer_grant' && entry.source !== 'organizer_grant') {
      return false;
    }

    if (!isJoinedWithinWindow(entry.joinedAt, normalized.joinedWindow, now)) {
      return false;
    }

    if (normalized.planType === 'paid' && !entry.isPaid) {
      return false;
    }
    if (normalized.planType === 'free' && entry.isPaid) {
      return false;
    }

    if (normalized.replayAccess === 'included' && !entry.includesReplayLibrary) {
      return false;
    }
    if (normalized.replayAccess === 'not-included' && entry.includesReplayLibrary) {
      return false;
    }

    if (normalized.vipNetworking === 'enabled' && !entry.vipNetworking) {
      return false;
    }
    if (normalized.vipNetworking === 'not-enabled' && entry.vipNetworking) {
      return false;
    }

    return true;
  });
};

const buildSeriesCrmSummary = (audience = [], now = Date.now()) => ({
  memberCount: audience.length,
  paidMemberCount: audience.filter((entry) => entry.isPaid).length,
  replayAccessCount: audience.filter((entry) => entry.includesReplayLibrary).length,
  vipNetworkingCount: audience.filter((entry) => entry.vipNetworking).length,
  recentJoinCount: audience.filter((entry) => isJoinedWithinWindow(entry.joinedAt, 'last_30_days', now)).length,
  organizerGrantedCount: audience.filter((entry) => entry.source === 'organizer_grant').length
});

module.exports = {
  SERIES_CRM_FILTER_DEFAULTS,
  applySeriesCrmFilters,
  buildSeriesCrmSummary,
  normalizeSeriesCrmFilters
};
