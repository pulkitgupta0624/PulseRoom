const {
  buildSponsorRecordFromApplication,
  buildSponsorRevenueSummary,
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

  test('buildSponsorRecordFromApplication preserves booth funnel metrics on updates', () => {
    const nextSponsor = buildSponsorRecordFromApplication({
      application: {
        sponsorId: 'sponsor-1',
        packageName: 'Gold',
        companyName: 'Visible Co',
        price: 4000,
        currency: 'USD'
      },
      sponsorPackage: {
        packageId: 'gold-1',
        tier: 'gold',
        name: 'Gold',
        currency: 'USD'
      },
      existingSponsor: {
        sponsorId: 'sponsor-1',
        metrics: {
          boothViews: 18,
          boothClicks: 7,
          leadsCaptured: 3
        }
      }
    });

    expect(nextSponsor.metrics).toEqual({
      boothViews: 18,
      boothClicks: 7,
      leadsCaptured: 3
    });
  });

  test('buildSponsorRevenueSummary includes booth funnel totals', () => {
    const summary = buildSponsorRevenueSummary([
      {
        status: 'active',
        paymentStatus: 'paid',
        featuredCallout: true,
        price: 5000,
        metrics: {
          boothViews: 22,
          boothClicks: 9,
          leadsCaptured: 4
        }
      },
      {
        status: 'approved',
        paymentStatus: 'unpaid',
        featuredCallout: false,
        price: 2500,
        metrics: {
          boothViews: 8,
          boothClicks: 2,
          leadsCaptured: 1
        }
      }
    ]);

    expect(summary.boothViews).toBe(30);
    expect(summary.boothClicks).toBe(11);
    expect(summary.leadsCaptured).toBe(5);
    expect(summary.activeSponsors).toBe(1);
    expect(summary.paidSponsors).toBe(1);
  });

  test('an activated paid sponsor becomes publicly visible as a booth placement', () => {
    const activatedSponsor = buildSponsorRecordFromApplication({
      application: {
        sponsorId: 'sponsor-2',
        packageName: 'Gold Booth',
        packageId: 'pkg-gold',
        companyName: 'Booth Co',
        boothUrl: 'https://booth.example.com',
        websiteUrl: 'https://booth.example.com/site',
        description: 'Launch partner',
        price: 7500,
        currency: 'INR'
      },
      sponsorPackage: {
        packageId: 'pkg-gold',
        tier: 'gold',
        name: 'Gold Booth',
        currency: 'INR',
        showOnEventPage: true,
        showInLiveRoom: true
      },
      overrides: {
        status: 'active',
        paymentStatus: 'paid',
        showOnEventPage: true,
        showInLiveRoom: true
      }
    });

    const visibleSponsors = filterSponsorsForViewer([activatedSponsor], {
      viewerIsOwner: false
    });

    expect(visibleSponsors).toHaveLength(1);
    expect(visibleSponsors[0]).toMatchObject({
      sponsorId: 'sponsor-2',
      companyName: 'Booth Co',
      status: 'active',
      boothUrl: 'https://booth.example.com'
    });
    expect(visibleSponsors[0].paymentStatus).toBeUndefined();
  });
});
