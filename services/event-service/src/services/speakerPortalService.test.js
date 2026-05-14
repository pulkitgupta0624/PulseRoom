const {
  buildAssignedSessions,
  buildDerivedSessionId,
  buildSpeakerPortalEntry,
  canEditEventSpeakerWorkspace,
  canEditSessionSpeakerWorkspace,
  findSessionByRouteId,
  getAssignedSpeakerProfile,
  getAssignedTeamMembers,
  normalizeSpeakerSession,
  normalizeSpeakerSessions,
  normalizeSpeakerWorkspace
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
    speakerWorkspace: {
      greenRoomNotes: 'Soundcheck starts 20 minutes before the keynote.',
      sharedResources: [
        {
          resourceId: 'res_1',
          label: 'Run of show',
          url: 'https://example.com/run-of-show',
          type: 'brief'
        }
      ],
      briefingTimeline: [
        {
          itemId: 'brief_1',
          title: 'Stage rehearsal',
          details: 'Meet the producer in the green room.',
          startsAt: '2026-06-20T09:30:00.000Z',
          owner: 'organizer'
        }
      ]
    },
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
      },
      {
        userId: 'producer_1',
        email: 'producer@example.com',
        name: 'Show Caller',
        role: 'producer',
        notes: 'Own the countdown and mic handoffs.'
      }
    ],
    sessions: [
      {
        sessionId: 'sess_keynote',
        title: 'Opening Keynote',
        roomLabel: 'Main Stage',
        speakerNames: ['Riya Shah'],
        deckUrl: 'https://example.com/keynote-slides',
        rehearsalChecklist: [
          {
            itemId: 'chk_1',
            label: 'Deck uploaded',
            completed: true
          }
        ],
        resourceLinks: [
          {
            resourceId: 'res_2',
            label: 'Speaker brief',
            url: 'https://example.com/speaker-brief',
            type: 'brief'
          }
        ],
        postSessionResources: [
          {
            resourceId: 'res_3',
            label: 'Download the slides',
            url: 'https://example.com/download-slides',
            type: 'slides'
          }
        ]
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

  test('buildAssignedSessions returns all sessions for producers and moderators', () => {
    const sessions = buildAssignedSessions(
      baseEvent,
      null,
      [
        {
          role: 'producer'
        }
      ]
    );

    expect(sessions).toHaveLength(2);
  });

  test('buildSpeakerPortalEntry combines speaking and team roles with workspace data', () => {
    const portalEntry = buildSpeakerPortalEntry(baseEvent, {
      sub: 'speaker_1',
      email: 'speaker@example.com'
    });

    expect(portalEntry.assignmentRoles).toEqual(['speaker', 'moderator']);
    expect(portalEntry.sessions).toHaveLength(2);
    expect(portalEntry.teamMembers[0].role).toBe('moderator');
    expect(portalEntry.speakerWorkspace.greenRoomNotes).toContain('Soundcheck');
    expect(portalEntry.sessions[0]).toEqual(
      expect.objectContaining({
        sessionId: 'sess_keynote',
        deckUrl: 'https://example.com/keynote-slides',
        canEditWorkspace: true
      })
    );
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
    expect(portalEntry.canEditEventWorkspace).toBe(false);
  });

  test('producers can edit event and session workspace without a speaker profile', () => {
    expect(
      canEditEventSpeakerWorkspace(baseEvent, {
        sub: 'producer_1',
        email: 'producer@example.com',
        role: 'moderator'
      })
    ).toBe(true);

    expect(
      canEditSessionSpeakerWorkspace(
        baseEvent,
        {
          sub: 'producer_1',
          email: 'producer@example.com',
          role: 'moderator'
        },
        baseEvent.sessions[1]
      )
    ).toBe(true);
  });

  test('normalizes shared speaker workspace and session resources safely', () => {
    const workspace = normalizeSpeakerWorkspace({
      greenRoomNotes: '  Arrive backstage 15 minutes early. ',
      sharedResources: [
        {
          label: '  Run of show ',
          url: 'https://example.com/show',
          type: 'brief'
        },
        {
          label: 'Run of show',
          url: 'https://example.com/show',
          type: 'brief'
        }
      ],
      briefingTimeline: [
        {
          title: '  Mic check ',
          details: ' Sound with the AV team ',
          owner: 'producer'
        }
      ]
    });

    const session = normalizeSpeakerSession({
      title: 'Keynote',
      startsAt: '2026-06-20T10:00:00.000Z',
      endsAt: '2026-06-20T10:30:00.000Z',
      rehearsalChecklist: [
        {
          label: ' Deck uploaded ',
          completed: true
        }
      ],
      postSessionResources: [
        {
          label: 'Slides',
          url: 'https://example.com/slides',
          type: 'slides'
        }
      ]
    });

    expect(workspace.sharedResources).toHaveLength(1);
    expect(workspace.briefingTimeline[0].owner).toBe('producer');
    expect(session.rehearsalChecklist[0].completed).toBe(true);
    expect(session.postSessionResources[0].label).toBe('Slides');
  });

  test('normalizeSpeakerSessions preserves existing workspace when schedule details change', () => {
    const updatedSessions = normalizeSpeakerSessions(
      [
        {
          sessionId: 'sess_keynote',
          title: 'Opening Keynote and AMA',
          startsAt: '2026-06-20T10:00:00.000Z',
          endsAt: '2026-06-20T11:00:00.000Z'
        }
      ],
      baseEvent.sessions
    );

    expect(updatedSessions[0].deckUrl).toBe('https://example.com/keynote-slides');
    expect(updatedSessions[0].resourceLinks).toHaveLength(1);
  });

  test('findSessionByRouteId resolves derived ids for older sessions without stored ids', () => {
    const olderEvent = {
      sessions: [
        {
          title: 'Audience AMA',
          startsAt: '2026-06-20T12:00:00.000Z',
          endsAt: '2026-06-20T13:00:00.000Z'
        }
      ]
    };

    const found = findSessionByRouteId(
      {
        sessions: olderEvent.sessions
      },
      buildDerivedSessionId(olderEvent.sessions[0])
    );

    expect(found.title).toBe('Audience AMA');
  });
});
