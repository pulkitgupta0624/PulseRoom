const {
  buildSeriesEventSnapshot,
  buildSeriesMembershipPerksSnapshot,
  cloneEventForSeries,
  normalizeSeriesMembershipSettings
} = require('./seriesService');

describe('seriesService', () => {
  const series = {
    _id: 'series-1',
    name: 'Founder Circle',
    slug: 'founder-circle',
    summary: 'Recurring founder sessions',
    cadenceLabel: 'Monthly',
    membershipSettings: {
      planName: 'Circle Pass',
      discountPercent: 12,
      earlyAccessHours: 48,
      membersOnlyBooking: true,
      perks: ['Early access', 'Replay library']
    },
    theme: {
      accentColor: '#224466',
      coverImageUrl: 'https://example.com/cover.jpg'
    }
  };

  it('builds a series snapshot for events', () => {
    expect(buildSeriesEventSnapshot(series, { position: 3 })).toEqual({
      seriesId: 'series-1',
      slug: 'founder-circle',
      name: 'Founder Circle',
      summary: 'Recurring founder sessions',
      cadenceLabel: 'Monthly',
      accentColor: '#224466',
      coverImageUrl: 'https://example.com/cover.jpg',
      planName: 'Circle Pass',
      discountPercent: 12,
      earlyAccessHours: 48,
      membersOnlyBooking: true,
      position: 3,
      seasonLabel: ''
    });
  });

  it('builds normalized membership perks snapshots', () => {
    expect(buildSeriesMembershipPerksSnapshot(series)).toEqual({
      planName: 'Circle Pass',
      price: 0,
      currency: 'INR',
      discountPercent: 12,
      earlyAccessHours: 48,
      includesReplayLibrary: true,
      vipNetworking: false,
      membersOnlyBooking: true,
      perks: ['Early access', 'Replay library']
    });
  });

  it('clones event sessions and ticket sale windows by date delta', () => {
    const sourceEvent = {
      title: 'Founder Circle April',
      summary: 'Monthly roundtable',
      description: 'A working session',
      type: 'online',
      visibility: 'public',
      timezone: 'Asia/Calcutta',
      startsAt: '2026-04-10T10:00:00.000Z',
      endsAt: '2026-04-10T12:00:00.000Z',
      categories: ['business'],
      tags: ['founders'],
      sessions: [
        {
          title: 'Roundtable',
          startsAt: '2026-04-10T10:30:00.000Z',
          endsAt: '2026-04-10T11:30:00.000Z'
        }
      ],
      ticketTiers: [
        {
          tierId: 'tier-1',
          name: 'General',
          price: 100,
          quantity: 20,
          saleStart: '2026-04-01T10:00:00.000Z',
          saleEnd: '2026-04-10T09:00:00.000Z'
        }
      ],
      acceptedCurrencies: ['INR']
    };

    const clone = cloneEventForSeries({
      sourceEvent,
      series,
      organizerId: 'organizer-1',
      startsAt: '2026-05-10T10:00:00.000Z',
      position: 2
    });

    expect(clone.startsAt.toISOString()).toBe('2026-05-10T10:00:00.000Z');
    expect(clone.endsAt.toISOString()).toBe('2026-05-10T12:00:00.000Z');
    expect(clone.sessions[0].startsAt.toISOString()).toBe('2026-05-10T10:30:00.000Z');
    expect(clone.ticketTiers[0].saleStart.toISOString()).toBe('2026-05-01T10:00:00.000Z');
    expect(clone.series.position).toBe(2);
  });

  it('normalizes membership defaults', () => {
    expect(normalizeSeriesMembershipSettings({})).toMatchObject({
      enabled: true,
      allowSelfJoin: true,
      planName: 'Series Pass',
      currency: 'INR',
      earlyAccessHours: 0
    });
  });
});
