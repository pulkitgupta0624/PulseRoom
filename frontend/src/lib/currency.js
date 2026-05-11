const COMMON_CURRENCIES = [
  { code: 'INR', label: 'INR - Indian Rupee' },
  { code: 'USD', label: 'USD - US Dollar' },
  { code: 'EUR', label: 'EUR - Euro' },
  { code: 'GBP', label: 'GBP - British Pound' },
  { code: 'AED', label: 'AED - UAE Dirham' },
  { code: 'SGD', label: 'SGD - Singapore Dollar' },
  { code: 'AUD', label: 'AUD - Australian Dollar' },
  { code: 'CAD', label: 'CAD - Canadian Dollar' }
];

const LOCALE_REGION_TO_CURRENCY = {
  IN: 'INR',
  US: 'USD',
  GB: 'GBP',
  IE: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  BE: 'EUR',
  AE: 'AED',
  SG: 'SGD',
  AU: 'AUD',
  CA: 'CAD'
};

const normalizeCurrencyCode = (value, fallback = 'INR') =>
  String(value || fallback)
    .trim()
    .toUpperCase();

const parseCurrencyCodesInput = (value) => {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[\s,]+/);

  const currencies = rawValues
    .map((currency) => normalizeCurrencyCode(currency))
    .filter((currency) => /^[A-Z]{3}$/.test(currency));

  return [...new Set(currencies.length ? currencies : ['INR'])];
};

const getViewerLocale = () => {
  if (typeof navigator === 'undefined') {
    return 'en-IN';
  }

  return navigator.languages?.[0] || navigator.language || 'en-IN';
};

const inferPreferredCurrency = ({
  acceptedCurrencies = [],
  fallbackCurrency = 'INR',
  locale = getViewerLocale()
}) => {
  const normalizedAcceptedCurrencies = acceptedCurrencies.map((currency) =>
    normalizeCurrencyCode(currency)
  );
  const region = locale.split('-')[1]?.toUpperCase();
  const regionCurrency = region ? LOCALE_REGION_TO_CURRENCY[region] : null;

  if (regionCurrency && normalizedAcceptedCurrencies.includes(regionCurrency)) {
    return regionCurrency;
  }

  const normalizedFallbackCurrency = normalizeCurrencyCode(fallbackCurrency);
  if (normalizedAcceptedCurrencies.includes(normalizedFallbackCurrency)) {
    return normalizedFallbackCurrency;
  }

  return normalizedAcceptedCurrencies[0] || normalizedFallbackCurrency;
};

export {
  COMMON_CURRENCIES,
  normalizeCurrencyCode,
  parseCurrencyCodesInput,
  getViewerLocale,
  inferPreferredCurrency
};
