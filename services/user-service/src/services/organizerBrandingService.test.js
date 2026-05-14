const {
  buildOrganizerHubPath,
  normalizeOrganizerBranding,
  normalizeOrganizerProfile,
  serializePublicProfile
} = require('./organizerBrandingService');

describe('organizerBrandingService', () => {
  it('normalizes handles, colors, and font pairing defaults', () => {
    expect(
      normalizeOrganizerBranding({
        publicHandle: '  @Pulse Room!  ',
        primaryColor: '123456',
        accentColor: '#abc',
        fontPairing: 'unknown'
      })
    ).toMatchObject({
      publicHandle: 'pulse-room',
      primaryColor: '#123456',
      accentColor: '#aabbcc',
      fontPairing: 'modern'
    });
  });

  it('normalizes nested organizer profile branding', () => {
    expect(
      normalizeOrganizerProfile({
        companyName: ' PulseRoom Live ',
        supportEmail: 'TEAM@PULSEROOM.IO ',
        branding: {
          publicHandle: 'pulse',
          heroTitle: '  Event studio '
        }
      })
    ).toMatchObject({
      companyName: 'PulseRoom Live',
      supportEmail: 'team@pulseroom.io',
      branding: {
        publicHandle: 'pulse',
        heroTitle: 'Event studio'
      }
    });
  });

  it('builds a studio path when a public handle exists', () => {
    expect(
      buildOrganizerHubPath({
        userId: 'organizer-1',
        organizerProfile: {
          branding: {
            publicHandle: 'pulse'
          }
        }
      })
    ).toBe('/studio/pulse');
  });

  it('serializes public profiles with normalized organizer profile data', () => {
    expect(
      serializePublicProfile({
        userId: 'organizer-1',
        organizerProfile: {
          companyName: ' PulseRoom ',
          branding: {
            publicHandle: '@pulse'
          }
        }
      })
    ).toMatchObject({
      userId: 'organizer-1',
      publicHubPath: '/studio/pulse',
      organizerProfile: {
        companyName: 'PulseRoom',
        branding: {
          publicHandle: 'pulse'
        }
      }
    });
  });
});
