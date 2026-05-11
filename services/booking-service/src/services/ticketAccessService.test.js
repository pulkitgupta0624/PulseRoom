const { AppError } = require('@pulseroom/common');
const {
  assertTicketTierAccessible
} = require('./ticketAccessService');

describe('ticketAccessService', () => {
  test('allows tiers that are already on sale', () => {
    expect(() =>
      assertTicketTierAccessible({
        tier: {
          saleStart: '2026-05-01T08:00:00.000Z'
        },
        now: '2026-05-02T08:00:00.000Z'
      })
    ).not.toThrow();
  });

  test('blocks tiers before the public sale window for regular users', () => {
    expect(() =>
      assertTicketTierAccessible({
        tier: {
          saleStart: '2026-05-10T08:00:00.000Z'
        },
        now: '2026-05-08T08:00:00.000Z'
      })
    ).toThrow(AppError);
  });

  test('allows power attendees to use early access inside the configured window', () => {
    expect(() =>
      assertTicketTierAccessible({
        tier: {
          saleStart: '2026-05-10T08:00:00.000Z'
        },
        entitlements: {
          perks: {
            earlyAccess: {
              unlocked: true,
              windowHours: 24
            }
          }
        },
        now: '2026-05-09T12:00:00.000Z'
      })
    ).not.toThrow();
  });
});
