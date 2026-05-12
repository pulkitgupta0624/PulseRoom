const {
  hasAssignedEventTeamRole,
  normalizeEmail
} = require('./eventTeamAccessService');

describe('eventTeamAccessService', () => {
  test('matches an assigned event team member by user id', () => {
    const allowed = hasAssignedEventTeamRole({
      eventMeta: {
        teamMembers: [
          {
            userId: 'desk_1',
            email: 'desk@example.com',
            role: 'checkin'
          }
        ]
      },
      user: {
        sub: 'desk_1',
        email: 'someone-else@example.com'
      },
      role: 'checkin'
    });

    expect(allowed).toBe(true);
  });

  test('matches an assigned event team member by normalized email', () => {
    const allowed = hasAssignedEventTeamRole({
      eventMeta: {
        teamMembers: [
          {
            userId: '',
            email: '  Desk@Example.com ',
            role: 'checkin'
          }
        ]
      },
      user: {
        sub: 'unknown',
        email: 'desk@example.com'
      },
      role: 'checkin'
    });

    expect(allowed).toBe(true);
  });

  test('does not match a user when the assigned team role is different', () => {
    const allowed = hasAssignedEventTeamRole({
      eventMeta: {
        teamMembers: [
          {
            userId: 'producer_1',
            email: 'producer@example.com',
            role: 'producer'
          }
        ]
      },
      user: {
        sub: 'producer_1',
        email: 'producer@example.com'
      },
      role: 'checkin'
    });

    expect(allowed).toBe(false);
  });

  test('normalizeEmail trims and lowercases values for assignment matching', () => {
    expect(normalizeEmail('  Desk@Example.com ')).toBe('desk@example.com');
  });
});
