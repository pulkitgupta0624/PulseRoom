const { buildBookingAnalytics } = require('./analyticsService');

describe('buildBookingAnalytics', () => {
  it('counts only checked-in seats when ticket-level state is present', () => {
    const analytics = buildBookingAnalytics({
      days: 30,
      bookings: [
        {
          eventId: 'event-1',
          eventSnapshot: {
            title: 'Summit'
          },
          amount: 240,
          pricing: {
            reportingAmount: 240
          },
          quantity: 2,
          createdAt: '2026-05-01T10:00:00.000Z',
          confirmedAt: '2026-05-01T10:05:00.000Z',
          tickets: [
            {
              ticketId: 'ticket-1a',
              position: 1,
              checkedInAt: '2026-05-01T11:00:00.000Z'
            },
            {
              ticketId: 'ticket-1b',
              position: 2,
              checkedInAt: null
            }
          ]
        }
      ]
    });

    expect(analytics.totals).toMatchObject({
      confirmedBookings: 1,
      attendees: 2,
      checkedIns: 1,
      revenue: 240
    });
    expect(analytics.topEvents[0]).toMatchObject({
      eventId: 'event-1',
      attendees: 2,
      bookings: 1
    });
  });
});
