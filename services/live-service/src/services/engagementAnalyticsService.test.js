const {
  buildEngagementHeatmap,
  getMinuteBucket
} = require('./engagementAnalyticsService');

describe('engagementAnalyticsService', () => {
  test('getMinuteBucket strips seconds and milliseconds', () => {
    expect(getMinuteBucket('2026-04-29T12:34:56.789Z').toISOString()).toBe('2026-04-29T12:34:00.000Z');
  });

  test('buildEngagementHeatmap fills missing minutes and computes peaks', () => {
    const result = buildEngagementHeatmap({
      eventId: 'evt_1',
      windowMinutes: 5,
      now: '2026-04-29T12:04:40.000Z',
      documents: [
        {
          minuteBucket: '2026-04-29T12:01:00.000Z',
          chatMessages: 2,
          pollVotes: 1,
          reactions: 0,
          questions: 0,
          totalInteractions: 3
        },
        {
          minuteBucket: '2026-04-29T12:03:00.000Z',
          chatMessages: 1,
          pollVotes: 0,
          reactions: 4,
          questions: 1,
          totalInteractions: 6
        }
      ]
    });

    expect(result.series).toHaveLength(30);
    expect(result.totals).toMatchObject({
      chatMessages: 3,
      pollVotes: 1,
      reactions: 4,
      questions: 1,
      totalInteractions: 9
    });
    expect(result.peakBucket.minuteBucket).toBe('2026-04-29T12:03:00.000Z');
  });
});
