const {
  buildReferralCode,
  buildReferralLink,
  buildPublicReferralOffer,
  ensureActiveReferralCode,
  getReferralDiscountAmount,
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
        status: 'active',
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

  it('builds an active public offer and calculates the discount amount', () => {
    const event = {
      _id: 'evt_123',
      organizerId: 'org_1',
      title: 'PulseRoom Live',
      referral: {
        code: 'pulse-live-ab12cd34',
        status: 'active',
        discountType: 'percentage',
        discountValue: 10,
        maxRedemptions: 1,
        redemptionsUsed: 0,
        expiresAt: '2099-04-30T10:00:00.000Z'
      }
    };

    expect(
      buildPublicReferralOffer({
        event,
        referralCode: 'pulse-live-ab12cd34'
      })
    ).toMatchObject({
      status: 'active',
      discountType: 'percentage',
      discountValue: 10
    });

    expect(
      getReferralDiscountAmount({
        subtotal: 2500,
        referral: event.referral
      })
    ).toBe(250);
  });

  it('keeps speaker workspace private while exposing post-session resources publicly', () => {
    const event = {
      _id: 'evt_123',
      organizerId: 'org_1',
      title: 'PulseRoom Live',
      speakerWorkspace: {
        greenRoomNotes: 'Private backstage notes'
      },
      sessions: [
        {
          title: 'Opening keynote',
          startsAt: '2026-06-01T10:00:00.000Z',
          endsAt: '2026-06-01T11:00:00.000Z',
          deckUrl: 'https://example.com/private-deck',
          postSessionResources: [
            {
              resourceId: 'res_1',
              label: 'Slides',
              url: 'https://example.com/slides',
              type: 'slides'
            }
          ]
        }
      ]
    };

    const publicEvent = serializeEventForViewer({
      event,
      viewer: null,
      appOrigin: 'http://localhost:5173'
    });
    const ownerEvent = serializeEventForViewer({
      event,
      viewer: { sub: 'org_1', role: 'organizer' },
      appOrigin: 'http://localhost:5173'
    });

    expect(publicEvent.speakerWorkspace).toBeUndefined();
    expect(publicEvent.sessions[0]).toEqual(
      expect.objectContaining({
        postSessionResources: [
          expect.objectContaining({
            label: 'Slides'
          })
        ]
      })
    );
    expect(publicEvent.sessions[0].deckUrl).toBeUndefined();
    expect(ownerEvent.speakerWorkspace.greenRoomNotes).toBe('Private backstage notes');
    expect(ownerEvent.sessions[0].deckUrl).toBe('https://example.com/private-deck');
  });

  it('can prepare a referral code without persisting immediately', async () => {
    const event = {
      title: 'PulseRoom Live',
      status: 'draft',
      startsAt: '2099-06-01T10:00:00.000Z',
      referral: null,
      save: jest.fn()
    };

    await ensureActiveReferralCode(event, { persist: false });

    expect(event.referral).toEqual(
      expect.objectContaining({
        status: 'active',
        discountType: 'percentage',
        discountValue: 10
      })
    );
    expect(event.save).not.toHaveBeenCalled();
  });
});
