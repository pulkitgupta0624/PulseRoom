const {
  buildReferralCode,
  buildReferralLink,
  serializeEventForViewer
} = require('./referralService');

describe('referralService', () => {
  it('builds stable-looking referral codes from the event title', () => {
    expect(buildReferralCode('AI Summit 2026')).toMatch(/^ai-summit-20-[a-f0-9]{8}$/);
  });

  it('adds a referral link for the event owner', () => {
    const event = {
      _id: 'evt_123',
      organizerId: 'org_1',
      title: 'PulseRoom Live',
      referral: {
        code: 'pulse-live-ab12cd34',
        clicks: 4
      }
    };

    expect(
      buildReferralLink(event, 'http://localhost:5173/')
    ).toBe('http://localhost:5173/events/evt_123?ref=pulse-live-ab12cd34');

    expect(
      serializeEventForViewer({
        event,
        viewer: { sub: 'org_1', role: 'organizer' },
        appOrigin: 'http://localhost:5173'
      }).referralLink
    ).toBe('http://localhost:5173/events/evt_123?ref=pulse-live-ab12cd34');
  });
});
