const {
  buildCrmAudienceEntry,
  buildCrmAudienceSnapshot,
  countAgendaSessionsByStatus
} = require('./crmAudienceService');

describe('crmAudienceService', () => {
  test('countAgendaSessionsByStatus only counts matching session reservation states', () => {
    expect(
      countAgendaSessionsByStatus(
        {
          savedAgenda: {
            sessions: [
              { registrationStatus: 'registered' },
              { registrationStatus: 'waitlisted' },
              { registrationStatus: 'registered' }
            ]
          }
        },
        'registered'
      )
    ).toBe(2);
  });

  test('buildCrmAudienceEntry derives booking and session CRM signals', () => {
    const entry = buildCrmAudienceEntry({
      _id: 'booking-1',
      userId: 'user-1',
      tierId: 'vip',
      tierName: 'VIP',
      quantity: 2,
      attendee: {
        name: 'Asha',
        email: 'asha@example.com'
      },
      confirmedAt: '2026-05-10T10:00:00.000Z',
      checkedInAt: '2026-05-10T11:00:00.000Z',
      tickets: [
        {
          checkedInAt: '2026-05-10T11:00:00.000Z'
        },
        {
          checkedInAt: null
        }
      ],
      referral: {
        code: 'FRIEND50'
      },
      savedAgenda: {
        sessions: [
          { registrationStatus: 'registered' },
          { registrationStatus: 'waitlisted' },
          { registrationStatus: 'saved' }
        ]
      }
    });

    expect(entry).toMatchObject({
      bookingId: 'booking-1',
      userId: 'user-1',
      attendeeName: 'Asha',
      email: 'asha@example.com',
      tierName: 'VIP',
      ticketCount: 2,
      checkedInCount: 1,
      hasCheckedIn: true,
      allTicketsCheckedIn: false,
      referredBooking: true,
      registeredSessionCount: 1,
      waitlistedSessionCount: 1,
      savedSessionCount: 3
    });
  });

  test('buildCrmAudienceSnapshot keeps the latest confirmed booking per user', () => {
    const snapshot = buildCrmAudienceSnapshot([
      {
        _id: 'booking-old',
        userId: 'user-1',
        attendee: {
          name: 'Asha',
          email: 'asha@example.com'
        },
        quantity: 1,
        confirmedAt: '2026-05-01T10:00:00.000Z',
        savedAgenda: {
          sessions: []
        }
      },
      {
        _id: 'booking-new',
        userId: 'user-1',
        attendee: {
          name: 'Asha',
          email: 'asha@example.com'
        },
        quantity: 3,
        confirmedAt: '2026-05-11T10:00:00.000Z',
        referral: {
          code: 'NEWCODE'
        },
        savedAgenda: {
          sessions: [
            { registrationStatus: 'registered' }
          ]
        }
      },
      {
        _id: 'booking-2',
        userId: 'user-2',
        attendee: {
          name: 'Ravi',
          email: 'ravi@example.com'
        },
        quantity: 1,
        confirmedAt: '2026-05-09T10:00:00.000Z',
        tickets: [
          {
            checkedInAt: '2026-05-09T11:00:00.000Z'
          }
        ],
        savedAgenda: {
          sessions: []
        }
      }
    ]);

    expect(snapshot.summary).toMatchObject({
      audienceCount: 2,
      checkedInCount: 1,
      multiTicketCount: 1,
      referredCount: 1,
      reservedSessionCount: 1,
      waitlistedSessionCount: 0
    });
    expect(snapshot.audience).toHaveLength(2);
    expect(snapshot.audience.find((entry) => entry.userId === 'user-1')).toMatchObject({
      bookingId: 'booking-new',
      ticketCount: 3,
      referredBooking: true
    });
  });
});
