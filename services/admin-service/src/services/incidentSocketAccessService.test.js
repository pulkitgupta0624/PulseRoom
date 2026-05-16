const {
  buildEventSafetyRoom,
  canSubscribeToEventIncidents,
  canUseIncidentSocket
} = require('./incidentSocketAccessService');

describe('incidentSocketAccessService', () => {
  it('allows only organizer, moderator, and admin roles onto the incident socket', () => {
    expect(canUseIncidentSocket({ role: 'admin' })).toBe(true);
    expect(canUseIncidentSocket({ role: 'moderator' })).toBe(true);
    expect(canUseIncidentSocket({ role: 'organizer' })).toBe(true);
    expect(canUseIncidentSocket({ role: 'attendee' })).toBe(false);
  });

  it('allows admins and moderators to subscribe to any event incident room', () => {
    expect(
      canSubscribeToEventIncidents({
        user: { role: 'admin', sub: 'admin-1' },
        eventMeta: { organizerId: 'organizer-1' }
      })
    ).toBe(true);
    expect(
      canSubscribeToEventIncidents({
        user: { role: 'moderator', sub: 'mod-1' },
        eventMeta: { organizerId: 'organizer-1' }
      })
    ).toBe(true);
  });

  it('allows only the owning organizer to subscribe to an event incident room', () => {
    expect(
      canSubscribeToEventIncidents({
        user: { role: 'organizer', sub: 'organizer-1' },
        eventMeta: { organizerId: 'organizer-1' }
      })
    ).toBe(true);
    expect(
      canSubscribeToEventIncidents({
        user: { role: 'organizer', sub: 'organizer-2' },
        eventMeta: { organizerId: 'organizer-1' }
      })
    ).toBe(false);
  });

  it('builds a stable event safety room id', () => {
    expect(buildEventSafetyRoom(' event-42 ')).toBe('event:event-42:safety');
  });
});
