const {
  SESSION_AGENDA_ACTIONS,
  SESSION_REGISTRATION_STATUSES,
  applySessionAgendaAction,
  resolveAgendaAction
} = require('./sessionRegistrationService');

describe('sessionRegistrationService', () => {
  const scheduleSession = {
    sessionKey: 'opening-keynote',
    title: 'Opening Keynote',
    startsAt: new Date('2026-05-12T09:00:00.000Z'),
    endsAt: new Date('2026-05-12T10:00:00.000Z'),
    roomLabel: 'Main Stage',
    capacity: 30
  };

  test('resolveAgendaAction supports both explicit actions and legacy saved booleans', () => {
    expect(resolveAgendaAction({ action: SESSION_AGENDA_ACTIONS.REGISTER })).toBe('register');
    expect(resolveAgendaAction({ saved: true })).toBe('save');
    expect(resolveAgendaAction({ saved: false })).toBe('remove');
  });

  test('register action turns a saved session into a seat reservation', () => {
    const updated = applySessionAgendaAction({
      action: SESSION_AGENDA_ACTIONS.REGISTER,
      scheduleSession,
      existingSession: {
        ...scheduleSession,
        savedAt: new Date('2026-05-01T10:00:00.000Z'),
        registrationStatus: SESSION_REGISTRATION_STATUSES.SAVED
      },
      availability: {
        hasCapacity: true,
        remainingSeats: 4
      },
      now: new Date('2026-05-02T10:00:00.000Z')
    });

    expect(updated).toMatchObject({
      sessionKey: 'opening-keynote',
      registrationStatus: 'registered'
    });
    expect(updated.registeredAt).toEqual(new Date('2026-05-02T10:00:00.000Z'));
    expect(updated.waitlistedAt).toBeNull();
  });

  test('join waitlist action fails until a session is full', () => {
    expect(() =>
      applySessionAgendaAction({
        action: SESSION_AGENDA_ACTIONS.JOIN_WAITLIST,
        scheduleSession,
        availability: {
          hasCapacity: true,
          remainingSeats: 2
        }
      })
    ).toThrow(/Seats are still available/i);
  });

  test('join waitlist action creates a waitlisted session when capacity is exhausted', () => {
    const updated = applySessionAgendaAction({
      action: SESSION_AGENDA_ACTIONS.JOIN_WAITLIST,
      scheduleSession,
      availability: {
        hasCapacity: true,
        remainingSeats: 0
      },
      now: new Date('2026-05-02T10:00:00.000Z')
    });

    expect(updated).toMatchObject({
      sessionKey: 'opening-keynote',
      registrationStatus: 'waitlisted'
    });
    expect(updated.waitlistedAt).toEqual(new Date('2026-05-02T10:00:00.000Z'));
  });

  test('remove action blocks direct deletion for registered sessions', () => {
    expect(() =>
      applySessionAgendaAction({
        action: SESSION_AGENDA_ACTIONS.REMOVE,
        existingSession: {
          ...scheduleSession,
          registrationStatus: SESSION_REGISTRATION_STATUSES.REGISTERED
        }
      })
    ).toThrow(/Cancel your seat registration/i);
  });
});
