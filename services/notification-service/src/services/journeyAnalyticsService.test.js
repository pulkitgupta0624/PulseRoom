const {
  EMPTY_JOURNEY_ANALYTICS,
  buildJourneyAnalyticsPayload,
  buildJourneyDetailPayload
} = require('./journeyAnalyticsService');

describe('journeyAnalyticsService', () => {
  test('buildJourneyAnalyticsPayload returns empty analytics when there are no journey automations', () => {
    expect(
      buildJourneyAnalyticsPayload({
        automations: [],
        campaigns: [],
        campaignAnalytics: new Map(),
        deliveries: [],
        eventAudiences: []
      })
    ).toEqual({
      summary: {
        ...EMPTY_JOURNEY_ANALYTICS.summary
      },
      items: []
    });
  });

  test('buildJourneyAnalyticsPayload tracks recovery and next-drop conversions per journey', () => {
    const analytics = buildJourneyAnalyticsPayload({
      automations: [
        {
          _id: {
            toString: () => 'automation-1'
          },
          name: 'Checkout rescue',
          triggerType: 'booking_abandoned',
          status: 'active',
          channel: 'both',
          lastTriggeredAt: '2026-05-14T10:00:00.000Z'
        },
        {
          _id: {
            toString: () => 'automation-2'
          },
          name: 'Next drop follow-up',
          triggerType: 'event_completed_next_drop',
          status: 'active',
          channel: 'both',
          lastTriggeredAt: '2026-05-14T11:00:00.000Z'
        }
      ],
      campaigns: [
        {
          _id: {
            toString: () => 'campaign-1'
          },
          automationId: 'automation-1',
          eventId: 'event-1',
          triggerType: 'booking_abandoned',
          sentAt: '2026-05-14T10:05:00.000Z',
          createdAt: '2026-05-14T10:00:00.000Z',
          journeyMeta: {
            goalType: 'confirmed_booking',
            targetEventId: 'event-1',
            targetEventTitle: 'Pulse Summit'
          }
        },
        {
          _id: {
            toString: () => 'campaign-2'
          },
          automationId: 'automation-2',
          eventId: 'event-1',
          triggerType: 'event_completed_next_drop',
          sentAt: '2026-05-14T11:05:00.000Z',
          createdAt: '2026-05-14T11:00:00.000Z',
          journeyMeta: {
            goalType: 'book_next_event',
            targetEventId: 'event-2',
            targetEventTitle: 'Pulse Encore'
          }
        }
      ],
      campaignAnalytics: new Map([
        ['campaign-1', {
          targetDeliveryCount: 2,
          deliveredCount: 2,
          openedCount: 1,
          clickedCount: 1
        }],
        ['campaign-2', {
          targetDeliveryCount: 3,
          deliveredCount: 3,
          openedCount: 2,
          clickedCount: 1
        }]
      ]),
      deliveries: [
        {
          campaignId: 'campaign-1',
          userId: 'user-1',
          deliveredAt: '2026-05-14T10:01:00.000Z',
          createdAt: '2026-05-14T10:01:00.000Z'
        },
        {
          campaignId: 'campaign-1',
          userId: 'user-2',
          deliveredAt: '2026-05-14T10:02:00.000Z',
          createdAt: '2026-05-14T10:02:00.000Z'
        },
        {
          campaignId: 'campaign-2',
          userId: 'user-3',
          deliveredAt: '2026-05-14T11:01:00.000Z',
          createdAt: '2026-05-14T11:01:00.000Z'
        },
        {
          campaignId: 'campaign-2',
          userId: 'user-3',
          deliveredAt: '2026-05-14T11:01:30.000Z',
          createdAt: '2026-05-14T11:01:30.000Z'
        },
        {
          campaignId: 'campaign-2',
          userId: 'user-4',
          deliveredAt: '2026-05-14T11:02:00.000Z',
          createdAt: '2026-05-14T11:02:00.000Z'
        }
      ],
      eventAudiences: [
        {
          eventId: 'event-1',
          userId: 'user-1',
          createdAt: '2026-05-14T10:10:00.000Z'
        },
        {
          eventId: 'event-2',
          userId: 'user-3',
          createdAt: '2026-05-14T11:20:00.000Z'
        },
        {
          eventId: 'event-2',
          userId: 'user-4',
          createdAt: '2026-05-14T10:20:00.000Z'
        }
      ]
    });

    expect(analytics.summary).toEqual({
      journeyCount: 2,
      activeJourneyCount: 2,
      targetedUsers: 4,
      deliveredCount: 5,
      clickedCount: 2,
      clickRate: 40,
      recoveredCount: 1,
      nextDropConversionCount: 1
    });

    expect(analytics.items).toEqual([
      expect.objectContaining({
        automationId: 'automation-1',
        uniqueRecipientCount: 2,
        deliveredCount: 2,
        clickedCount: 1,
        clickRate: 50,
        conversionCount: 1,
        conversionRate: 50,
        conversionGoalLabel: 'Recovered bookings',
        targetEventTitle: 'Pulse Summit'
      }),
      expect.objectContaining({
        automationId: 'automation-2',
        uniqueRecipientCount: 2,
        deliveredCount: 3,
        clickedCount: 1,
        clickRate: 33.3,
        conversionCount: 1,
        conversionRate: 50,
        conversionGoalLabel: 'Next-drop bookings',
        targetEventId: 'event-2',
        targetEventTitle: 'Pulse Encore'
      })
    ]);
  });

  test('buildJourneyAnalyticsPayload keeps zeroed journeys visible before first send', () => {
    const analytics = buildJourneyAnalyticsPayload({
      automations: [
        {
          _id: {
            toString: () => 'automation-3'
          },
          name: 'Empty journey',
          triggerType: 'event_completed_next_drop',
          status: 'paused',
          channel: 'email'
        }
      ],
      campaigns: [],
      campaignAnalytics: new Map(),
      deliveries: [],
      eventAudiences: []
    });

    expect(analytics.items).toEqual([
      expect.objectContaining({
        automationId: 'automation-3',
        campaignCount: 0,
        uniqueRecipientCount: 0,
        deliveredCount: 0,
        clickedCount: 0,
        conversionCount: 0
      })
    ]);
  });

  test('buildJourneyAnalyticsPayload exposes variant stats and the selected winner', () => {
    const analytics = buildJourneyAnalyticsPayload({
      automations: [
        {
          _id: {
            toString: () => 'automation-ab-1'
          },
          title: 'Variant A title',
          body: 'Variant A body',
          name: 'Checkout rescue',
          triggerType: 'booking_abandoned',
          status: 'active',
          channel: 'both',
          journeyAbTest: {
            enabled: true,
            autoWinnerEnabled: true,
            minimumSampleSize: 50,
            winnerVariantKey: 'B',
            variants: [
              {
                key: 'A',
                title: 'Variant A title',
                body: 'Variant A body'
              },
              {
                key: 'B',
                title: 'Variant B title',
                body: 'Variant B body'
              }
            ]
          }
        }
      ],
      campaigns: [
        {
          _id: {
            toString: () => 'campaign-a'
          },
          automationId: 'automation-ab-1',
          eventId: 'event-1',
          triggerType: 'booking_abandoned',
          recipientOverrides: [{ userId: 'user-a' }],
          variantMeta: {
            variantKey: 'A',
            variantLabel: 'Variant A'
          },
          journeyMeta: {
            goalType: 'confirmed_booking',
            targetEventId: 'event-1',
            targetEventTitle: 'Pulse Summit'
          }
        },
        {
          _id: {
            toString: () => 'campaign-b'
          },
          automationId: 'automation-ab-1',
          eventId: 'event-1',
          triggerType: 'booking_abandoned',
          recipientOverrides: [{ userId: 'user-b' }],
          variantMeta: {
            variantKey: 'B',
            variantLabel: 'Variant B'
          },
          journeyMeta: {
            goalType: 'confirmed_booking',
            targetEventId: 'event-1',
            targetEventTitle: 'Pulse Summit'
          }
        }
      ],
      campaignAnalytics: new Map([
        ['campaign-a', {
          targetDeliveryCount: 1,
          deliveredCount: 1,
          openedCount: 0,
          clickedCount: 0
        }],
        ['campaign-b', {
          targetDeliveryCount: 1,
          deliveredCount: 1,
          openedCount: 1,
          clickedCount: 1
        }]
      ]),
      deliveries: [
        {
          campaignId: 'campaign-a',
          userId: 'user-a',
          deliveredAt: '2026-05-14T10:01:00.000Z',
          createdAt: '2026-05-14T10:01:00.000Z'
        },
        {
          campaignId: 'campaign-b',
          userId: 'user-b',
          deliveredAt: '2026-05-14T10:02:00.000Z',
          clickedAt: '2026-05-14T10:04:00.000Z',
          createdAt: '2026-05-14T10:02:00.000Z'
        }
      ],
      eventAudiences: [
        {
          eventId: 'event-1',
          userId: 'user-b',
          createdAt: '2026-05-14T10:10:00.000Z'
        }
      ]
    });

    expect(analytics.items).toEqual([
      expect.objectContaining({
        automationId: 'automation-ab-1',
        abTestEnabled: true,
        winnerVariantKey: 'B',
        variantStats: [
          expect.objectContaining({
            variantKey: 'A',
            uniqueRecipientCount: 1,
            conversionCount: 0,
            winnerSelected: false
          }),
          expect.objectContaining({
            variantKey: 'B',
            uniqueRecipientCount: 1,
            clickedCount: 1,
            conversionCount: 1,
            winnerSelected: true
          })
        ]
      })
    ]);
  });

  test('buildJourneyDetailPayload groups touches, recipients, conversions, and skips', () => {
    const detail = buildJourneyDetailPayload({
      automation: {
        _id: {
          toString: () => 'automation-9'
        },
        eventId: 'event-1',
        title: 'Variant A title',
        body: 'Variant A body',
        name: 'Checkout rescue',
        triggerType: 'booking_abandoned',
        status: 'active',
        channel: 'both',
        lastTriggeredAt: '2026-05-14T10:00:00.000Z',
        journeyAbTest: {
          enabled: true,
          autoWinnerEnabled: true,
          minimumSampleSize: 50,
          winnerVariantKey: 'B',
          variants: [
            {
              key: 'A',
              title: 'Variant A title',
              body: 'Variant A body'
            },
            {
              key: 'B',
              title: 'Variant B title',
              body: 'Variant B body'
            }
          ]
        }
      },
      campaigns: [
        {
          _id: {
            toString: () => 'campaign-1'
          },
          automationId: 'automation-9',
          eventId: 'event-1',
          status: 'sent',
          createdAt: '2026-05-14T10:00:00.000Z',
          sentAt: '2026-05-14T10:05:00.000Z',
          recipientOverrides: [
            {
              userId: 'user-1',
              attendeeName: 'Asha',
              email: 'asha@example.com'
            },
            {
              userId: 'user-2',
              attendeeName: 'Ravi',
              email: 'ravi@example.com'
            }
          ],
          journeyMeta: {
            goalType: 'confirmed_booking',
            targetEventId: 'event-1',
            targetEventTitle: 'Pulse Summit',
            touchIndex: 0
          },
          variantMeta: {
            variantKey: 'A',
            variantLabel: 'Variant A'
          },
          journeyRecipients: {
            matchedRecipients: [
              {
                userId: 'user-1',
                attendeeName: 'Asha',
                email: 'asha@example.com'
              },
              {
                userId: 'user-2',
                attendeeName: 'Ravi',
                email: 'ravi@example.com'
              },
              {
                userId: 'user-3',
                attendeeName: 'Meera',
                email: 'meera@example.com'
              }
            ],
            skippedRecipients: [
              {
                userId: 'user-3',
                attendeeName: 'Meera',
                email: 'meera@example.com',
                reason: 'cooldown',
                reasonLabel: 'Suppressed by cooldown',
                touchIndex: 0,
                skippedAt: '2026-05-14T10:00:00.000Z'
              }
            ]
          }
        },
        {
          _id: {
            toString: () => 'campaign-2'
          },
          automationId: 'automation-9',
          eventId: 'event-1',
          status: 'sent',
          createdAt: '2026-05-15T10:00:00.000Z',
          sentAt: '2026-05-15T10:05:00.000Z',
          recipientOverrides: [
            {
              userId: 'user-2',
              attendeeName: 'Ravi',
              email: 'ravi@example.com'
            },
            {
              userId: 'user-4',
              attendeeName: 'Noor',
              email: 'noor@example.com'
            }
          ],
          journeyMeta: {
            goalType: 'confirmed_booking',
            targetEventId: 'event-1',
            targetEventTitle: 'Pulse Summit',
            touchIndex: 1
          },
          variantMeta: {
            variantKey: 'B',
            variantLabel: 'Variant B',
            winnerVariantKey: 'B',
            winnerSelected: true
          },
          journeyRecipients: {
            matchedRecipients: [
              {
                userId: 'user-1',
                attendeeName: 'Asha',
                email: 'asha@example.com'
              },
              {
                userId: 'user-2',
                attendeeName: 'Ravi',
                email: 'ravi@example.com'
              },
              {
                userId: 'user-4',
                attendeeName: 'Noor',
                email: 'noor@example.com'
              }
            ],
            skippedRecipients: [
              {
                userId: 'user-1',
                attendeeName: 'Asha',
                email: 'asha@example.com',
                reason: 'goal_already_met',
                reasonLabel: 'Already hit the journey goal',
                touchIndex: 1,
                skippedAt: '2026-05-15T10:05:00.000Z'
              }
            ]
          }
        }
      ],
      campaignAnalytics: new Map([
        ['campaign-1', {
          targetDeliveryCount: 2,
          deliveredCount: 2,
          openedCount: 1,
          clickedCount: 1
        }],
        ['campaign-2', {
          targetDeliveryCount: 2,
          deliveredCount: 2,
          openedCount: 2,
          clickedCount: 1
        }]
      ]),
      deliveries: [
        {
          campaignId: 'campaign-1',
          userId: 'user-1',
          email: 'asha@example.com',
          deliveredAt: '2026-05-14T10:06:00.000Z',
          clickedAt: '2026-05-14T10:08:00.000Z'
        },
        {
          campaignId: 'campaign-1',
          userId: 'user-2',
          email: 'ravi@example.com',
          deliveredAt: '2026-05-14T10:07:00.000Z'
        },
        {
          campaignId: 'campaign-2',
          userId: 'user-2',
          email: 'ravi@example.com',
          deliveredAt: '2026-05-15T10:06:00.000Z',
          clickedAt: '2026-05-15T10:09:00.000Z'
        },
        {
          campaignId: 'campaign-2',
          userId: 'user-4',
          email: 'noor@example.com',
          deliveredAt: '2026-05-15T10:07:00.000Z'
        }
      ],
      eventAudiences: [
        {
          eventId: 'event-1',
          userId: 'user-2',
          attendeeName: 'Ravi',
          email: 'ravi@example.com',
          createdAt: '2026-05-15T11:00:00.000Z'
        },
        {
          eventId: 'event-1',
          userId: 'user-4',
          attendeeName: 'Noor',
          email: 'noor@example.com',
          createdAt: '2026-05-15T12:00:00.000Z'
        }
      ]
    });

    expect(detail.automation).toEqual(expect.objectContaining({
      automationId: 'automation-9',
      abTestEnabled: true,
      winnerVariantKey: 'B',
      conversionGoalLabel: 'Recovered bookings',
      targetEventTitle: 'Pulse Summit'
    }));
    expect(detail.summary).toEqual(expect.objectContaining({
      campaignCount: 2,
      matchedRecipientCount: 4,
      targetedRecipientCount: 3,
      clickedRecipientCount: 2,
      convertedRecipientCount: 2,
      skippedRecipientCount: 2,
      cooldownSkippedCount: 1,
      goalSkippedCount: 1,
      deliveredCount: 4,
      clickedCount: 2,
      clickRate: 50,
      conversionRate: 66.7,
      winnerVariantKey: 'B'
    }));
    expect(detail.touches).toEqual([
      expect.objectContaining({
        campaignId: 'campaign-1',
        touchLabel: 'Touch 1',
        variantLabel: 'Variant A',
        deliveredCount: 2,
        convertedCount: 0,
        skippedRecipientCount: 1
      }),
      expect.objectContaining({
        campaignId: 'campaign-2',
        touchLabel: 'Resend',
        variantLabel: 'Variant B',
        winnerSelected: true,
        deliveredCount: 2,
        convertedCount: 2,
        skippedRecipientCount: 1
      })
    ]);
    expect(detail.variantSummaries).toEqual([
      expect.objectContaining({
        variantKey: 'A',
        uniqueRecipientCount: 2,
        winnerSelected: false
      }),
      expect.objectContaining({
        variantKey: 'B',
        uniqueRecipientCount: 2,
        conversionCount: 2,
        winnerSelected: true
      })
    ]);
    expect(detail.targetedRecipients).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: 'user-2',
        touchCount: 2,
        variantLabels: ['Variant A', 'Variant B'],
        clickedCount: 1,
        convertedAt: new Date('2026-05-15T11:00:00.000Z'),
        attributedTouchLabel: 'Resend'
      })
    ]));
    expect(detail.clickedRecipients).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: 'user-1',
        clickedCount: 1
      }),
      expect.objectContaining({
        userId: 'user-2',
        clickedCount: 1
      })
    ]));
    expect(detail.convertedRecipients).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recordId: 'event-1:user-2',
        attributedTouchLabel: 'Resend',
        attributedVariantLabel: 'Variant B'
      }),
      expect.objectContaining({
        recordId: 'event-1:user-4',
        attributedTouchLabel: 'Resend',
        attributedVariantLabel: 'Variant B'
      })
    ]));
    expect(detail.skippedRecipients).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: 'user-1',
        reasonLabels: ['Already hit the journey goal']
      }),
      expect.objectContaining({
        userId: 'user-3',
        reasonLabels: ['Suppressed by cooldown']
      })
    ]));
  });
});
