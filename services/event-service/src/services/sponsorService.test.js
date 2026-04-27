const {
  calculateSponsorRevenueBreakdown,
  filterSponsorsForViewer,
  syncSponsorPackageSlots
} = require('./sponsorService');

describe('sponsorService', () => {
  test('calculateSponsorRevenueBreakdown applies the configured fee split', () => {
    expect(calculateSponsorRevenueBreakdown({ price: 25000, platformFeePercent: 5 })).toEqual({
      grossAmount: 25000,
      platformFeePercent: 5,
      platformFeeAmount: 1250,
      organizerNetAmount: 23750
    });
  });

  test('syncSponsorPackageSlots counts approved and active sponsors only', () => {
    const event = {
      sponsorPackages: [
        {
          packageId: 'gold-1',
          tier: 'gold',
          name: 'Gold',
          maxSlots: 4,
          slotsUsed: 0
        }
      ],
      sponsors: [
        { packageId: 'gold-1', status: 'pending' },
        { packageId: 'gold-1', status: 'approved' },
        { packageId: 'gold-1', status: 'active' },
        { packageId: 'gold-1', status: 'rejected' }
      ]
    };

    syncSponsorPackageSlots(event);

    expect(event.sponsorPackages[0].slotsUsed).toBe(2);
  });

  test('filterSponsorsForViewer hides unpaid and inactive sponsors from public viewers', () => {
    const sponsors = [
      {
        sponsorId: 'one',
        tier: 'gold',
        packageName: 'Gold',
        companyName: 'Visible Co',
        logoUrl: 'https://example.com/logo.png',
        description: 'Visible sponsor',
        boothUrl: 'https://example.com/booth',
        websiteUrl: 'https://example.com',
        showOnEventPage: true,
        showInLiveRoom: true,
        showInEmails: true,
        featuredCallout: true,
        status: 'active',
        paymentStatus: 'paid'
      },
      {
        sponsorId: 'two',
        tier: 'silver',
        packageName: 'Silver',
        companyName: 'Hidden Co',
        status: 'approved',
        paymentStatus: 'unpaid',
        showOnEventPage: true,
        showInLiveRoom: true,
        showInEmails: false
      }
    ];

    const visibleSponsors = filterSponsorsForViewer(sponsors, {
      viewerIsOwner: false
    });

    expect(visibleSponsors).toHaveLength(1);
    expect(visibleSponsors[0].companyName).toBe('Visible Co');
    expect(visibleSponsors[0].paymentStatus).toBeUndefined();
  });
});
