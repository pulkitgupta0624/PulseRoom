const crypto = require('crypto');

jest.mock('../models/AudienceAutomation', () => ({
  findById: jest.fn(),
  find: jest.fn()
}));

jest.mock('../models/AudienceCampaign', () => ({
  create: jest.fn(),
  find: jest.fn()
}));

jest.mock('../models/AudienceCampaignDelivery', () => ({
  find: jest.fn()
}));

jest.mock('../models/EventAudience', () => ({
  find: jest.fn()
}));

jest.mock('./campaignService', () => ({
  CAMPAIGN_STATUS_FAILED: 'failed',
  CAMPAIGN_STATUS_QUEUED: 'queued',
  CAMPAIGN_STATUS_SCHEDULED: 'scheduled',
  CAMPAIGN_STATUS_SENT: 'sent',
  buildCampaignDispatchContext: jest.fn(),
  buildCampaignRecipientCounts: jest.fn(),
  dispatchCampaign: jest.fn(),
  loadCrmSeriesMeta: jest.fn(),
  loadSeriesCrmAudience: jest.fn(),
  scheduleCampaignDispatch: jest.fn()
}));

jest.mock('./crmService', () => ({
  applyAudienceCrmFilters: jest.fn(),
  normalizeAudienceCrmFilters: jest.fn((filters = {}) => ({
    search: '',
    checkedIn: 'all',
    networking: 'all',
    sessionState: 'all',
    ticketType: 'all',
    referral: 'all',
    ...filters
  }))
}));

const AudienceAutomation = require('../models/AudienceAutomation');
const AudienceCampaign = require('../models/AudienceCampaign');
const AudienceCampaignDelivery = require('../models/AudienceCampaignDelivery');
const EventAudience = require('../models/EventAudience');
const {
  buildCampaignDispatchContext,
  buildCampaignRecipientCounts,
  dispatchCampaign,
  scheduleCampaignDispatch
} = require('./campaignService');
const { applyAudienceCrmFilters } = require('./crmService');
const {
  AUTOMATION_TRIGGER_TYPES,
  computeAutomationScheduledFor,
  computeAutomationTriggerKey,
  executeAudienceAutomation,
  mergeAutomationFilters,
  normalizeJourneyAbTest,
  scheduleAutomationDispatch,
  serializeAudienceAutomation
} = require('./automationService');

