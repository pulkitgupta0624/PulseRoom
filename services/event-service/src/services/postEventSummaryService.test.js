const {
  buildStoredPostEventSummary,
  buildSummarySourceMetrics,
  serializePostEventSummary
} = require('./postEventSummaryService');

describe('postEventSummaryService', () => {
  it('derives useful source metrics from live context', () => {
    const metrics = buildSummarySourceMetrics({
      polls: [{}, {}],
      questions: [{}, {}, {}],
      announcements: [{}],
      reactions: [{ emoji: 'fire', count: 4 }, { emoji: 'rocket', count: 7 }],
      engagement: {
        totals: {
          totalInteractions: 42
        },
        peakBucket: {
          totalInteractions: 11
        }
      }
    });

    expect(metrics).toEqual({
      pollCount: 2,
      questionCount: 3,
      announcementCount: 1,
      reactionCount: 11,
      totalInteractions: 42,
      peakInteractions: 11
    });
  });

  it('normalizes and trims generated recap payloads before storage', () => {
    const stored = buildStoredPostEventSummary({
      generatedByUserId: ' user-123 ',
      summary: {
        executiveSummary: '  Packed room with strong audience Q&A.  ',
        keyTakeaways: ['  Ship faster  ', '', 'Measure adoption'],
        flashcards: [
          { front: '  What mattered? ', back: ' Audience questions were highly practical. ' },
          { front: '', back: 'ignored' }
        ],
        followUpActions: [
          { owner: 'speaker', action: '  Publish the deck ', priority: 'high' },
          { owner: 'weird', action: '', priority: 'extreme' }
        ],
        audienceSignals: [
          { signal: '  High replay intent ', evidence: ' Several attendees asked for recordings ' },
          { signal: '', evidence: 'ignored' }
        ]
      },
      liveContext: {
        questions: [{}, {}]
      }
    });

    expect(stored.generatedByUserId).toBe('user-123');
    expect(stored.executiveSummary).toBe('Packed room with strong audience Q&A.');
    expect(stored.keyTakeaways).toEqual(['Ship faster', 'Measure adoption']);
    expect(stored.flashcards).toEqual([
      {
        front: 'What mattered?',
        back: 'Audience questions were highly practical.'
      }
    ]);
    expect(stored.followUpActions).toEqual([
      {
        owner: 'speaker',
        action: 'Publish the deck',
        priority: 'high'
      }
    ]);
    expect(stored.audienceSignals).toEqual([
      {
        signal: 'High replay intent',
        evidence: 'Several attendees asked for recordings'
      }
    ]);
    expect(stored.sourceMetrics.questionCount).toBe(2);
  });

  it('serializes stored recaps into safe response payloads', () => {
    const serialized = serializePostEventSummary({
      generatedAt: new Date('2026-05-12T10:30:00.000Z'),
      generatedByUserId: 'owner-1',
      executiveSummary: 'A concise recap',
      keyTakeaways: ['One'],
      flashcards: [{ front: 'Front', back: 'Back' }],
      followUpActions: [{ owner: 'organizer', action: 'Email attendees', priority: 'medium' }],
      audienceSignals: [{ signal: 'High engagement', evidence: 'Poll turnout stayed high' }],
      sourceMetrics: {
        pollCount: 1,
        questionCount: 2,
        announcementCount: 3,
        reactionCount: 4,
        totalInteractions: 5,
        peakInteractions: 6
      }
    });

    expect(serialized.generatedByUserId).toBe('owner-1');
    expect(serialized.keyTakeaways).toEqual(['One']);
    expect(serialized.flashcards).toHaveLength(1);
    expect(serialized.sourceMetrics.reactionCount).toBe(4);
  });
});
