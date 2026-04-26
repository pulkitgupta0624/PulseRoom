const { buildReferralAnalytics } = require('./referralAnalyticsService');

describe('buildReferralAnalytics', () => {
  it('aggregates referral performance across events', () => {
    const events = [
      {
        _id: 'event-1',
        title: 'Launch Night',
        referral: { code: 'launch-night-1234abcd', clicks: 10, status: 'active', discountType: 'percentage', discountValue: 10 },
        referralLink: 'http://localhost:5173/events/event-1?ref=launch-night-1234abcd'
      },
      {
        _id: 'event-2',
        title: 'Builder Meetup',
        referral: { code: 'builder-meet-5678efgh', clicks: 4, status: 'active', discountType: 'percentage', discountValue: 15 },
        referralLink: 'http://localhost:5173/events/event-2?ref=builder-meet-5678efgh'
      }
    ];

    const bookings = [
      {
        eventId: 'event-1',
        amount: 2500,
        quantity: 2,
        createdAt: '2026-04-20T10:00:00.000Z',
        confirmedAt: '2026-04-20T10:05:00.000Z',
        referral: { code: 'launch-night-1234abcd', discountAmount: 250, discountType: 'percentage', discountValue: 10 },
        eventSnapshot: { title: 'Launch Night' }
      },
      {
        eventId: 'event-1',
        amount: 1250,
        quantity: 1,
        createdAt: '2026-04-21T10:00:00.000Z',
        confirmedAt: '2026-04-21T10:05:00.000Z',
        referral: { code: 'launch-night-1234abcd', discountAmount: 125, discountType: 'percentage', discountValue: 10 },
        eventSnapshot: { title: 'Launch Night' }
      },
      {
        eventId: 'event-2',
        amount: 1500,
        quantity: 3,
        createdAt: '2026-04-21T12:00:00.000Z',
        confirmedAt: '2026-04-21T12:05:00.000Z',
        referral: { code: 'builder-meet-5678efgh', discountAmount: 225, discountType: 'percentage', discountValue: 15 },
        eventSnapshot: { title: 'Builder Meetup' }
      }
    ];

    const analytics = buildReferralAnalytics({
      bookings,
      events,
      days: 30
    });

    expect(analytics.totals).toMatchObject({
      activeReferralLinks: 2,
      linkOpens: 14,
      referredBookings: 3,
      ticketsSold: 6,
      revenue: 5250,
      discountsGiven: 600,
      conversionRate: 21.4
    });

    expect(analytics.events[0]).toMatchObject({
      eventId: 'event-1',
      referredBookings: 2,
      ticketsSold: 3,
      revenue: 3750,
      discountsGiven: 375,
      conversionRate: 20
    });

    expect(analytics.events[1]).toMatchObject({
      eventId: 'event-2',
      referredBookings: 1,
      ticketsSold: 3,
      revenue: 1500,
      discountsGiven: 225,
      conversionRate: 25
    });
  });
});
