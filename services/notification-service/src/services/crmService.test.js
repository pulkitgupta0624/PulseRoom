const {
  CRM_FILTER_DEFAULTS,
  applyAudienceCrmFilters,
  buildAudienceCrmSummary,
  isEventEnded,
  mergeAudienceCrmRecords,
  normalizeAudienceCrmFilters
} = require('./crmService');

describe('crmService', () => {
  test('normalizeAudienceCrmFilters falls back to safe defaults', () => {
    expect(
      normalizeAudienceCrmFilters({
        search: '  VIP founders ',
        checkedIn: 'checked-in',
        networking: 'invalid-option'
      })
    ).toEqual({
      ...CRM_FILTER_DEFAULTS,
      search: 'VIP founders',
      checkedIn: 'checked-in'
    });
  });

  test('mergeAudienceCrmRecords overlays networking state and computes no-shows', () => {
    const audience = mergeAudienceCrmRecords({
      bookingAudience: [
        {
          userId: 'user-1',
          attendeeName: 'Asha',
          email: 'asha@example.com',
          tierName: 'VIP',
          ticketCount: 2,
          hasCheckedIn: false,
          referredBooking: true,
          registeredSessionCount: 1,
          waitlistedSessionCount: 0
        }
      ],
      networkingAudience: [
        {
          userId: 'user-1',
          networking: {
            optedIn: true,
            optedInAt: '2026-05-10T10:00:00.000Z',
            meetingGoal: 'Find collaborators'
          }
        }
      ],
      eventMeta: {
        status: 'completed'
      }
    });

    expect(audience[0]).toMatchObject({
      isNetworkingOptedIn: true,
      hasNetworkingProfile: true,
      isNoShow: true
    });
  });

  test('applyAudienceCrmFilters narrows results by multiple segment signals', () => {
    const filtered = applyAudienceCrmFilters(
      [
        {
          attendeeName: 'Asha',
          email: 'asha@example.com',
          tierName: 'VIP',
          hasCheckedIn: true,
          isNoShow: false,
          isNetworkingOptedIn: true,
          registeredSessionCount: 1,
          waitlistedSessionCount: 0,
          ticketCount: 2,
          referredBooking: true
        },
        {
          attendeeName: 'Ravi',
          email: 'ravi@example.com',
          tierName: 'General',
          hasCheckedIn: false,
          isNoShow: true,
          isNetworkingOptedIn: false,
          registeredSessionCount: 0,
          waitlistedSessionCount: 1,
          ticketCount: 1,
          referredBooking: false
        }
      ],
      {
        checkedIn: 'not-checked-in',
        sessionState: 'waitlisted',
        ticketType: 'single-ticket',
        referral: 'direct',
        search: 'ravi'
      }
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].attendeeName).toBe('Ravi');
  });

  test('buildAudienceCrmSummary counts the key organizer CRM totals', () => {
    expect(
      buildAudienceCrmSummary([
        {
          hasCheckedIn: true,
          isNoShow: false,
          isNetworkingOptedIn: true,
          registeredSessionCount: 1,
          waitlistedSessionCount: 0,
          ticketCount: 2,
          referredBooking: true
        },
        {
          hasCheckedIn: false,
          isNoShow: true,
          isNetworkingOptedIn: false,
          registeredSessionCount: 0,
          waitlistedSessionCount: 1,
          ticketCount: 1,
          referredBooking: false
        }
      ])
    ).toEqual({
      audienceCount: 2,
      checkedInCount: 1,
      noShowCount: 1,
      networkingOptInCount: 1,
      reservedSessionCount: 1,
      waitlistedSessionCount: 1,
      multiTicketCount: 1,
      referredCount: 1
    });
  });

  test('isEventEnded respects explicit completion status and ended timestamps', () => {
    expect(isEventEnded({ status: 'completed' })).toBe(true);
    expect(
      isEventEnded(
        { endsAt: '2026-05-01T10:00:00.000Z' },
        new Date('2026-05-02T00:00:00.000Z')
      )
    ).toBe(true);
    expect(
      isEventEnded(
        { endsAt: '2026-05-03T10:00:00.000Z' },
        new Date('2026-05-02T00:00:00.000Z')
      )
    ).toBe(false);
  });
});
