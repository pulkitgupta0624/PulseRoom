const { createExchangeRateService } = require('./exchangeRateService');

const createMemoryCache = () => {
  const store = new Map();
  return {
    async get(key) {
      return store.get(key) || null;
    },
    async set(key, value) {
      store.set(key, value);
      return 'OK';
    }
  };
};

describe('exchangeRateService', () => {
  it('caches successful responses and converts across currencies', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      async json() {
        return {
          result: 'success',
          base_code: 'INR',
          rates: {
            INR: 1,
            USD: 0.012,
            GBP: 0.009
          }
        };
      }
    });
    const service = createExchangeRateService({
      cache: createMemoryCache(),
      fetchImpl,
      logger: { warn: jest.fn() }
    });

    const usdRate = await service.getExchangeRate({
      fromCurrency: 'INR',
      toCurrency: 'USD'
    });
    const gbpRate = await service.getExchangeRate({
      fromCurrency: 'INR',
      toCurrency: 'GBP'
    });

    expect(usdRate).toBe(0.012);
    expect(gbpRate).toBe(0.009);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
