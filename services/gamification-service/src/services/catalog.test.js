const {
  BADGE_DEFINITIONS,
  buildEligibleBadgeKeys,
  buildEntitlements,
  buildLevelSummary,
  buildUnlockedPerks,
  isEarlyBooking
} = require('./catalog');

describe('gamification catalog', () => {
  test('marks early bookings when the booking is far enough ahead of the event', () => {
    expect(
      isEarlyBooking({
        occurredAt: '2026-05-01T10:00:00.000Z',
        eventStartsAt: '2026-05-20T10:00:00.000Z'
      })
    ).toBe(true);

    expect(
      isEarlyBooking({
        occurredAt: '2026-05-10T10:00:00.000Z',
        eventStartsAt: '2026-05-20T10:00:00.000Z'
      })
    ).toBe(false);
  });

  test('builds level progress from point totals', () => {
    expect(buildLevelSummary(0)).toMatchObject({
      label: 'Starter',
      currentThreshold: 0
    });

    expect(buildLevelSummary(540)).toMatchObject({
      label: 'Headliner',
      currentThreshold: 520
    });
  });

  test('derives perks from awarded badges', () => {
    const perks = buildUnlockedPerks([
      {
        ...BADGE_DEFINITIONS['power-attendee'],
        awardedAt: '2026-05-01T10:00:00.000Z'
      }
    ]);

    expect(perks).toHaveLength(1);
    expect(perks[0]).toMatchObject({
      key: 'early-access',
      sourceBadgeKey: 'power-attendee'
    });

    const entitlements = buildEntitlements([
      {
        ...BADGE_DEFINITIONS['power-attendee'],
        awardedAt: '2026-05-01T10:00:00.000Z'
      }
    ]);

    expect(entitlements.perks.earlyAccess).toMatchObject({
      unlocked: true,
      windowHours: 24
    });
  });

  test('computes milestone badges from stats', () => {
    expect(
      buildEligibleBadgeKeys({
        confirmedBookings: 1,
        earlyBookings: 1,
        attendedEvents: 5,
        reviewsSubmitted: 3,
        networkingOptIns: 1,
        topQuestions: 1
      })
    ).toEqual(
      expect.arrayContaining([
        'first-booking',
        'early-bird',
        'power-attendee',
        'review-voice',
        'networking-starter',
        'top-contributor'
      ])
    );
  });
});
