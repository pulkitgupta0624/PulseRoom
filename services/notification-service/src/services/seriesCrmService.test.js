const {
  applySeriesCrmFilters,
  buildSeriesCrmSummary,
  normalizeSeriesCrmFilters
} = require('./seriesCrmService');

describe('seriesCrmService', () => {
  test('normalizeSeriesCrmFilters falls back to safe defaults', () => {
    expect(
      normalizeSeriesCrmFilters({
        search: '  founders  ',
        source: 'self_join',
        joinedWindow: 'bad-value',
        planType: 'paid',
        replayAccess: 'included',
        vipNetworking: 'enabled'
      })
    ).toEqual({
      search: 'founders',
      source: 'self_join',
      joinedWindow: 'all',
      planType: 'paid',
      replayAccess: 'included',
      vipNetworking: 'enabled'
    });
  });

  test('applySeriesCrmFilters narrows member lists by pricing and perks', () => {
    const audience = [
      {
        userId: 'member-1',
        attendeeName: 'Asha Founder',
        email: 'asha@example.com',
        source: 'self_join',
        joinedAt: '2026-05-10T10:00:00.000Z',
        planName: 'Pro Pass',
        isPaid: true,
        includesReplayLibrary: true,
        vipNetworking: true
      },
      {
        userId: 'member-2',
        attendeeName: 'Ravi Builder',
        email: 'ravi@example.com',
        source: 'organizer_grant',
        joinedAt: '2026-03-01T10:00:00.000Z',
        planName: 'Community Pass',
        isPaid: false,
        includesReplayLibrary: false,
        vipNetworking: false
      }
    ];

    expect(
      applySeriesCrmFilters(
        audience,
        {
          planType: 'paid',
          replayAccess: 'included',
          vipNetworking: 'enabled'
        },
        new Date('2026-05-13T10:00:00.000Z').getTime()
      )
    ).toEqual([audience[0]]);
  });

  test('buildSeriesCrmSummary counts recent, paid, and perk-enabled members', () => {
    const audience = [
      {
        source: 'self_join',
        joinedAt: '2026-05-10T10:00:00.000Z',
        isPaid: true,
        includesReplayLibrary: true,
        vipNetworking: true
      },
      {
        source: 'organizer_grant',
        joinedAt: '2026-03-01T10:00:00.000Z',
        isPaid: false,
        includesReplayLibrary: false,
        vipNetworking: false
      }
    ];

    expect(
      buildSeriesCrmSummary(audience, new Date('2026-05-13T10:00:00.000Z').getTime())
    ).toEqual({
      memberCount: 2,
      paidMemberCount: 1,
      replayAccessCount: 1,
      vipNetworkingCount: 1,
      recentJoinCount: 1,
      organizerGrantedCount: 1
    });
  });
});