describe('automationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AudienceCampaign.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([])
    });
    AudienceCampaignDelivery.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([])
    });
    EventAudience.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([])
    });
    buildCampaignDispatchContext.mockImplementation(({ campaign, scopeMeta, config }) => {
      if (campaign.triggerType === AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED) {
        return {
          ctaUrl: `${config.appOrigin}/events/${campaign.eventId}`,
          ctaLabel: 'Complete booking',
          contextTitle: scopeMeta.title || 'event',
          journeyMeta: {
            goalType: 'confirmed_booking',
            targetEventId: campaign.eventId,
            targetEventTitle: scopeMeta.title || ''
          }
        };
      }

      if (campaign.triggerType === AUTOMATION_TRIGGER_TYPES.EVENT_COMPLETED_NEXT_DROP) {
        if (!scopeMeta?.nextOrganizerEvent?.eventId) {
          return {
            error: 'No published upcoming organizer event is available for this journey.'
          };
        }

        return {
          ctaUrl: `${config.appOrigin}/events/${scopeMeta.nextOrganizerEvent.eventId}`,
          ctaLabel: 'View next drop',
          contextTitle: scopeMeta.nextOrganizerEvent.title || scopeMeta.title || 'event',
          journeyMeta: {
            goalType: 'book_next_event',
            targetEventId: scopeMeta.nextOrganizerEvent.eventId,
            targetEventTitle: scopeMeta.nextOrganizerEvent.title || ''
          }
        };
      }

      return {
        ctaUrl: `${config.appOrigin}/events/${campaign.eventId || 'event-1'}`,
        ctaLabel: 'Open event',
        contextTitle: scopeMeta.title || 'event'
      };
    });
  });

  test('computeAutomationScheduledFor returns the right offsets for pre-event triggers', () => {
    expect(
      computeAutomationScheduledFor(AUTOMATION_TRIGGER_TYPES.EVENT_STARTS_24H, {
        startsAt: '2026-05-15T12:00:00.000Z'
      }).toISOString()
    ).toBe('2026-05-14T12:00:00.000Z');

    expect(
      computeAutomationScheduledFor(AUTOMATION_TRIGGER_TYPES.EVENT_STARTS_1H, {
        startsAt: '2026-05-15T12:00:00.000Z'
      }).toISOString()
    ).toBe('2026-05-15T11:00:00.000Z');
  });

  test('mergeAutomationFilters enforces no-show targeting for no-show automations', () => {
    expect(
      mergeAutomationFilters(AUTOMATION_TRIGGER_TYPES.EVENT_COMPLETED_NO_SHOW, {
        checkedIn: 'checked-in',
        networking: 'opted-in'
      })
    ).toEqual({
      search: '',
      checkedIn: 'no-show',
      networking: 'opted-in',
      sessionState: 'all',
      ticketType: 'all',
      referral: 'all'
    });
  });

  test('normalizeJourneyAbTest syncs Variant A from the base automation copy', () => {
    expect(
      normalizeJourneyAbTest(
        AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED,
        {
          enabled: true,
          autoWinnerEnabled: true,
          minimumSampleSize: 80,
          winnerVariantKey: 'B',
          variants: [
            {
              key: 'B',
              title: 'Variant B title',
              body: 'Variant B body'
            }
          ]
        },
        'Variant A title',
        'Variant A body'
      )
    ).toEqual({
      enabled: true,
      autoWinnerEnabled: true,
      minimumSampleSize: 80,
      winnerVariantKey: 'B',
      variants: [
        {
          key: 'A',
          label: 'Variant A',
          title: 'Variant A title',
          body: 'Variant A body'
        },
        {
          key: 'B',
          label: 'Variant B',
          title: 'Variant B title',
          body: 'Variant B body'
        }
      ]
    });
  });

  test('scheduleAutomationDispatch creates a queue job for active time-based automations', async () => {
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({})
    };
    const automation = {
      _id: {
        toString: () => 'automation-1'
      },
      status: 'active',
      lastTriggeredAt: null,
      triggerType: AUTOMATION_TRIGGER_TYPES.EVENT_STARTS_24H
    };

    const scheduledFor = await scheduleAutomationDispatch({
      automation,
      scopeMeta: {
        eventId: 'event-1',
        status: 'published',
        startsAt: '2099-05-15T12:00:00.000Z'
      },
      queue
    });

    expect(queue.add).toHaveBeenCalledWith(
      'dispatch-crm-automation',
      {
        automationId: 'automation-1',
        triggerKey: 'event:event-1:event_starts_24h'
      },
      expect.objectContaining({
        jobId: 'crm-automation:automation-1'
      })
    );
    expect(scheduledFor).toBeInstanceOf(Date);
  });

  test('scheduleAutomationDispatch does not queue reminders for unpublished events', async () => {
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({})
    };
    const automation = {
      _id: {
        toString: () => 'automation-2'
      },
      status: 'active',
      lastTriggeredAt: null,
      triggerType: AUTOMATION_TRIGGER_TYPES.EVENT_STARTS_24H
    };

    const scheduledFor = await scheduleAutomationDispatch({
      automation,
      scopeMeta: {
        eventId: 'event-2',
        status: 'cancelled',
        startsAt: '2099-05-15T12:00:00.000Z'
      },
      queue
    });

    expect(queue.add).not.toHaveBeenCalled();
    expect(scheduledFor).toBeNull();
  });

  test('scheduleAutomationDispatch skips missed reminder windows instead of firing immediately', async () => {
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({})
    };
    const automation = {
      _id: {
        toString: () => 'automation-3'
      },
      status: 'active',
      lastTriggeredAt: null,
      triggerType: AUTOMATION_TRIGGER_TYPES.EVENT_STARTS_24H
    };

    const scheduledFor = await scheduleAutomationDispatch({
      automation,
      scopeMeta: {
        eventId: 'event-3',
        status: 'published',
        startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      },
      queue
    });

    expect(queue.add).not.toHaveBeenCalled();
    expect(scheduledFor).toBeNull();
  });

  test('computeAutomationTriggerKey scopes abandoned-checkout journeys per booking', () => {
    expect(
      computeAutomationTriggerKey(
        AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED,
        {
          eventId: 'event-1'
        },
        {
          eventId: 'event-1',
          bookingId: 'booking-9'
        }
      )
    ).toBe('event:event-1:booking:booking-9:booking_abandoned');
  });

  test('executeAudienceAutomation creates an automated campaign and records the last run', async () => {
    const automation = {
      _id: {
        toString: () => 'automation-1'
      },
      eventId: 'event-1',
      organizerId: 'organizer-1',
      createdByUserId: 'organizer-1',
      updatedByUserId: 'organizer-1',
      name: 'Replay follow-up',
      title: 'Replay is live',
      body: 'Catch the replay now.',
      channel: 'both',
      triggerType: AUTOMATION_TRIGGER_TYPES.REPLAY_READY,
      status: 'active',
      filters: {},
      journeySettings: null,
      lastTriggeredAt: null,
      recentTriggerKeys: [],
      save: jest.fn().mockResolvedValue()
    };
    const campaign = {
      _id: {
        toString: () => 'campaign-1'
      }
    };
    const dispatchedCampaign = {
      status: 'sent',
      dispatchError: ''
    };

    AudienceAutomation.findById.mockResolvedValue(automation);
    applyAudienceCrmFilters.mockReturnValue([
      {
        userId: 'user-1',
        attendeeName: 'Asha',
        email: 'asha@example.com'
      }
    ]);
    buildCampaignRecipientCounts.mockReturnValue({
      recipientCount: 1,
      inAppRecipientCount: 1,
      emailRecipientCount: 1
    });
    AudienceCampaign.create.mockResolvedValue(campaign);
    dispatchCampaign.mockResolvedValue(dispatchedCampaign);

    const result = await executeAudienceAutomation({
      automationId: 'automation-1',
      config: {
        appOrigin: 'http://localhost:5173',
        apiGatewayUrl: 'http://localhost:8080'
      },
      createNotification: jest.fn(),
      queue: {
        add: jest.fn()
      },
      eventServiceClient: {
        get: jest.fn().mockResolvedValue({
          data: {
            data: {
              title: 'Pulse Summit',
              startsAt: '2099-05-15T12:00:00.000Z'
            }
          }
        })
      },
      bookingServiceClient: {
        get: jest.fn()
      },
      loadMergedCrmAudience: jest.fn().mockResolvedValue([
        {
          userId: 'user-1',
          attendeeName: 'Asha',
          email: 'asha@example.com'
        }
      ]),
      logger: {
        warn: jest.fn()
      }
    });

    expect(AudienceCampaign.create).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'automation',
      automationId: 'automation-1',
      automationName: 'Replay follow-up'
    }));
    expect(dispatchCampaign).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'campaign-1'
    }));
    expect(automation.lastCampaignId).toBe('campaign-1');
    expect(automation.lastDispatchStatus).toBe('sent');
    expect(automation.lastTriggeredAt).toBeInstanceOf(Date);
    expect(result.campaign).toBe(dispatchedCampaign);
  });

  test('executeAudienceAutomation builds a payload-only abandoned checkout campaign without loading CRM audience', async () => {
    const automation = {
      _id: {
        toString: () => 'automation-2'
      },
      eventId: 'event-7',
      organizerId: 'organizer-1',
      createdByUserId: 'organizer-1',
      updatedByUserId: 'organizer-1',
      name: 'Checkout rescue',
      title: 'Your spot is still warm',
      body: 'Come back and finish booking.',
      channel: 'both',
      triggerType: AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED,
      status: 'active',
      filters: {},
      journeySettings: {
        initialDelayMinutes: 0,
        resendEnabled: true,
        resendDelayHours: 12,
        cooldownHours: 72,
        stopOnGoal: true
      },
      lastTriggeredAt: null,
      recentTriggerKeys: [],
      save: jest.fn().mockResolvedValue()
    };
    const campaign = {
      _id: {
        toString: () => 'campaign-7'
      }
    };
    const dispatchedCampaign = {
      status: 'sent',
      dispatchError: ''
    };
    const loadMergedCrmAudience = jest.fn().mockResolvedValue([]);

    AudienceAutomation.findById.mockResolvedValue(automation);
    applyAudienceCrmFilters.mockImplementation((audience) => audience);
    buildCampaignRecipientCounts.mockReturnValue({
      recipientCount: 1,
      inAppRecipientCount: 1,
      emailRecipientCount: 1
    });
    AudienceCampaign.create.mockResolvedValue(campaign);
    dispatchCampaign.mockResolvedValue(dispatchedCampaign);

    await executeAudienceAutomation({
      automationId: 'automation-2',
      config: {
        appOrigin: 'http://localhost:5173',
        apiGatewayUrl: 'http://localhost:8080'
      },
      createNotification: jest.fn(),
      queue: {
        add: jest.fn()
      },
      eventServiceClient: {
        get: jest.fn().mockResolvedValue({
          data: {
            data: {
              eventId: 'event-7',
              title: 'Pulse Summit',
              startsAt: '2099-05-15T12:00:00.000Z'
            }
          }
        })
      },
      bookingServiceClient: {
        get: jest.fn()
      },
      loadMergedCrmAudience,
      logger: {
        warn: jest.fn()
      },
      triggerPayload: {
        bookingId: 'booking-9',
        eventId: 'event-7',
        userId: 'user-42',
        attendeeName: 'Asha',
        attendeeEmail: 'asha@example.com',
        tierName: 'VIP',
        quantity: 2,
        recoveryUrl: 'http://localhost:5173/events/event-7?tierId=tier-1'
      }
    });

    expect(loadMergedCrmAudience).not.toHaveBeenCalled();
    expect(AudienceCampaign.create).toHaveBeenCalledWith(expect.objectContaining({
      recipientOverrides: [
        expect.objectContaining({
          userId: 'user-42',
          attendeeName: 'Asha',
          email: 'asha@example.com',
          ticketCount: 2,
          ctaUrl: 'http://localhost:5173/events/event-7?tierId=tier-1',
          ctaLabel: 'Complete booking'
        })
      ],
      journeyRecipients: {
        matchedRecipients: [
          expect.objectContaining({
            userId: 'user-42'
          })
        ],
        skippedRecipients: []
      }
    }));
    expect(dispatchCampaign).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'campaign-7'
    }));
  });

  test('executeAudienceAutomation schedules a delayed first touch for optimized journeys', async () => {
    const automation = {
      _id: {
        toString: () => 'automation-9'
      },
      eventId: 'event-9',
      organizerId: 'organizer-1',
      createdByUserId: 'organizer-1',
      updatedByUserId: 'organizer-1',
      name: 'Next drop push',
      title: 'Keep the momentum going',
      body: 'Book the next event.',
      channel: 'both',
      triggerType: AUTOMATION_TRIGGER_TYPES.EVENT_COMPLETED_NEXT_DROP,
      status: 'active',
      filters: {},
      journeySettings: {
        initialDelayMinutes: 45,
        resendEnabled: true,
        resendDelayHours: 24,
        cooldownHours: 168,
        stopOnGoal: true
      },
      lastTriggeredAt: null,
      recentTriggerKeys: [],
      save: jest.fn().mockResolvedValue()
    };
    const campaign = {
      _id: {
        toString: () => 'campaign-9'
      },
      status: 'scheduled',
      dispatchError: ''
    };

    AudienceAutomation.findById.mockResolvedValue(automation);
    applyAudienceCrmFilters.mockReturnValue([
      {
        userId: 'user-9',
        attendeeName: 'Asha',
        email: 'asha@example.com'
      }
    ]);
    buildCampaignRecipientCounts.mockReturnValue({
      recipientCount: 1,
      inAppRecipientCount: 1,
      emailRecipientCount: 1
    });
    AudienceCampaign.create.mockResolvedValue(campaign);

    const result = await executeAudienceAutomation({
      automationId: 'automation-9',
      config: {
        appOrigin: 'http://localhost:5173',
        apiGatewayUrl: 'http://localhost:8080'
      },
      createNotification: jest.fn(),
      queue: {
        add: jest.fn()
      },
      eventServiceClient: {
        get: jest.fn().mockResolvedValue({
          data: {
            data: {
              title: 'Pulse Summit',
              startsAt: '2099-05-15T12:00:00.000Z',
              nextOrganizerEvent: {
                eventId: 'event-10',
                title: 'Pulse Encore'
              }
            }
          }
        })
      },
      bookingServiceClient: {
        get: jest.fn()
      },
      loadMergedCrmAudience: jest.fn().mockResolvedValue([
        {
          userId: 'user-9',
          attendeeName: 'Asha',
          email: 'asha@example.com'
        }
      ]),
      logger: {
        warn: jest.fn()
      },
      triggerPayload: {
        eventId: 'event-9'
      }
    });

    expect(dispatchCampaign).not.toHaveBeenCalled();
    expect(scheduleCampaignDispatch).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'campaign-9'
    }));
    expect(AudienceCampaign.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'scheduled',
      recipientOverrides: [
        expect.objectContaining({
          userId: 'user-9'
        })
      ],
      journeyRecipients: {
        matchedRecipients: [
          expect.objectContaining({
            userId: 'user-9'
          })
        ],
        skippedRecipients: []
      },
      journeyMeta: expect.objectContaining({
        targetEventId: 'event-10',
        resendEnabled: true,
        resendDelayHours: 24,
        touchIndex: 0
      })
    }));
    expect(automation.lastDispatchStatus).toBe('scheduled');
    expect(result.campaign).toBe(campaign);
  });

  test('executeAudienceAutomation stores cooldown-suppressed recipients on journey campaigns', async () => {
    const automation = {
      _id: {
        toString: () => 'automation-10'
      },
      eventId: 'event-10',
      organizerId: 'organizer-1',
      createdByUserId: 'organizer-1',
      updatedByUserId: 'organizer-1',
      name: 'Checkout rescue',
      title: 'Your spot is still warm',
      body: 'Complete your booking.',
      channel: 'both',
      triggerType: AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED,
      status: 'active',
      filters: {},
      journeySettings: {
        initialDelayMinutes: 0,
        resendEnabled: true,
        resendDelayHours: 12,
        cooldownHours: 72,
        stopOnGoal: true
      },
      lastTriggeredAt: null,
      recentTriggerKeys: [],
      save: jest.fn().mockResolvedValue()
    };
    const campaign = {
      _id: {
        toString: () => 'campaign-10'
      }
    };

    AudienceAutomation.findById.mockResolvedValue(automation);
    applyAudienceCrmFilters.mockReturnValue([
      {
        userId: 'user-77',
        attendeeName: 'Asha',
        email: 'asha@example.com'
      }
    ]);
    AudienceCampaign.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          recipientOverrides: [
            {
              userId: 'user-77'
            }
          ]
        }
      ])
    });
    buildCampaignRecipientCounts.mockReturnValue({
      recipientCount: 0,
      inAppRecipientCount: 0,
      emailRecipientCount: 0
    });
    AudienceCampaign.create.mockResolvedValue(campaign);

    await executeAudienceAutomation({
      automationId: 'automation-10',
      config: {
        appOrigin: 'http://localhost:5173',
        apiGatewayUrl: 'http://localhost:8080'
      },
      createNotification: jest.fn(),
      queue: {
        add: jest.fn()
      },
      eventServiceClient: {
        get: jest.fn().mockResolvedValue({
          data: {
            data: {
              eventId: 'event-10',
              title: 'Pulse Summit',
              startsAt: '2099-05-15T12:00:00.000Z'
            }
          }
        })
      },
      bookingServiceClient: {
        get: jest.fn()
      },
      loadMergedCrmAudience: jest.fn(),
      logger: {
        warn: jest.fn()
      },
      triggerPayload: {
        bookingId: 'booking-10',
        eventId: 'event-10',
        userId: 'user-77',
        attendeeName: 'Asha',
        attendeeEmail: 'asha@example.com'
      }
    });

    expect(AudienceCampaign.create).toHaveBeenCalledWith(expect.objectContaining({
      recipientOverrides: [],
      journeyRecipients: {
        matchedRecipients: [
          expect.objectContaining({
            userId: 'user-77'
          })
        ],
        skippedRecipients: [
          expect.objectContaining({
            userId: 'user-77',
            reason: 'cooldown',
            reasonLabel: 'Suppressed by cooldown'
          })
        ]
      },
      dispatchError: 'All matching attendees are still inside this journey cooldown window.'
    }));
  });

  test('executeAudienceAutomation splits journey recipients into variant-specific campaigns', async () => {
    const automation = {
      _id: {
        toString: () => 'automation-ab-1'
      },
      eventId: 'event-11',
      organizerId: 'organizer-1',
      createdByUserId: 'organizer-1',
      updatedByUserId: 'organizer-1',
      name: 'Checkout rescue',
      title: 'Variant A title',
      body: 'Variant A body',
      channel: 'both',
      triggerType: AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED,
      status: 'active',
      filters: {},
      journeySettings: {
        initialDelayMinutes: 0,
        resendEnabled: false,
        resendDelayHours: 12,
        cooldownHours: 0,
        stopOnGoal: true
      },
      journeyAbTest: {
        enabled: true,
        autoWinnerEnabled: false,
        minimumSampleSize: 50,
        winnerVariantKey: '',
        variants: [
          {
            key: 'A',
            label: 'Variant A',
            title: 'Variant A title',
            body: 'Variant A body'
          },
          {
            key: 'B',
            label: 'Variant B',
            title: 'Variant B title',
            body: 'Variant B body'
          }
        ]
      },
      lastTriggeredAt: null,
      recentTriggerKeys: [],
      save: jest.fn().mockResolvedValue()
    };
    const recipients = [
      { userId: 'user-a', attendeeName: 'Asha', email: 'asha@example.com' },
      { userId: 'user-b', attendeeName: 'Ravi', email: 'ravi@example.com' },
      { userId: 'user-c', attendeeName: 'Noor', email: 'noor@example.com' },
      { userId: 'user-d', attendeeName: 'Meera', email: 'meera@example.com' }
    ];
    const expectedBuckets = recipients.reduce((accumulator, recipient) => {
      const bucket = crypto
        .createHash('sha256')
        .update(`automation-ab-1:${recipient.userId}`)
        .digest()
        .readUInt16BE(0) % 100;
      const key = bucket < 50 ? 'A' : 'B';
      accumulator[key].push(recipient.userId);
      return accumulator;
    }, { A: [], B: [] });

    AudienceAutomation.findById.mockResolvedValue(automation);
    applyAudienceCrmFilters.mockReturnValue(recipients);
    buildCampaignRecipientCounts.mockImplementation(({ recipients: nextRecipients = [], channel }) => ({
      recipientCount: nextRecipients.length,
      inAppRecipientCount: channel === 'email' ? 0 : nextRecipients.length,
      emailRecipientCount:
        channel === 'in_app'
          ? 0
          : nextRecipients.filter((recipient) => recipient.email).length
    }));
    let createIndex = 0;
    AudienceCampaign.create.mockImplementation(async (payload) => {
      createIndex += 1;
      const id = `campaign-ab-${createIndex}`;
      return {
        _id: {
          toString: () => id
        },
        status: payload.status,
        dispatchError: '',
        variantMeta: payload.variantMeta
      };
    });
    dispatchCampaign.mockImplementation(async ({ campaignId }) => ({
      _id: {
        toString: () => campaignId
      },
      status: 'sent',
      dispatchError: ''
    }));

    await executeAudienceAutomation({
      automationId: 'automation-ab-1',
      config: {
        appOrigin: 'http://localhost:5173',
        apiGatewayUrl: 'http://localhost:8080'
      },
      createNotification: jest.fn(),
      queue: {
        add: jest.fn()
      },
      eventServiceClient: {
        get: jest.fn().mockResolvedValue({
          data: {
            data: {
              eventId: 'event-11',
              title: 'Pulse Summit',
              startsAt: '2099-05-15T12:00:00.000Z'
            }
          }
        })
      },
      bookingServiceClient: {
        get: jest.fn()
      },
      loadMergedCrmAudience: jest.fn().mockResolvedValue(recipients),
      logger: {
        warn: jest.fn()
      },
      triggerPayload: {
        bookingId: 'booking-11',
        eventId: 'event-11',
        userId: 'user-a',
        attendeeName: 'Asha',
        attendeeEmail: 'asha@example.com'
      }
    });

    expect(AudienceCampaign.create).toHaveBeenCalledTimes(
      Number(Boolean(expectedBuckets.A.length)) + Number(Boolean(expectedBuckets.B.length))
    );
    if (expectedBuckets.A.length) {
      expect(AudienceCampaign.create).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Variant A title',
        body: 'Variant A body',
        recipientOverrides: expectedBuckets.A.map((userId) => expect.objectContaining({ userId })),
        variantMeta: expect.objectContaining({
          variantKey: 'A',
          variantLabel: 'Variant A'
        })
      }));
    }
    if (expectedBuckets.B.length) {
      expect(AudienceCampaign.create).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Variant B title',
        body: 'Variant B body',
        recipientOverrides: expectedBuckets.B.map((userId) => expect.objectContaining({ userId })),
        variantMeta: expect.objectContaining({
          variantKey: 'B',
          variantLabel: 'Variant B'
        })
      }));
    }
  });

  test('executeAudienceAutomation routes future journey sends to the auto-selected winner', async () => {
    const automation = {
      _id: {
        toString: () => 'automation-ab-2'
      },
      eventId: 'event-12',
      organizerId: 'organizer-1',
      createdByUserId: 'organizer-1',
      updatedByUserId: 'organizer-1',
      name: 'Next drop push',
      title: 'Variant A title',
      body: 'Variant A body',
      channel: 'both',
      triggerType: AUTOMATION_TRIGGER_TYPES.EVENT_COMPLETED_NEXT_DROP,
      status: 'active',
      filters: {},
      journeySettings: {
        initialDelayMinutes: 0,
        resendEnabled: false,
        resendDelayHours: 24,
        cooldownHours: 0,
        stopOnGoal: true
      },
      journeyAbTest: {
        enabled: true,
        autoWinnerEnabled: true,
        minimumSampleSize: 10,
        winnerVariantKey: '',
        variants: [
          {
            key: 'A',
            label: 'Variant A',
            title: 'Variant A title',
            body: 'Variant A body'
          },
          {
            key: 'B',
            label: 'Variant B',
            title: 'Variant B title',
            body: 'Variant B body'
          }
        ]
      },
      lastTriggeredAt: null,
      recentTriggerKeys: [],
      save: jest.fn().mockResolvedValue()
    };
    const historicalVariantARecipients = Array.from({ length: 10 }, (_, index) => ({
      userId: `user-old-a-${index + 1}`
    }));
    const historicalVariantBRecipients = Array.from({ length: 10 }, (_, index) => ({
      userId: `user-old-b-${index + 1}`
    }));
    const historicalCampaigns = [
      {
        _id: {
          toString: () => 'campaign-history-a'
        },
        recipientOverrides: historicalVariantARecipients,
        journeyMeta: { targetEventId: 'event-13', touchIndex: 0 },
        variantMeta: { variantKey: 'A', variantLabel: 'Variant A' },
        sentAt: '2026-05-14T10:00:00.000Z',
        createdAt: '2026-05-14T10:00:00.000Z'
      },
      {
        _id: {
          toString: () => 'campaign-history-b'
        },
        recipientOverrides: historicalVariantBRecipients,
        journeyMeta: { targetEventId: 'event-13', touchIndex: 0 },
        variantMeta: { variantKey: 'B', variantLabel: 'Variant B' },
        sentAt: '2026-05-14T10:00:00.000Z',
        createdAt: '2026-05-14T10:00:00.000Z'
      }
    ];
    AudienceAutomation.findById.mockResolvedValue(automation);
    AudienceCampaign.find
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(historicalCampaigns)
      });
    AudienceCampaignDelivery.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        ...historicalVariantARecipients.map((recipient, index) => ({
          campaignId: 'campaign-history-a',
          userId: recipient.userId,
          deliveredAt: '2026-05-14T10:05:00.000Z',
          clickedAt: index < 2 ? '2026-05-14T10:07:00.000Z' : null
        })),
        ...historicalVariantBRecipients.map((recipient, index) => ({
          campaignId: 'campaign-history-b',
          userId: recipient.userId,
          deliveredAt: '2026-05-14T10:05:00.000Z',
          clickedAt: index < 5 ? '2026-05-14T10:07:00.000Z' : null
        }))
      ])
    });
    EventAudience.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          eventId: 'event-13',
          userId: historicalVariantARecipients[0].userId,
          createdAt: '2026-05-14T10:30:00.000Z'
        },
        {
          eventId: 'event-13',
          userId: historicalVariantBRecipients[0].userId,
          createdAt: '2026-05-14T10:30:00.000Z'
        },
        {
          eventId: 'event-13',
          userId: historicalVariantBRecipients[1].userId,
          createdAt: '2026-05-14T10:31:00.000Z'
        },
        {
          eventId: 'event-13',
          userId: historicalVariantBRecipients[2].userId,
          createdAt: '2026-05-14T10:32:00.000Z'
        }
      ])
    });
    applyAudienceCrmFilters.mockReturnValue([
      { userId: 'user-1', attendeeName: 'Asha', email: 'asha@example.com' },
      { userId: 'user-2', attendeeName: 'Ravi', email: 'ravi@example.com' }
    ]);
    buildCampaignRecipientCounts.mockImplementation(({ recipients: nextRecipients = [], channel }) => ({
      recipientCount: nextRecipients.length,
      inAppRecipientCount: channel === 'email' ? 0 : nextRecipients.length,
      emailRecipientCount:
        channel === 'in_app'
          ? 0
          : nextRecipients.filter((recipient) => recipient.email).length
    }));
    AudienceCampaign.create.mockResolvedValue({
      _id: {
        toString: () => 'campaign-winner-b'
      },
      status: 'queued',
      dispatchError: '',
      variantMeta: {
        variantKey: 'B',
        variantLabel: 'Variant B'
      }
    });
    dispatchCampaign.mockResolvedValue({
      _id: {
        toString: () => 'campaign-winner-b'
      },
      status: 'sent',
      dispatchError: ''
    });

    await executeAudienceAutomation({
      automationId: 'automation-ab-2',
      config: {
        appOrigin: 'http://localhost:5173',
        apiGatewayUrl: 'http://localhost:8080'
      },
      createNotification: jest.fn(),
      queue: {
        add: jest.fn()
      },
      eventServiceClient: {
        get: jest.fn().mockResolvedValue({
          data: {
            data: {
              title: 'Pulse Summit',
              startsAt: '2099-05-15T12:00:00.000Z',
              nextOrganizerEvent: {
                eventId: 'event-13',
                title: 'Pulse Encore'
              }
            }
          }
        })
      },
      bookingServiceClient: {
        get: jest.fn()
      },
      loadMergedCrmAudience: jest.fn().mockResolvedValue([
        { userId: 'user-1', attendeeName: 'Asha', email: 'asha@example.com' },
        { userId: 'user-2', attendeeName: 'Ravi', email: 'ravi@example.com' }
      ]),
      logger: {
        warn: jest.fn()
      },
      triggerPayload: {
        eventId: 'event-12'
      }
    });

    expect(AudienceCampaign.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Variant B title',
      body: 'Variant B body',
      recipientOverrides: [
        expect.objectContaining({ userId: 'user-1' }),
        expect.objectContaining({ userId: 'user-2' })
      ],
      variantMeta: expect.objectContaining({
        variantKey: 'B',
        winnerSelected: true,
        winnerVariantKey: 'B'
      })
    }));
    expect(automation.journeyAbTest.winnerVariantKey).toBe('B');
  });

  test('serializeAudienceAutomation includes the friendly trigger label', () => {
    expect(
      serializeAudienceAutomation({
        _id: {
          toString: () => 'automation-1'
        },
        name: 'No-show winback',
        title: 'We missed you',
        body: 'Watch the replay.',
        channel: 'both',
        triggerType: AUTOMATION_TRIGGER_TYPES.EVENT_COMPLETED_NO_SHOW,
        status: 'active',
        filters: {},
        segmentId: '',
        segmentName: '',
        journeyAbTest: null,
        scheduledFor: null,
        lastTriggeredAt: null,
        lastCampaignId: null,
        lastDispatchStatus: '',
        lastDispatchError: '',
        createdAt: '2026-05-13T09:00:00.000Z',
        updatedAt: '2026-05-13T09:30:00.000Z'
      })
    ).toMatchObject({
      automationId: 'automation-1',
      triggerLabel: 'No-show follow-up after event',
      status: 'active'
    });
  });
});
