const {
  assertPromoCanBeApplied,
  buildPromoCodeRecord,
  calculatePromoDiscountAmount,
  normalizePromoCode
} = require('./promoCodeService');

describe('promoCodeService', () => {
  it('normalizes promo codes consistently', () => {
    expect(normalizePromoCode(' earlybird 20 ')).toBe('EARLYBIRD20');
  });

  it('calculates percentage discounts', () => {
    expect(
      calculatePromoDiscountAmount({
        subtotal: 1000,
        promoCode: {
          discountType: 'percentage',
          discountValue: 20
        }
      })
    ).toBe(200);
  });

  it('blocks promo codes that do not match the selected tier', () => {
    const promoCode = buildPromoCodeRecord({
      code: 'speaker50',
      discountType: 'percentage',
      discountValue: 50,
      maxRedemptions: 10,
      appliesToTierIds: ['vip-tier']
    });

    expect(() =>
      assertPromoCanBeApplied({
        promoCode,
        tierId: 'general-tier'
      })
    ).toThrow('This promo code does not apply to the selected ticket tier');
  });
});
