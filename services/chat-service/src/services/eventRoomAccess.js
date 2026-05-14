const { AppError, Roles } = require('@pulseroom/common');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeString = (value) => String(value || '').trim();

const hasMatchingUser = ({ candidateUserId, candidateEmail }, user = {}) => {
  const normalizedCandidateUserId = normalizeString(candidateUserId);
  const normalizedUserId = normalizeString(user.sub || user.id);
  if (normalizedCandidateUserId && normalizedUserId && normalizedCandidateUserId === normalizedUserId) {
    return true;
  }

  const normalizedCandidateEmail = normalizeEmail(candidateEmail);
  const normalizedUserEmail = normalizeEmail(user.email);
  return Boolean(
    normalizedCandidateEmail &&
      normalizedUserEmail &&
      normalizedCandidateEmail === normalizedUserEmail
  );
};

const canAccessEventRoom = (eventMeta = {}, user = {}) => {
  if (eventMeta.visibility !== 'private') {
    return true;
  }

  if (user.role === Roles.ADMIN) {
    return true;
  }

  if (normalizeString(eventMeta.organizerId) === normalizeString(user.sub || user.id)) {
    return true;
  }

  if ((eventMeta.speakers || []).some((speaker) => hasMatchingUser({
    candidateUserId: speaker.userId,
    candidateEmail: speaker.email
  }, user))) {
    return true;
  }

  return (eventMeta.teamMembers || []).some((member) => hasMatchingUser({
    candidateUserId: member.userId,
    candidateEmail: member.email
  }, user));
};

const assertCanAccessEventRoom = ({ eventMeta, user }) => {
  if (!canAccessEventRoom(eventMeta, user)) {
    throw new AppError('Event not available', 403, 'event_private');
  }
};

module.exports = {
  assertCanAccessEventRoom,
  canAccessEventRoom
};
