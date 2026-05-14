const DEFAULT_PRIMARY_COLOR = '#0f766e';
const DEFAULT_ACCENT_COLOR = '#b45309';
const DEFAULT_FONT_PAIRING = 'modern';

const FONT_PAIRINGS = new Set(['modern', 'editorial', 'contrast', 'crisp']);

const normalizeHexColor = (value, fallback) => {
  const input = String(value || '').trim();
  if (!input) {
    return fallback;
  }

  const normalized = input.startsWith('#') ? input : `#${input}`;
  const isShortHex = /^#([0-9a-f]{3})$/i.test(normalized);
  if (isShortHex) {
    return `#${normalized
      .slice(1)
      .split('')
      .map((item) => `${item}${item}`)
      .join('')
      .toLowerCase()}`;
  }

  if (/^#([0-9a-f]{6})$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  return fallback;
};

const normalizeHandle = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

const normalizeOrganizerBranding = (branding = {}) => {
  const fontPairing = FONT_PAIRINGS.has(branding?.fontPairing)
    ? branding.fontPairing
    : DEFAULT_FONT_PAIRING;

  return {
    publicHandle: normalizeHandle(branding?.publicHandle),
    heroTitle: String(branding?.heroTitle || '').trim(),
    heroSubtitle: String(branding?.heroSubtitle || '').trim(),
    logoUrl: String(branding?.logoUrl || '').trim(),
    coverImageUrl: String(branding?.coverImageUrl || '').trim(),
    primaryColor: normalizeHexColor(branding?.primaryColor, DEFAULT_PRIMARY_COLOR),
    accentColor: normalizeHexColor(branding?.accentColor, DEFAULT_ACCENT_COLOR),
    fontPairing,
    ctaLabel: String(branding?.ctaLabel || '').trim(),
    ctaUrl: String(branding?.ctaUrl || '').trim()
  };
};

const normalizeOrganizerProfile = (organizerProfile = {}) => ({
  companyName: String(organizerProfile?.companyName || '').trim(),
  website: String(organizerProfile?.website || '').trim(),
  supportEmail: String(organizerProfile?.supportEmail || '').trim().toLowerCase(),
  branding: normalizeOrganizerBranding(organizerProfile?.branding || {})
});

const buildOrganizerHubPath = (profile = {}) => {
  const branding = normalizeOrganizerBranding(profile?.organizerProfile?.branding || {});
  if (branding.publicHandle) {
    return `/studio/${branding.publicHandle}`;
  }

  return profile?.userId ? `/organizers/${profile.userId}` : '/organizers';
};

const serializePublicProfile = (profile) => {
  if (!profile) {
    return null;
  }

  const raw = typeof profile.toObject === 'function' ? profile.toObject() : { ...profile };
  const organizerProfile = normalizeOrganizerProfile(raw.organizerProfile || {});

  return {
    ...raw,
    organizerProfile,
    publicHubPath: buildOrganizerHubPath({
      ...raw,
      organizerProfile
    })
  };
};

module.exports = {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_FONT_PAIRING,
  DEFAULT_PRIMARY_COLOR,
  buildOrganizerHubPath,
  normalizeHandle,
  normalizeHexColor,
  normalizeOrganizerBranding,
  normalizeOrganizerProfile,
  serializePublicProfile
};
