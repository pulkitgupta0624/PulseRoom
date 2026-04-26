const { Roles } = require('@pulseroom/common');
const { getPermissionsForRole } = require('./permissions');

describe('getPermissionsForRole', () => {
  it('returns wildcard permissions for admins', () => {
    expect(getPermissionsForRole(Roles.ADMIN)).toEqual(['*']);
  });

  it('falls back to attendee permissions for unknown roles', () => {
    expect(getPermissionsForRole('unknown')).toContain('events:read');
  });
});

