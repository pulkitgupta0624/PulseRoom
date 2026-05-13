const {
  buildAgendaState,
  buildSessionAvailability,
  buildSessionKey
} = require('./agendaService');

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

  test('buildSessionAvailability derives remaining seats and fullness', () => {
    expect(
      buildSessionAvailability(
        { capacity: 30 },
        { registeredCount: 27, waitlistedCount: 4 }
      )
    ).toEqual({
      capacity: 30,
      hasCapacity: true,
      registeredCount: 27,
      waitlistedCount: 4,
      remainingSeats: 3,
      isFull: false
    });
  });

  test('buildAgendaState marks saved sessions, registration state, availability, conflicts, and stale sessions', () => {
    const state = buildAgendaState({
      eventSessions: [
        {
          title: 'Opening Keynote',
          startsAt: '2026-05-12T09:00:00.000Z',
          endsAt: '2026-05-12T10:00:00.000Z',
          roomLabel: 'Main Stage',
          capacity: 40,
          speakerNames: ['Asha']
        },
        {
          title: 'Workshop',
          startsAt: '2026-05-12T09:30:00.000Z',
          endsAt: '2026-05-12T10:30:00.000Z',
          roomLabel: 'Room B',
          capacity: 20,
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
          registrationStatus: 'registered',
          registeredAt: '2026-05-01T10:30:00.000Z',
          savedAt: '2026-05-01T10:00:00.000Z'
        },
        {
          sessionKey: 'workshop--1778578200000--room-b',
          title: 'Workshop',
          startsAt: '2026-05-12T09:30:00.000Z',
          endsAt: '2026-05-12T10:30:00.000Z',
          roomLabel: 'Room B',
          speakerNames: ['Ravi'],
          registrationStatus: 'waitlisted',
          waitlistedAt: '2026-05-01T11:15:00.000Z',
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
      ],
      demandBySessionKey: {
        'opening-keynote--1778576400000--main-stage': {
          registeredCount: 40,
          waitlistedCount: 2
        },
        'workshop--1778578200000--room-b': {
          registeredCount: 20,
          waitlistedCount: 6
        }
      }
    });

    expect(state.scheduleSessions).toHaveLength(2);
    expect(state.scheduleSessions[0]).toMatchObject({
      saved: true,
      isRegistered: true,
      registrationStatus: 'registered',
      remainingSeats: 0,
      isFull: true,
      registeredCount: 40,
      waitlistedCount: 2
    });
    expect(state.scheduleSessions[1]).toMatchObject({
      saved: true,
      isWaitlisted: true,
      registrationStatus: 'waitlisted',
      remainingSeats: 0,
      isFull: true,
      registeredCount: 20,
      waitlistedCount: 6
    });
    expect(state.savedSessions).toHaveLength(3);
    expect(state.savedSessions.filter((session) => session.hasConflict)).toHaveLength(2);
    expect(state.summary.savedCount).toBe(3);
    expect(state.summary.registeredCount).toBe(1);
    expect(state.summary.waitlistedCount).toBe(1);
    expect(state.summary.staleSessions).toBe(1);
    expect(state.summary.conflictCount).toBe(2);
    expect(state.storedSessions[0].title).toBe('Opening Keynote');
  });
});
