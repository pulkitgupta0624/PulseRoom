const { Roles } = require('@pulseroom/common');

const normalizeString = (value) => String(value || '').trim();

const canUseIncidentSocket = (user = {}) =>
  [Roles.ADMIN, Roles.MODERATOR, Roles.ORGANIZER].includes(user.role);

const canSubscribeToEventIncidents = ({ user = {}, eventMeta = {} }) => {
  if (user.role === Roles.ADMIN || user.role === Roles.MODERATOR) {
    return true;
  }

  return (
    user.role === Roles.ORGANIZER &&
    normalizeString(eventMeta.organizerId) === normalizeString(user.sub || user.id)
  );
};

const buildEventSafetyRoom = (eventId) => `event:${normalizeString(eventId)}:safety`;

module.exports = {
  buildEventSafetyRoom,
  canSubscribeToEventIncidents,
  canUseIncidentSocket
};
