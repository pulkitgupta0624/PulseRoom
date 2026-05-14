import { EVENT_FONT_PAIRINGS, getEventFontPairing } from './eventTheme';

const DEFAULT_PRIMARY_COLOR = '#0f766e';
const DEFAULT_ACCENT_COLOR = '#b45309';
const DEFAULT_FONT_PAIRING = 'modern';
const DEFAULT_TEXT_COLOR = '#121212';
const DEFAULT_SAND_COLOR = '#f5efe4';
const DEFAULT_WHITE_COLOR = '#ffffff';

export const DEFAULT_ORGANIZER_BRANDING = Object.freeze({
  publicHandle: '',
  heroTitle: '',
  heroSubtitle: '',
  logoUrl: '',
  coverImageUrl: '',
  primaryColor: DEFAULT_PRIMARY_COLOR,
  accentColor: DEFAULT_ACCENT_COLOR,
  fontPairing: DEFAULT_FONT_PAIRING,
  ctaLabel: '',
  ctaUrl: ''
});

const normalizeThemeHex = (value, fallback) => {
  const input = String(value || '').trim();
  if (!input) {
    return fallback;
  }

  const normalized = input.startsWith('#') ? input : `#${input}`;
  if (/^#([0-9a-f]{3})$/i.test(normalized)) {
    return `#${normalized
      .slice(1)
      .split('')
      .map((item) => `${item}${item}`)
      .join('')
      .toLowerCase()}`;
  }

  return /^#([0-9a-f]{6})$/i.test(normalized) ? normalized.toLowerCase() : fallback;
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

const hexToRgb = (value) => {
  const hex = normalizeThemeHex(value, DEFAULT_TEXT_COLOR).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
};

const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`;

const mixColors = (firstColor, secondColor, ratio = 0.5) => {
  const safeRatio = Math.max(0, Math.min(1, Number(ratio)));
  const first = hexToRgb(firstColor);
  const second = hexToRgb(secondColor);

  return rgbToHex({
    r: first.r + (second.r - first.r) * safeRatio,
    g: first.g + (second.g - first.g) * safeRatio,
    b: first.b + (second.b - first.b) * safeRatio
  });
};

const toRgba = (value, alpha) => {
  const { r, g, b } = hexToRgb(value);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, Number(alpha || 0)))})`;
};

const toLuminanceChannel = (channel) => {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (value) => {
  const { r, g, b } = hexToRgb(value);
  return (
    0.2126 * toLuminanceChannel(r) +
    0.7152 * toLuminanceChannel(g) +
    0.0722 * toLuminanceChannel(b)
  );
};

const contrastRatio = (firstColor, secondColor) => {
  const first = relativeLuminance(firstColor);
  const second = relativeLuminance(secondColor);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
};

const getReadableTextColor = (backgroundColor) =>
  contrastRatio(backgroundColor, DEFAULT_WHITE_COLOR) >= contrastRatio(backgroundColor, DEFAULT_TEXT_COLOR)
    ? DEFAULT_WHITE_COLOR
    : DEFAULT_TEXT_COLOR;

export const normalizeOrganizerBranding = (branding = {}) => {
  const fontPairing = EVENT_FONT_PAIRINGS.some((pairing) => pairing.id === branding?.fontPairing)
    ? branding.fontPairing
    : DEFAULT_FONT_PAIRING;

  return {
    publicHandle: normalizeHandle(branding?.publicHandle),
    heroTitle: String(branding?.heroTitle || '').trim(),
    heroSubtitle: String(branding?.heroSubtitle || '').trim(),
    logoUrl: String(branding?.logoUrl || '').trim(),
    coverImageUrl: String(branding?.coverImageUrl || '').trim(),
    primaryColor: normalizeThemeHex(branding?.primaryColor, DEFAULT_PRIMARY_COLOR),
    accentColor: normalizeThemeHex(branding?.accentColor, DEFAULT_ACCENT_COLOR),
    fontPairing,
    ctaLabel: String(branding?.ctaLabel || '').trim(),
    ctaUrl: String(branding?.ctaUrl || '').trim()
  };
};

export const buildOrganizerBrandTheme = (branding = {}) => {
  const normalized = normalizeOrganizerBranding(branding);
  const fonts = getEventFontPairing(normalized.fontPairing);
  const heroBlend = mixColors(normalized.primaryColor, normalized.accentColor, 0.35);

  return {
    branding: normalized,
    fonts,
    styles: {
      '--organizer-primary': normalized.primaryColor,
      '--organizer-primary-soft': toRgba(normalized.primaryColor, 0.14),
      '--organizer-accent': normalized.accentColor,
      '--organizer-accent-soft': toRgba(normalized.accentColor, 0.16),
      '--organizer-shell': mixColors(normalized.primaryColor, DEFAULT_SAND_COLOR, 0.9),
      '--organizer-shell-strong': mixColors(normalized.accentColor, DEFAULT_WHITE_COLOR, 0.82),
      '--organizer-outline': mixColors(normalized.primaryColor, DEFAULT_WHITE_COLOR, 0.58),
      '--organizer-hero-start': mixColors(normalized.primaryColor, DEFAULT_TEXT_COLOR, 0.16),
      '--organizer-hero-end': mixColors(normalized.accentColor, DEFAULT_WHITE_COLOR, 0.12),
      '--organizer-hero-text': getReadableTextColor(heroBlend),
      '--organizer-heading-font': fonts.headingFont,
      '--organizer-body-font': fonts.bodyFont
    },
    heroBackground: `linear-gradient(135deg, ${mixColors(normalized.primaryColor, DEFAULT_TEXT_COLOR, 0.16)}, ${mixColors(normalized.accentColor, DEFAULT_WHITE_COLOR, 0.12)})`,
    cardBackground: `linear-gradient(135deg, ${toRgba(normalized.primaryColor, 0.16)}, ${toRgba(normalized.accentColor, 0.16)})`,
    tagBackground: toRgba(normalized.primaryColor, 0.12),
    tagColor: normalized.primaryColor
  };
};

export const getOrganizerPublicPath = (profileOrBranding, fallbackUserId = '') => {
  if (profileOrBranding?.publicHubPath) {
    return profileOrBranding.publicHubPath;
  }

  const sourceBranding = profileOrBranding?.organizerProfile?.branding || profileOrBranding;
  const branding = normalizeOrganizerBranding(sourceBranding || {});
  if (branding.publicHandle) {
    return `/studio/${branding.publicHandle}`;
  }

  const userId = profileOrBranding?.userId || fallbackUserId;
  return userId ? `/organizers/${userId}` : '/organizers';
};
