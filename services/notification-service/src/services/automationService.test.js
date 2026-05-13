jest.mock('../models/AudienceAutomation', () => ({
  findById: jest.fn(),
  find: jest.fn()
}));

jest.mock('../models/AudienceCampaign', () => ({
  create: jest.fn()
}));

jest.mock('./campaignService', () => ({
  CAMPAIGN_STATUS_FAILED: 'failed',
  CAMPAIGN_STATUS_QUEUED: 'queued',
  buildCampaignRecipientCounts: jest.fn(),
  dispatchCampaign: jest.fn(),
  loadCrmSeriesMeta: jest.fn(),
  loadSeriesCrmAudience: jest.fn()
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
const {
  buildCampaignRecipientCounts,
  dispatchCampaign
} = require('./campaignService');
const { applyAudienceCrmFilters } = require('./crmService');
const {
  AUTOMATION_TRIGGER_TYPES,
  computeAutomationScheduledFor,
  executeAudienceAutomation,
  mergeAutomationFilters,
  scheduleAutomationDispatch,
  serializeAudienceAutomation
} = require('./automationService');

describe('automationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
