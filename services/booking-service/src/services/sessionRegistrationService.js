const { AppError } = require('@pulseroom/common');

const SESSION_REGISTRATION_STATUSES = {
  SAVED: 'saved',
  REGISTERED: 'registered',
  WAITLISTED: 'waitlisted'
};

const SESSION_AGENDA_ACTIONS = {
  SAVE: 'save',
  REMOVE: 'remove',
  REGISTER: 'register',
  CANCEL_REGISTRATION: 'cancel-registration',
  JOIN_WAITLIST: 'join-waitlist',
  LEAVE_WAITLIST: 'leave-waitlist'
};

const normalizeSessionRegistrationStatus = (
  value,
  fallback = SESSION_REGISTRATION_STATUSES.SAVED
) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (Object.values(SESSION_REGISTRATION_STATUSES).includes(normalized)) {
    return normalized;
  }

  return fallback;
};

const resolveAgendaAction = (payload = {}) => {
  const explicitAction = String(payload.action || '').trim().toLowerCase();
  if (explicitAction && Object.values(SESSION_AGENDA_ACTIONS).includes(explicitAction)) {
    return explicitAction;
  }

  if (typeof payload.saved === 'boolean') {
    return payload.saved
      ? SESSION_AGENDA_ACTIONS.SAVE
      : SESSION_AGENDA_ACTIONS.REMOVE;
  }

  throw new AppError(
    'Choose a valid session agenda action',
    422,
    'agenda_action_invalid'
  );
};

const createStoredSessionSnapshot = ({ scheduleSession, existingSession, now = new Date() }) => ({
  ...(scheduleSession || existingSession),
  savedAt: existingSession?.savedAt || now,
  registrationStatus: normalizeSessionRegistrationStatus(existingSession?.registrationStatus),
  registeredAt: existingSession?.registeredAt || null,
  waitlistedAt: existingSession?.waitlistedAt || null
});

const assertScheduleSession = (scheduleSession) => {
  if (!scheduleSession) {
    throw new AppError(
      'Session not found on this event schedule',
      404,
      'agenda_session_not_found'
    );
  }
};

const assertExistingSession = (existingSession) => {
  if (!existingSession) {
    throw new AppError(
      'Session is not saved in your agenda',
      404,
      'agenda_session_not_saved'
    );
  }
};

const applySessionAgendaAction = ({
  action,
  scheduleSession,
  existingSession,
  availability,
  now = new Date()
}) => {
  const resolvedAction = resolveAgendaAction({ action });
  const existingStatus = normalizeSessionRegistrationStatus(existingSession?.registrationStatus);
  const baseSnapshot = () =>
    createStoredSessionSnapshot({
      scheduleSession,
      existingSession,
      now
    });

  switch (resolvedAction) {
    case SESSION_AGENDA_ACTIONS.SAVE:
      assertScheduleSession(scheduleSession);
      return {
        ...baseSnapshot(),
        registrationStatus: existingSession
          ? existingStatus
          : SESSION_REGISTRATION_STATUSES.SAVED
      };

    case SESSION_AGENDA_ACTIONS.REMOVE:
      assertExistingSession(existingSession);
      if (existingStatus === SESSION_REGISTRATION_STATUSES.REGISTERED) {
        throw new AppError(
          'Cancel your seat registration before removing this session from your agenda',
          409,
          'agenda_session_registered'
        );
      }
      if (existingStatus === SESSION_REGISTRATION_STATUSES.WAITLISTED) {
        throw new AppError(
          'Leave the waitlist before removing this session from your agenda',
          409,
          'agenda_session_waitlisted'
        );
      }
      return null;

    case SESSION_AGENDA_ACTIONS.REGISTER:
      assertScheduleSession(scheduleSession);
      if (
        availability?.hasCapacity &&
        availability.remainingSeats <= 0 &&
        existingStatus !== SESSION_REGISTRATION_STATUSES.REGISTERED
      ) {
        throw new AppError(
          'This session is full right now. Join the waitlist to hold your place.',
          409,
          'agenda_session_full'
        );
      }
      return {
        ...baseSnapshot(),
        registrationStatus: SESSION_REGISTRATION_STATUSES.REGISTERED,
        registeredAt: existingSession?.registeredAt || now,
        waitlistedAt: null
      };

    case SESSION_AGENDA_ACTIONS.CANCEL_REGISTRATION:
      assertExistingSession(existingSession);
      if (existingStatus !== SESSION_REGISTRATION_STATUSES.REGISTERED) {
        throw new AppError(
          'You do not currently have a reserved seat for this session',
          409,
          'agenda_session_not_registered'
        );
      }
      return {
        ...baseSnapshot(),
        registrationStatus: SESSION_REGISTRATION_STATUSES.SAVED,
        registeredAt: null,
        waitlistedAt: null
      };

    case SESSION_AGENDA_ACTIONS.JOIN_WAITLIST:
      assertScheduleSession(scheduleSession);
      if (!availability?.hasCapacity) {
        throw new AppError(
          'This session has open registration, so a waitlist is not needed',
          409,
          'agenda_waitlist_not_supported'
        );
      }
      if (existingStatus === SESSION_REGISTRATION_STATUSES.REGISTERED) {
        throw new AppError(
          'You already have a reserved seat for this session',
          409,
          'agenda_session_already_registered'
        );
      }
      if (availability.remainingSeats > 0) {
        throw new AppError(
          'Seats are still available. Reserve a seat directly instead of joining the waitlist.',
          409,
          'agenda_waitlist_not_open'
        );
      }
      return {
        ...baseSnapshot(),
        registrationStatus: SESSION_REGISTRATION_STATUSES.WAITLISTED,
        registeredAt: null,
        waitlistedAt: existingSession?.waitlistedAt || now
      };

    case SESSION_AGENDA_ACTIONS.LEAVE_WAITLIST:
      assertExistingSession(existingSession);
      if (existingStatus !== SESSION_REGISTRATION_STATUSES.WAITLISTED) {
        throw new AppError(
          'You are not currently on the waitlist for this session',
          409,
          'agenda_session_not_waitlisted'
        );
      }
      return {
        ...baseSnapshot(),
        registrationStatus: SESSION_REGISTRATION_STATUSES.SAVED,
        registeredAt: null,
        waitlistedAt: null
      };

    default:
      throw new AppError(
        'Choose a valid session agenda action',
        422,
        'agenda_action_invalid'
      );
  }
};

const buildSessionDemandByKey = (rows = []) =>
  rows.reduce((accumulator, row) => {
    const sessionKey = String(row?._id || '').trim();
    if (!sessionKey) {
      return accumulator;
    }

    accumulator[sessionKey] = {
      registeredCount: Number(row.registeredCount || 0),
      waitlistedCount: Number(row.waitlistedCount || 0)
    };
    return accumulator;
  }, {});

module.exports = {
  SESSION_AGENDA_ACTIONS,
  SESSION_REGISTRATION_STATUSES,
  applySessionAgendaAction,
  buildSessionDemandByKey,
  normalizeSessionRegistrationStatus,
  resolveAgendaAction
};
