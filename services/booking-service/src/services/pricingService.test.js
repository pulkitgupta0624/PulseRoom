const {
  buildAcceptedCurrencies,
  resolveSettlementCurrency,
  calculatePricingBreakdown
} = require('./pricingService');

describe('pricingService', () => {
  it('includes the tier base currency in accepted currencies', () => {
    expect(
      buildAcceptedCurrencies({
        event: { acceptedCurrencies: ['usd', 'gbp'] },
        tier: { currency: 'INR' }
      })
    ).toEqual(['USD', 'GBP', 'INR']);
  });

  it('resolves the selected settlement currency only when accepted', () => {
    expect(
      resolveSettlementCurrency({
        event: { acceptedCurrencies: ['USD', 'GBP'] },
        tier: { currency: 'INR' },
        requestedCurrency: 'gbp'
      })
    ).toMatchObject({
      settlementCurrency: 'GBP',
      isAccepted: true
    });
  });

  it('calculates settlement totals, tax, and reporting amounts', async () => {
    const pricing = await calculatePricingBreakdown({
      quantity: 2,
      subtotalBaseAmount: 2000,
      discountBaseAmount: 200,
      baseCurrency: 'INR',
      settlementCurrency: 'USD',
      taxRule: {
        country: 'IN',
        label: 'GST',
        rate: 18,
        registrationNumber: 'GST-IN-2026'
      },
      taxRegistrationNumber: 'GST-IN-2026',
      reportingCurrency: 'USD',
      exchangeRateService: {
        async getExchangeRate({ fromCurrency, toCurrency }) {
          if (fromCurrency === toCurrency) {
            return 1;
          }

          if (fromCurrency === 'INR' && toCurrency === 'USD') {
            return 0.012;
          }

          throw new Error('unexpected rate lookup');
        }
      }
    });

    expect(pricing).toMatchObject({
      baseCurrency: 'INR',
      settlementCurrency: 'USD',
      taxLabel: 'GST',
      taxRate: 18,
      registrationNumber: 'GST-IN-2026'
    });
    expect(pricing.subtotal).toBe(24);
    expect(pricing.discountAmount).toBe(2.4);
    expect(pricing.taxAmount).toBe(3.89);
    expect(pricing.total).toBe(25.49);
    expect(pricing.reportingAmount).toBe(25.49);
  });
});
