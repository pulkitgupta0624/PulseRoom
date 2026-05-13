jest.mock('../models/AudienceCampaign', () => ({
  findOneAndUpdate: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../models/AudienceCampaignDelivery', () => ({
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  aggregate: jest.fn()
}));

jest.mock('../models/EventAudience', () => ({
  find: jest.fn()
}));

jest.mock('./crmService', () => ({
  applyAudienceCrmFilters: jest.fn(),
  mergeAudienceCrmRecords: jest.fn(),
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

const AudienceCampaign = require('../models/AudienceCampaign');
const AudienceCampaignDelivery = require('../models/AudienceCampaignDelivery');
const EventAudience = require('../models/EventAudience');
const {
  applyAudienceCrmFilters,
  mergeAudienceCrmRecords
} = require('./crmService');
const {
  buildCampaignRecipientCounts,
  collectCampaignAnalytics,
  dispatchCampaign,
  serializeAudienceCampaign
} = require('./campaignService');

const createEventAudienceQuery = (rows = []) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows)
  };

  EventAudience.find.mockReturnValue(query);
  return query;
};

const createMockCampaign = (overrides = {}) => ({
  _id: {
    toString: () => 'campaign-1'
  },
  eventId: 'event-1',
  organizerId: 'organizer-1',
  channel: 'in_app',
  title: 'Reminder',
  body: 'See you there',
  filters: {},
  recipientCount: 0,
  inAppRecipientCount: 0,
  emailRecipientCount: 0,
  status: 'queued',
  dispatchError: '',
  save: jest.fn().mockResolvedValue(),
  ...overrides
});

const createMockDelivery = (id, token) => ({
  _id: {
    toString: () => id
  },
  trackingToken: token,
  save: jest.fn().mockResolvedValue()
});

describe('campaignService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildCampaignRecipientCounts reflects channel targeting', () => {
    expect(
      buildCampaignRecipientCounts({
        recipients: [
          { email: 'asha@example.com' },
          { email: '' },
          { email: 'ravi@example.com' }
        ],
        channel: 'both'
      })
    ).toEqual({
      recipientCount: 3,
      inAppRecipientCount: 3,
      emailRecipientCount: 2
    });
  });

  test('dispatchCampaign creates tracked in-app deliveries and marks the campaign sent', async () => {
    const campaign = createMockCampaign();
    const delivery = createMockDelivery('delivery-1', 'track-token-1');
    const createNotification = jest.fn().mockResolvedValue({
      _id: {
        toString: () => 'notification-1'
      }
    });
    const queue = {
      add: jest.fn()
    };

    AudienceCampaign.findOneAndUpdate.mockResolvedValue(campaign);
    AudienceCampaignDelivery.create.mockResolvedValue(delivery);
    createEventAudienceQuery([]);
    mergeAudienceCrmRecords.mockReturnValue([
      {
        userId: 'user-1',
        attendeeName: 'Asha',
        email: 'asha@example.com'
      }
    ]);
    applyAudienceCrmFilters.mockReturnValue([
      {
        userId: 'user-1',
        attendeeName: 'Asha',
        email: 'asha@example.com'
      }
    ]);

    const result = await dispatchCampaign({
      campaignId: 'campaign-1',
      config: {
        appOrigin: 'http://localhost:5173',
        apiGatewayUrl: 'http://localhost:8080'
      },
      createNotification,
      queue,
      eventServiceClient: {
        get: jest.fn().mockResolvedValue({
          data: {
            data: {
              title: 'Pulse Summit'
            }
          }
        })
      },
      bookingServiceClient: {
        get: jest.fn().mockResolvedValue({
          data: {
            data: {
              audience: []
            }
          }
        })
      },
      logger: {
        warn: jest.fn()
      }
    });

    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      metadata: expect.objectContaining({
        campaignId: 'campaign-1',
        campaignDeliveryId: 'delivery-1',
        trackingUrl: 'http://localhost:8080/api/notifications/campaigns/track/click/track-token-1'
      })
    }));
    expect(delivery.notificationId).toBe('notification-1');
    expect(delivery.deliveredAt).toBeInstanceOf(Date);
    expect(queue.add).not.toHaveBeenCalled();
    expect(result.status).toBe('sent');
    expect(result.recipientCount).toBe(1);
    expect(result.inAppRecipientCount).toBe(1);
    expect(result.emailRecipientCount).toBe(0);
  });

  test('dispatchCampaign marks the campaign failed when no attendees match at send time', async () => {
    const campaign = createMockCampaign({
      channel: 'email'
    });

    AudienceCampaign.findOneAndUpdate.mockResolvedValue(campaign);
    createEventAudienceQuery([]);
    mergeAudienceCrmRecords.mockReturnValue([]);
    applyAudienceCrmFilters.mockReturnValue([]);

    const result = await dispatchCampaign({
      campaignId: 'campaign-1',
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
              title: 'Pulse Summit'
            }
          }
        })
      },
      bookingServiceClient: {
        get: jest.fn().mockResolvedValue({
          data: {
            data: {
              audience: []
            }
          }
        })
      },
      logger: {
        warn: jest.fn()
      }
    });

    expect(result.status).toBe('failed');
    expect(result.dispatchError).toContain('No attendees matched this segment');
    expect(campaign.save).toHaveBeenCalled();
  });

  test('collectCampaignAnalytics groups delivery counters by campaign id', async () => {
    AudienceCampaignDelivery.aggregate.mockResolvedValue([
      {
        _id: 'campaign-1',
        targetDeliveryCount: 5,
        deliveredCount: 4,
        openedCount: 3,
        clickedCount: 2
      }
    ]);

    const analytics = await collectCampaignAnalytics(['campaign-1']);

    expect(analytics.get('campaign-1')).toEqual({
      targetDeliveryCount: 5,
      deliveredCount: 4,
      openedCount: 3,
      clickedCount: 2
    });
  });

  test('serializeAudienceCampaign exposes analytics rates for the CRM modal', () => {
    const serialized = serializeAudienceCampaign(
      {
        _id: {
          toString: () => 'campaign-9'
        },
        title: 'Replay is live',
        body: 'The replay is ready for your team.',
        channel: 'both',
        status: 'sent',
        scheduledFor: null,
        recipientCount: 3,
        inAppRecipientCount: 3,
        emailRecipientCount: 2,
        filters: {
          checkedIn: 'all'
        },
        sentAt: '2026-05-13T10:00:00.000Z',
        dispatchError: '',
        createdAt: '2026-05-13T09:00:00.000Z'
      },
      {
        targetDeliveryCount: 5,
        deliveredCount: 4,
        openedCount: 2,
        clickedCount: 1
      }
    );

    expect(serialized.analytics).toEqual({
      targetDeliveryCount: 5,
      deliveredCount: 4,
      openedCount: 2,
      clickedCount: 1,
      deliveryRate: 80,
      openRate: 50,
      clickRate: 25
    });
  });
});
