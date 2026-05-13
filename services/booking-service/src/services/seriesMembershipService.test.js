const {
  buildTicketAccessEntitlements,
  resolveSeriesMembershipBenefit,
  selectBestDiscount
} = require('./seriesMembershipService');

describe('seriesMembershipService', () => {
  it('builds an active membership benefit snapshot with discount math', () => {
    const benefit = resolveSeriesMembershipBenefit({
      entitlement: {
        active: true,
        membership: {
          _id: 'member-1',
          seriesId: 'series-1',
          perks: {
            planName: 'All Access',
            discountPercent: 15,
            earlyAccessHours: 48,
            membersOnlyBooking: true
          }
        }
      },
      subtotal: 200
    });

    expect(benefit).toMatchObject({
      active: true,
      membershipId: 'member-1',
      seriesId: 'series-1',
      planName: 'All Access',
      discountPercent: 15,
      earlyAccessHours: 48,
      membersOnlyBooking: true,
      discountBaseAmount: 30
    });
  });

  it('merges membership early access into ticket entitlements', () => {
    const entitlements = buildTicketAccessEntitlements({
      membershipBenefit: {
        active: true,
        earlyAccessHours: 36
      }
    });

    expect(entitlements).toEqual({
      perks: {
        earlyAccess: {
          unlocked: true,
          windowHours: 36
        }
      }
    });
  });

  it('prefers the largest available discount and breaks ties toward promo', () => {
    const bestMembership = selectBestDiscount({
      membershipBenefit: {
        discountBaseAmount: 20
      },
      referralDiscountBaseAmount: 12,
      promoDiscountBaseAmount: 20
    });

    expect(bestMembership).toEqual({
      source: 'promo',
      discountBaseAmount: 20
    });
  });
});
