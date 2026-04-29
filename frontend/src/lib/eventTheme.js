export const EVENT_FONT_PAIRINGS = [
  {
    id: 'modern',
    label: 'Modern Sans',
    headingFont: '"Space Grotesk", sans-serif',
    bodyFont: '"IBM Plex Sans", sans-serif'
  },
  {
    id: 'editorial',
    label: 'Editorial Serif',
    headingFont: '"Fraunces", serif',
    bodyFont: '"IBM Plex Sans", sans-serif'
  },
  {
    id: 'contrast',
    label: 'Contrast Serif',
    headingFont: '"DM Serif Display", serif',
    bodyFont: '"Plus Jakarta Sans", sans-serif'
  },
  {
    id: 'crisp',
    label: 'Crisp Sans',
    headingFont: '"Manrope", sans-serif',
    bodyFont: '"Plus Jakarta Sans", sans-serif'
  }
];

export const DEFAULT_EVENT_THEME = Object.freeze({
  primaryColor: '#0f766e',
  accentColor: '#b45309',
  fontPairing: 'modern'
});

const normalizeThemeHex = (value, fallback) => {
  const input = String(value || '').trim();
  if (!input) {
    return fallback;
  }

  return input.startsWith('#') ? input : `#${input}`;
};

export const normalizeEventTheme = (theme = {}) => {
  const fontPairing = EVENT_FONT_PAIRINGS.some((pairing) => pairing.id === theme?.fontPairing)
    ? theme.fontPairing
    : DEFAULT_EVENT_THEME.fontPairing;

  return {
    primaryColor: normalizeThemeHex(theme?.primaryColor, DEFAULT_EVENT_THEME.primaryColor),
    accentColor: normalizeThemeHex(theme?.accentColor, DEFAULT_EVENT_THEME.accentColor),
    fontPairing
  };
};

export const parseCssVariablesBlob = (blob) =>
  String(blob || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((styles, entry) => {
      const separatorIndex = entry.indexOf(':');
      if (separatorIndex === -1) {
        return styles;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (!key || !value) {
        return styles;
      }

      styles[key] = value;
      return styles;
    }, {});

export const getEventFontPairing = (fontPairingId) =>
  EVENT_FONT_PAIRINGS.find((pairing) => pairing.id === fontPairingId) || EVENT_FONT_PAIRINGS[0];
