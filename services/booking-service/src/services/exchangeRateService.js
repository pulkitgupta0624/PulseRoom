const ONE_HOUR_MS = 60 * 60 * 1000;

const normalizeCurrencyCode = (value, fallback = 'USD') =>
  String(value || fallback)
    .trim()
    .toUpperCase();

const createExchangeRateService = ({
  cache,
  logger,
  fetchImpl = global.fetch,
  baseUrl = 'https://open.er-api.com/v6/latest',
  staleAfterMs = ONE_HOUR_MS
}) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required for exchange-rate lookups');
  }

  const getCacheKey = (baseCurrency) => `exchange-rates:${normalizeCurrencyCode(baseCurrency)}`;

  const parseCachedPayload = (cachedValue) => {
    if (!cachedValue) {
      return null;
    }

    try {
      return JSON.parse(cachedValue);
    } catch (_error) {
      return null;
    }
  };

  const isFresh = (payload) => {
    if (!payload?.fetchedAt) {
      return false;
    }

    return Date.now() - new Date(payload.fetchedAt).getTime() < staleAfterMs;
  };

  const fetchLatestRates = async (baseCurrency) => {
    const normalizedBaseCurrency = normalizeCurrencyCode(baseCurrency);
    const response = await fetchImpl(`${baseUrl}/${normalizedBaseCurrency}`);
    if (!response.ok) {
      throw new Error(`Exchange-rate lookup failed for ${normalizedBaseCurrency}`);
    }

    const payload = await response.json();
    if (payload?.result !== 'success' || !payload?.rates) {
      throw new Error(`Exchange-rate payload invalid for ${normalizedBaseCurrency}`);
    }

    return {
      baseCode: payload.base_code || normalizedBaseCurrency,
      rates: payload.rates,
      provider: payload.provider || null,
      fetchedAt: new Date().toISOString(),
      sourceUpdatedAt: payload.time_last_update_utc || null,
      nextUpdateAt: payload.time_next_update_utc || null
    };
  };

  const storeRates = async (baseCurrency, payload) => {
    await cache.set(
      getCacheKey(baseCurrency),
      JSON.stringify(payload),
      'EX',
      Math.ceil(staleAfterMs / 1000) + 60
    );

    return payload;
  };

  const getRates = async (baseCurrency, { forceRefresh = false } = {}) => {
    const normalizedBaseCurrency = normalizeCurrencyCode(baseCurrency);
    const cached = parseCachedPayload(await cache.get(getCacheKey(normalizedBaseCurrency)));

    if (!forceRefresh && isFresh(cached)) {
      return cached;
    }

    try {
      const fresh = await fetchLatestRates(normalizedBaseCurrency);
      return storeRates(normalizedBaseCurrency, fresh);
    } catch (error) {
      if (cached?.rates) {
        logger?.warn?.({
          message: 'Using stale exchange-rate cache after refresh failure',
          baseCurrency: normalizedBaseCurrency,
          error: error.message
        });
        return cached;
      }

      throw error;
    }
  };

  const getExchangeRate = async ({ fromCurrency, toCurrency }) => {
    const from = normalizeCurrencyCode(fromCurrency);
    const to = normalizeCurrencyCode(toCurrency);

    if (from === to) {
      return 1;
    }

    const payload = await getRates(from);
    const rate = Number(payload?.rates?.[to]);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Unsupported currency conversion: ${from} -> ${to}`);
    }

    return rate;
  };

  const refreshCurrencies = async (currencies = []) => {
    const uniqueCurrencies = [
      ...new Set(currencies.map((currency) => normalizeCurrencyCode(currency)).filter(Boolean))
    ];
    await Promise.all(
      uniqueCurrencies.map((currency) => getRates(currency, { forceRefresh: true }))
    );
  };

  return {
    normalizeCurrencyCode,
    getRates,
    getExchangeRate,
    refreshCurrencies
  };
};

module.exports = {
  ONE_HOUR_MS,
  createExchangeRateService,
  normalizeCurrencyCode
};
