const { Roles } = require('@pulseroom/common');
const {
  buildAuthorProfile,
  serializeQuestionThread
} = require('./questionThreadService');

describe('questionThreadService', () => {
  test('matches event speakers by email when building author profiles', () => {
    const profile = buildAuthorProfile({
      user: {
        sub: 'user-1',
        email: 'speaker@example.com',
        role: Roles.ATTENDEE
      },
      eventMeta: {
        speakers: [
          {
            name: 'Ada Lovelace',
            email: 'speaker@example.com',
            title: 'CTO',
            company: 'PulseRoom'
          }
        ]
      }
    });

    expect(profile.badge).toBe('Speaker');
    expect(profile.isSpeaker).toBe(true);
    expect(profile.name).toBe('Ada Lovelace');
    expect(profile.speakerTitle).toBe('CTO');
  });

  test('treats speaker-role accounts as speaker replies even without event metadata', () => {
    const profile = buildAuthorProfile({
      user: {
        sub: 'speaker-1',
        email: 'guest-speaker@example.com',
        role: Roles.SPEAKER
      },
      eventMeta: {
        speakers: []
      }
    });

    expect(profile.badge).toBe('Speaker');
    expect(profile.isSpeaker).toBe(true);
  });

  test('preserves speaker fallback on older question records', () => {
    const question = serializeQuestionThread({
      _id: 'question-1',
      userId: 'speaker-1',
      body: 'Hello world',
      createdByRole: Roles.SPEAKER,
      replies: []
    });

    expect(question.author.badge).toBe('Speaker');
    expect(question.author.isSpeaker).toBe(true);
  });
});
