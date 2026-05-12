const { buildAgendaState, buildSessionKey } = require('./agendaService');

describe('agendaService', () => {
  test('buildSessionKey stays stable for title, time, and room snapshots', () => {
    expect(
      buildSessionKey({
        title: 'Opening Keynote',
        startsAt: '2026-05-12T09:00:00.000Z',
        roomLabel: 'Main Stage'
      })
    ).toBe('opening-keynote--1778576400000--main-stage');
  });

  test('buildAgendaState marks saved sessions, conflicts, and stale sessions', () => {
    const state = buildAgendaState({
      eventSessions: [
        {
          title: 'Opening Keynote',
          startsAt: '2026-05-12T09:00:00.000Z',
          endsAt: '2026-05-12T10:00:00.000Z',
          roomLabel: 'Main Stage',
          speakerNames: ['Asha']
        },
        {
          title: 'Workshop',
          startsAt: '2026-05-12T09:30:00.000Z',
          endsAt: '2026-05-12T10:30:00.000Z',
          roomLabel: 'Room B',
          speakerNames: ['Ravi']
        }
      ],
      savedSessions: [
        {
          sessionKey: 'opening-keynote--1778576400000--main-stage',
          title: 'Old title that should refresh',
          startsAt: '2026-05-12T09:00:00.000Z',
          endsAt: '2026-05-12T10:00:00.000Z',
          roomLabel: 'Main Stage',
          speakerNames: ['Asha'],
          savedAt: '2026-05-01T10:00:00.000Z'
        },
        {
          sessionKey: 'workshop--1778578200000--room-b',
          title: 'Workshop',
          startsAt: '2026-05-12T09:30:00.000Z',
          endsAt: '2026-05-12T10:30:00.000Z',
          roomLabel: 'Room B',
          speakerNames: ['Ravi'],
          savedAt: '2026-05-01T11:00:00.000Z'
        },
        {
          sessionKey: 'removed-session',
          title: 'Removed Session',
          startsAt: '2026-05-12T13:00:00.000Z',
          endsAt: '2026-05-12T14:00:00.000Z',
          roomLabel: 'Room Z',
          speakerNames: ['Mina'],
          savedAt: '2026-05-01T12:00:00.000Z'
        }
      ]
    });

    expect(state.scheduleSessions).toHaveLength(2);
    expect(state.scheduleSessions.map((session) => session.saved)).toEqual([true, true]);
    expect(state.savedSessions).toHaveLength(3);
    expect(state.savedSessions.filter((session) => session.hasConflict)).toHaveLength(2);
    expect(state.summary.savedCount).toBe(3);
    expect(state.summary.staleSessions).toBe(1);
    expect(state.summary.conflictCount).toBe(2);
    expect(state.storedSessions[0].title).toBe('Opening Keynote');
  });
});
