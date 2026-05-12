const normalizeString = (value, fallback = '') => String(value || fallback).trim();

const normalizeStringArray = (values = []) =>
  [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeString(value))
    .filter(Boolean))];

const slugSegment = (value, fallback = 'session') =>
  normalizeString(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;

const buildSessionKey = (session = {}, index = 0) => {
  const explicitKey = normalizeString(session.sessionId || session.sessionKey);
  if (explicitKey) {
    return explicitKey;
  }

  const startTime = session.startsAt ? new Date(session.startsAt).getTime() : NaN;
  const startSegment = Number.isFinite(startTime) && startTime > 0 ? startTime : `slot-${index + 1}`;

  return [
    slugSegment(session.title, `session-${index + 1}`),
    startSegment,
    slugSegment(session.roomLabel, 'room')
  ].join('--');
};

const normalizeAgendaSession = (session = {}, index = 0) => ({
  sessionKey: buildSessionKey(session, index),
  title: normalizeString(session.title, `Session ${index + 1}`),
  description: normalizeString(session.description),
  startsAt: session.startsAt ? new Date(session.startsAt) : null,
  endsAt: session.endsAt ? new Date(session.endsAt) : null,
  roomLabel: normalizeString(session.roomLabel),
  speakerNames: normalizeStringArray(session.speakerNames),
  savedAt: session.savedAt ? new Date(session.savedAt) : null
});

const sortAgendaSessions = (sessions = []) =>
  [...sessions].sort((left, right) => {
    const leftTime = left.startsAt ? new Date(left.startsAt).getTime() : 0;
    const rightTime = right.startsAt ? new Date(right.startsAt).getTime() : 0;

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return String(left.sessionKey || '').localeCompare(String(right.sessionKey || ''));
  });

const stripAgendaSessionForStorage = (session = {}) => ({
  sessionKey: normalizeString(session.sessionKey),
  title: normalizeString(session.title),
  description: normalizeString(session.description),
  startsAt: session.startsAt ? new Date(session.startsAt) : null,
  endsAt: session.endsAt ? new Date(session.endsAt) : null,
  roomLabel: normalizeString(session.roomLabel),
  speakerNames: normalizeStringArray(session.speakerNames),
  savedAt: session.savedAt ? new Date(session.savedAt) : null
});

const annotateConflicts = (savedSessions = []) => {
  const sessions = sortAgendaSessions(savedSessions).map((session) => ({
    ...session,
    hasConflict: false
  }));

  for (let index = 0; index < sessions.length - 1; index += 1) {
    const current = sessions[index];
    const next = sessions[index + 1];
    if (!current.startsAt || !current.endsAt || !next.startsAt || !next.endsAt) {
      continue;
    }

    if (new Date(current.endsAt).getTime() > new Date(next.startsAt).getTime()) {
      current.hasConflict = true;
      next.hasConflict = true;
    }
  }

  return sessions;
};

const buildAgendaSummary = (savedSessions = []) => {
  const currentScheduleSessions = savedSessions.filter((session) => session.isCurrentSchedule !== false);
  const totalMinutes = currentScheduleSessions.reduce((sum, session) => {
    if (!session.startsAt || !session.endsAt) {
      return sum;
    }

    const minutes = Math.max(
      0,
      Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000)
    );
    return sum + minutes;
  }, 0);

  return {
    savedCount: savedSessions.length,
    scheduledCount: currentScheduleSessions.length,
    totalMinutes,
    roomCount: new Set(currentScheduleSessions.map((session) => session.roomLabel).filter(Boolean)).size,
    conflictCount: currentScheduleSessions.filter((session) => session.hasConflict).length,
    staleSessions: savedSessions.filter((session) => session.isCurrentSchedule === false).length
  };
};

const buildAgendaState = ({ eventSessions = [], savedSessions = [] }) => {
  const normalizedSchedule = sortAgendaSessions(
    (Array.isArray(eventSessions) ? eventSessions : []).map(normalizeAgendaSession)
  );
  const scheduleByKey = new Map(
    normalizedSchedule.map((session) => [session.sessionKey, session])
  );

  const normalizedSavedSessions = sortAgendaSessions(
    (Array.isArray(savedSessions) ? savedSessions : []).map(normalizeAgendaSession)
  );
  const dedupedSavedSessions = new Map();
  for (const session of normalizedSavedSessions) {
    if (!dedupedSavedSessions.has(session.sessionKey)) {
      dedupedSavedSessions.set(session.sessionKey, session);
    }
  }

  const storedSessions = sortAgendaSessions(
    [...dedupedSavedSessions.values()].map((savedSession) => {
      const currentSession = scheduleByKey.get(savedSession.sessionKey);

      return stripAgendaSessionForStorage({
        ...(currentSession || savedSession),
        savedAt: savedSession.savedAt || new Date()
      });
    })
  );

  const savedSessionKeySet = new Set(storedSessions.map((session) => session.sessionKey));
  const responseSavedSessions = annotateConflicts(
    storedSessions.map((session) => ({
      ...session,
      isCurrentSchedule: scheduleByKey.has(session.sessionKey)
    }))
  );

  return {
    scheduleSessions: normalizedSchedule.map((session) => ({
      ...session,
      saved: savedSessionKeySet.has(session.sessionKey)
    })),
    savedSessions: responseSavedSessions,
    storedSessions,
    summary: buildAgendaSummary(responseSavedSessions)
  };
};

module.exports = {
  annotateConflicts,
  buildAgendaState,
  buildAgendaSummary,
  buildSessionKey,
  normalizeAgendaSession,
  stripAgendaSessionForStorage
};
