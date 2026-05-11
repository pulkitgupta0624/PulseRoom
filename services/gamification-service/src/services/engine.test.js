const { buildRecordActionUpdate } = require('./engine');

describe('gamification engine update builder', () => {
  test('does not upsert the whole stats object when incrementing stats subpaths', () => {
    const update = buildRecordActionUpdate({
      userId: 'user-1',
      points: 50,
      occurredAt: '2026-05-01T13:00:00.000Z',
      statsIncrements: {
        confirmedBookings: 1
      },
      title: 'Booked an event',
      description: 'Confirmed a ticket',
      ruleKey: 'booking-confirmed',
      actionType: 'booking.confirmed'
    });

    expect(update.$setOnInsert).toEqual({ userId: 'user-1' });
    expect(update.$inc).toMatchObject({
      totalPoints: 50,
      lifetimePoints: 50,
      'stats.confirmedBookings': 1
    });
    expect(update.$push.recentActivity.$each).toHaveLength(1);
  });

  test('can build a stats-only update without a feed entry', () => {
    const update = buildRecordActionUpdate({
      userId: 'user-2',
      occurredAt: '2026-05-01T13:00:00.000Z',
      statsIncrements: {
        questionsAsked: 1
      },
      recordInFeed: false
    });

    expect(update.$setOnInsert).toEqual({ userId: 'user-2' });
    expect(update.$inc).toEqual({
      'stats.questionsAsked': 1
    });
    expect(update.$push).toBeUndefined();
  });
});
