const {
  buildPairKey,
  buildSharedInterests,
  generateNetworkingMatches
} = require('./networkingService');

describe('networkingService', () => {
  test('buildSharedInterests normalizes overlapping interests', () => {
    expect(
      buildSharedInterests(
        { interests: ['AI', ' Product ', 'data'] },
        { interests: ['ai', 'community', 'DATA'] }
      )
    ).toEqual(['ai', 'data']);
  });

  test('generateNetworkingMatches honors existing matches and attendee caps', () => {
    const attendees = [
      { userId: 'u1', displayName: 'Asha', interests: ['ai', 'data'], location: 'Bengaluru' },
      { userId: 'u2', displayName: 'Mina', interests: ['ai', 'product'], location: 'Bengaluru' },
      { userId: 'u3', displayName: 'Ravi', interests: ['product', 'design'], location: 'Mumbai' },
      { userId: 'u4', displayName: 'Noah', interests: ['ai', 'design'], location: 'Delhi' }
    ];

    const matches = generateNetworkingMatches({
      attendees,
      existingMatches: [
        {
          pairKey: buildPairKey('u1', 'u2'),
          participantUserIds: ['u1', 'u2']
        }
      ],
      maxMatchesPerAttendee: 2
    });

    const pairKeys = matches.map((match) => match.pairKey);
    expect(pairKeys).not.toContain(buildPairKey('u1', 'u2'));
    expect(pairKeys).toContain(buildPairKey('u1', 'u4'));
    expect(pairKeys).toContain(buildPairKey('u2', 'u3'));

    const participantCounts = matches.reduce((accumulator, match) => {
      for (const participantUserId of match.participantUserIds) {
        accumulator[participantUserId] = (accumulator[participantUserId] || 0) + 1;
      }
      return accumulator;
    }, {
      u1: 1,
      u2: 1
    });

    expect(participantCounts.u1).toBeLessThanOrEqual(2);
    expect(participantCounts.u2).toBeLessThanOrEqual(2);
    expect(participantCounts.u3).toBeLessThanOrEqual(2);
    expect(participantCounts.u4).toBeLessThanOrEqual(2);
  });
});
