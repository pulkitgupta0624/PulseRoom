const {
  buildAssignedSessions,
  buildSpeakerPortalEntry,
  getAssignedSpeakerProfile,
  getAssignedTeamMembers
} = require('./speakerPortalService');

describe('speakerPortalService', () => {
  const baseEvent = {
    _id: 'evt_1',
    title: 'Launch Summit',
    summary: 'Product and GTM sessions.',
    startsAt: '2026-06-20T10:00:00.000Z',
    endsAt: '2026-06-20T18:00:00.000Z',
    type: 'online',
    status: 'published',
    organizerId: 'org_1',
    speakers: [
      {
        userId: 'speaker_1',
        email: 'speaker@example.com',
        name: 'Riya Shah',
        title: 'Founder',
        company: 'PulseWorks'
      }
    ],
    teamMembers: [
      {
        userId: 'staff_1',
        email: 'checkin@example.com',
        name: 'Desk Lead',
        role: 'checkin',
        notes: 'Arrive 45 minutes early.'
      },
      {
        userId: '',
        email: 'speaker@example.com',
        name: 'Riya Shah',
        role: 'moderator',
        notes: 'Help clear audience Q&A.'
      }
    ],
    sessions: [
      {
        title: 'Opening Keynote',
        roomLabel: 'Main Stage',
        speakerNames: ['Riya Shah']
      },
      {
        title: 'Audience AMA',
        roomLabel: 'Breakout',
        speakerNames: ['Another Speaker']
      }
    ]
  };

  test('matches speaker assignments by user id or email', () => {
    const byUserId = getAssignedSpeakerProfile(baseEvent, {
      sub: 'speaker_1',
      email: 'different@example.com'
    });
    const byEmail = getAssignedSpeakerProfile(baseEvent, {
      sub: 'unknown',
      email: 'speaker@example.com'
    });

    expect(byUserId?.name).toBe('Riya Shah');
    expect(byEmail?.name).toBe('Riya Shah');
  });

  test('matches assigned team members by user id or email', () => {
    const matches = getAssignedTeamMembers(baseEvent, {
      sub: 'staff_1',
      email: 'checkin@example.com'
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].role).toBe('checkin');
  });

  test('buildAssignedSessions returns only the current speakers sessions', () => {
    const sessions = buildAssignedSessions(baseEvent, {
      name: 'Riya Shah'
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('Opening Keynote');
  });

  test('buildSpeakerPortalEntry combines speaking and team roles', () => {
    const portalEntry = buildSpeakerPortalEntry(baseEvent, {
      sub: 'speaker_1',
      email: 'speaker@example.com'
    });

    expect(portalEntry.assignmentRoles).toEqual(['speaker', 'moderator']);
    expect(portalEntry.sessions).toHaveLength(1);
    expect(portalEntry.teamMembers[0].role).toBe('moderator');
  });

  test('buildSpeakerPortalEntry gives check-in staff a workspace assignment with team notes', () => {
    const portalEntry = buildSpeakerPortalEntry(baseEvent, {
      sub: 'staff_1',
      email: 'checkin@example.com'
    });

    expect(portalEntry.assignmentRoles).toEqual(['checkin']);
    expect(portalEntry.speakerProfile).toBeNull();
    expect(portalEntry.teamMembers).toEqual([
      expect.objectContaining({
        role: 'checkin',
        notes: 'Arrive 45 minutes early.'
      })
    ]);
    expect(portalEntry.sessions).toEqual([]);
  });
});
