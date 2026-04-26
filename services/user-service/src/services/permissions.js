const { Roles } = require('@pulseroom/common');

const rolePermissionMap = {
  [Roles.ATTENDEE]: ['events:read', 'bookings:create', 'chat:participate', 'live:participate'],
  [Roles.ORGANIZER]: [
    'events:read',
    'events:write',
    'bookings:read',
    'chat:moderate',
    'live:write',
    'analytics:read'
  ],
  [Roles.SPEAKER]: ['events:read', 'live:participate', 'live:write'],
  [Roles.MODERATOR]: ['events:read', 'chat:moderate', 'live:moderate'],
  [Roles.ADMIN]: ['*']
};

const getPermissionsForRole = (role) => rolePermissionMap[role] || rolePermissionMap[Roles.ATTENDEE];

module.exports = {
  getPermissionsForRole
};

