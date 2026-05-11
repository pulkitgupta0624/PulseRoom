const {
  buildEventBookingsCsv,
  buildOrganizerGrowthDashboard
} = require('./organizerGrowthService');

describe('buildOrganizerGrowthDashboard', () => {
  it('builds funnel, geography, milestones, and booking-rate summaries', () => {
    const dashboard = buildOrganizerGrowthDashboard({
      events: [
        {
          _id: 'event-1',
          title: 'Growth Summit',
          analytics: {
            views: 180
          }
        },
        {
          _id: 'event-2',
          title: 'Creator Circle',
          analytics: {
            views: 60
          }
        }
      ],
      bookings: [
        {
          _id: 'booking-pending',
          eventId: 'event-1',
          bookingNumber: 'BK-100',
          status: 'pending',
          quantity: 1,
          amount: 120,
          pricing: {
            reportingAmount: 120,
            reportingCurrency: 'USD'
          },
          attendee: {
            name: 'Pending Guest',
            email: 'pending@example.com'
          },
          createdAt: '2026-04-30T06:00:00.000Z',
          eventSnapshot: {
            title: 'Growth Summit'
          },
          userId: 'user-pending'
        },
        {
          _id: 'booking-1',
          eventId: 'event-1',
          bookingNumber: 'BK-101',
          status: 'confirmed',
          quantity: 2,
          amount: 240,
          pricing: {
            reportingAmount: 240,
            reportingCurrency: 'USD'
          },
          attendee: {
            name: 'Alex',
            email: 'alex@example.com'
          },
          confirmedAt: '2026-05-01T11:15:00.000Z',
          checkedInAt: '2026-05-01T12:00:00.000Z',
          createdAt: '2026-05-01T11:00:00.000Z',
          eventSnapshot: {
            title: 'Growth Summit'
          },
          userId: 'user-1'
        },
        {
          _id: 'booking-2',
          eventId: 'event-2',
          bookingNumber: 'BK-102',
          status: 'confirmed',
          quantity: 1,
          amount: 180,
          pricing: {
            reportingAmount: 180,
            reportingCurrency: 'USD'
          },
          attendee: {
            name: 'Morgan',
            email: 'morgan@example.com'
          },
          confirmedAt: '2026-05-01T11:40:00.000Z',
          createdAt: '2026-05-01T11:20:00.000Z',
          eventSnapshot: {
            title: 'Creator Circle'
          },
          userId: 'user-2'
        },
        {
          _id: 'booking-3',
          eventId: 'event-2',
          bookingNumber: 'BK-103',
          status: 'confirmed',
          quantity: 1,
          amount: 90,
          pricing: {
            reportingAmount: 90,
            reportingCurrency: 'USD'
          },
          attendee: {
            name: 'Taylor',
            email: 'taylor@example.com'
          },
          confirmedAt: '2026-05-01T10:20:00.000Z',
          createdAt: '2026-05-01T10:05:00.000Z',
          eventSnapshot: {
            title: 'Creator Circle'
          },
          userId: 'user-3'
        }
      ],
      userLocations: [
        { userId: 'user-1', location: 'Bengaluru, India' },
        { userId: 'user-2', location: 'London, UK' },
        { userId: 'user-3', location: 'London, UK' }
      ],
      reportingCurrency: 'USD',
      now: '2026-05-01T12:00:00.000Z'
    });

    expect(dashboard.summary).toMatchObject({
      activeEvents: 2,
      pageViews: 240,
      bookingStarted: 4,
      confirmedBookings: 3,
      revenue: 510,
      attendees: 4,
      checkedIns: 2
    });
    expect(dashboard.funnel).toMatchObject({
      pageViews: 240,
      bookingStarted: 4,
      confirmedBookings: 3,
      viewToStartRate: 1.7,
      startToConfirmRate: 75,
      viewToConfirmRate: 1.3
    });
    expect(dashboard.milestones).toMatchObject({
      lastReached: 500,
      next: 1000
    });
    expect(dashboard.bookingRate).toMatchObject({
      currentWindowCount: 2,
      previousWindowCount: 1,
      doubled: true,
      growthFactor: 2
    });
    expect(dashboard.geography).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          location: 'London, UK',
          attendees: 2,
          bookings: 2,
          share: 50
        }),
        expect.objectContaining({
          location: 'Bengaluru, India',
          attendees: 2,
          bookings: 1,
          share: 50
        })
      ])
    );
    expect(dashboard.eventBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: 'event-1',
          views: 180,
          bookingStarted: 2,
          confirmedBookings: 1
        }),
        expect.objectContaining({
          eventId: 'event-2',
          views: 60,
          bookingStarted: 2,
          confirmedBookings: 2
        })
      ])
    );
    expect(dashboard.recentBookings[0]).toMatchObject({
      bookingId: 'booking-2',
      attendeeLocation: 'London, UK'
    });
  });
});

describe('buildEventBookingsCsv', () => {
  it('exports booking rows with attendee location enrichment', () => {
    const csv = buildEventBookingsCsv({
      event: {
        _id: 'event-1',
        title: 'Growth Summit'
      },
      bookings: [
        {
          _id: 'booking-1',
          bookingNumber: 'BK-101',
          status: 'confirmed',
          eventId: 'event-1',
          userId: 'user-1',
          attendee: {
            name: 'Alex',
            email: 'alex@example.com'
          },
          tierId: 'vip',
          tierName: 'VIP',
          quantity: 2,
          amount: 240,
          currency: 'USD',
          pricing: {
            reportingAmount: 240,
            reportingCurrency: 'USD'
          },
          promoCode: {
            code: 'LAUNCH',
            discountAmount: 10
          },
          referral: {
            code: 'FRIEND',
            discountAmount: 15
          },
          createdAt: '2026-05-01T10:00:00.000Z',
          confirmedAt: '2026-05-01T10:05:00.000Z',
          checkedInAt: null,
          cancelledAt: null,
          refundedAt: null,
          invoice: {
            invoiceNumber: 'INV-101'
          }
        }
      ],
      userLocations: [{ userId: 'user-1', location: 'Bengaluru, India' }],
      reportingCurrency: 'USD'
    });

    expect(csv).toContain('attendeeLocation');
    expect(csv).toContain('Bengaluru, India');
    expect(csv).toContain('INV-101');
    expect(csv).toContain('LAUNCH');
  });
});
