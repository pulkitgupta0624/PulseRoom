const DEFAULT_PRIMARY_COLOR = '#0f766e';
const DEFAULT_ACCENT_COLOR = '#b45309';
const DEFAULT_FONT_PAIRING = 'modern';
const DEFAULT_TEXT_COLOR = '#121212';
const DEFAULT_SAND_COLOR = '#f5efe4';
const DEFAULT_WHITE_COLOR = '#ffffff';

const FONT_PAIRINGS = Object.freeze({
  modern: {
    label: 'Modern Sans',
    headingFont: '"Space Grotesk", sans-serif',
    bodyFont: '"IBM Plex Sans", sans-serif'
  },
  editorial: {
    label: 'Editorial Serif',
    headingFont: '"Fraunces", serif',
    bodyFont: '"IBM Plex Sans", sans-serif'
  },
  contrast: {
    label: 'Contrast Serif',
    headingFont: '"DM Serif Display", serif',
    bodyFont: '"Plus Jakarta Sans", sans-serif'
  },
  crisp: {
    label: 'Crisp Sans',
    headingFont: '"Manrope", sans-serif',
    bodyFont: '"Plus Jakarta Sans", sans-serif'
  }
});

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

const hexToRgb = (value) => {
  const hex = normalizeHexColor(value, DEFAULT_TEXT_COLOR).slice(1);
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

const buildEventPageTheme = (input = {}) => {
  const primaryColor = normalizeHexColor(input.primaryColor, DEFAULT_PRIMARY_COLOR);
  const accentColor = normalizeHexColor(input.accentColor, DEFAULT_ACCENT_COLOR);
  const fontPairing = FONT_PAIRINGS[input.fontPairing] ? input.fontPairing : DEFAULT_FONT_PAIRING;
  const fonts = FONT_PAIRINGS[fontPairing];

  const bannerStartColor = mixColors(primaryColor, DEFAULT_TEXT_COLOR, 0.12);
  const bannerEndColor = mixColors(accentColor, DEFAULT_WHITE_COLOR, 0.15);
  const surfaceColor = mixColors(primaryColor, DEFAULT_SAND_COLOR, 0.9);
  const surfaceStrongColor = mixColors(accentColor, DEFAULT_SAND_COLOR, 0.84);
  const outlineColor = mixColors(primaryColor, DEFAULT_WHITE_COLOR, 0.62);
  const bannerTextColor = getReadableTextColor(mixColors(primaryColor, accentColor, 0.35));

  const cssVariables = [
    `--event-primary:${primaryColor}`,
    `--event-primary-soft:${toRgba(primaryColor, 0.14)}`,
    `--event-primary-strong:${bannerStartColor}`,
    `--event-accent:${accentColor}`,
    `--event-accent-soft:${toRgba(accentColor, 0.16)}`,
    `--event-banner-start:${bannerStartColor}`,
    `--event-banner-end:${bannerEndColor}`,
    `--event-surface:${surfaceColor}`,
    `--event-surface-strong:${surfaceStrongColor}`,
    `--event-outline:${outlineColor}`,
    `--event-banner-text:${bannerTextColor}`,
    `--event-heading-font:${fonts.headingFont}`,
    `--event-body-font:${fonts.bodyFont}`
  ].join(';');

  return {
    primaryColor,
    accentColor,
    fontPairing,
    cssVariables
  };
};

module.exports = {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_FONT_PAIRING,
  DEFAULT_PRIMARY_COLOR,
  FONT_PAIRINGS,
  buildEventPageTheme,
  contrastRatio,
  normalizeHexColor
};
