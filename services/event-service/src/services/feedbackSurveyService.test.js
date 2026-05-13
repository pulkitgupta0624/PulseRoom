const {
  buildEventSessionKey,
  buildFeedbackInsights,
  normalizeSessionFeedbackEntries
} = require('./feedbackSurveyService');

describe('feedbackSurveyService', () => {
  test('buildEventSessionKey stays stable from title, start time, and room', () => {
    expect(
      buildEventSessionKey({
        title: 'Opening Keynote',
        startsAt: '2026-05-10T09:00:00.000Z',
        roomLabel: 'Main Stage'
      })
    ).toBe('opening-keynote--1778403600000--main-stage');
  });

  test('normalizeSessionFeedbackEntries keeps only known sessions and enriches metadata', () => {
    const entries = normalizeSessionFeedbackEntries({
      eventSessions: [
        {
          title: 'Opening Keynote',
          startsAt: '2026-05-10T09:00:00.000Z',
          roomLabel: 'Main Stage'
        }
      ],
      sessionFeedback: [
        {
          sessionKey: 'opening-keynote--1778403600000--main-stage',
          rating: 5,
          comment: 'Packed and useful.'
        },
        {
          sessionKey: 'missing-session',
          rating: 2,
          comment: 'Should be ignored'
        }
      ]
    });

    expect(entries).toEqual([
      {
        sessionKey: 'opening-keynote--1778403600000--main-stage',
        title: 'Opening Keynote',
        startsAt: new Date('2026-05-10T09:00:00.000Z'),
        roomLabel: 'Main Stage',
        rating: 5,
        comment: 'Packed and useful.'
      }
    ]);
  });

  test('buildFeedbackInsights calculates NPS, response rate, and session leaders', () => {
    const insights = buildFeedbackInsights({
      attendeeTarget: 8,
      responses: [
        {
          attendeeName: 'A',
          overallRating: 5,
          npsScore: 10,
          attendAgain: true,
          sessionFeedback: [
            { sessionKey: 's1', title: 'Opening', roomLabel: 'Main', rating: 5, comment: 'Great' }
          ]
        },
        {
          attendeeName: 'B',
          overallRating: 4,
          npsScore: 8,
          attendAgain: true,
          sessionFeedback: [
            { sessionKey: 's1', title: 'Opening', roomLabel: 'Main', rating: 4, comment: '' },
            { sessionKey: 's2', title: 'Workshop', roomLabel: 'Room B', rating: 2, comment: 'Too rushed' }
          ]
        },
        {
          attendeeName: 'C',
          overallRating: 3,
          npsScore: 4,
          attendAgain: false,
          sessionFeedback: [
            { sessionKey: 's2', title: 'Workshop', roomLabel: 'Room B', rating: 3, comment: '' }
          ]
        }
      ]
    });

    expect(insights.summary.responsesCount).toBe(3);
    expect(insights.summary.responseRate).toBe(37.5);
    expect(insights.summary.npsScore).toBe(0);
    expect(insights.summary.averageOverallRating).toBe(4);
    expect(insights.summary.averageSessionRating).toBe(3.5);
    expect(insights.sessions.topRated[0]).toMatchObject({
      sessionKey: 's1',
      averageRating: 4.5
    });
    expect(insights.sessions.needsAttention[0]).toMatchObject({
      sessionKey: 's2',
      averageRating: 2.5
    });
  });
});
