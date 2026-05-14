const crypto = require('crypto');
const AudienceAutomation = require('../models/AudienceAutomation');
const AudienceCampaign = require('../models/AudienceCampaign');
const AudienceCampaignDelivery = require('../models/AudienceCampaignDelivery');
const EventAudience = require('../models/EventAudience');
const {
  applyAudienceCrmFilters,
  mergeAudienceCrmRecords,
  normalizeAudienceCrmFilters
} = require('./crmService');
const {
  applySeriesCrmFilters,
  normalizeSeriesCrmFilters
} = require('./seriesCrmService');

const CAMPAIGN_STATUS_SCHEDULED = 'scheduled';
const CAMPAIGN_STATUS_QUEUED = 'queued';
const CAMPAIGN_STATUS_SENDING = 'sending';
const CAMPAIGN_STATUS_SENT = 'sent';
const CAMPAIGN_STATUS_FAILED = 'failed';
const TRACKING_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64'
);

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildEventUrl = (appOrigin, eventId) =>
  `${String(appOrigin || '').replace(/\/$/, '')}/events/${eventId}`;
const buildSeriesUrl = (appOrigin, seriesId) =>
  `${String(appOrigin || '').replace(/\/$/, '')}/series/${seriesId}`;
const buildTrackingUrl = (publicApiOrigin, kind, token) =>
  `${String(publicApiOrigin || '').replace(/\/$/, '')}/api/notifications/campaigns/track/${kind}/${token}`;

const getCampaignScopeType = (campaign = {}) =>
  campaign.scopeType === 'series' || campaign.seriesId ? 'series' : 'event';

const normalizeScopeFilters = (scopeType, filters = {}) =>
  scopeType === 'series'
    ? normalizeSeriesCrmFilters(filters)
    : normalizeAudienceCrmFilters(filters);

const applyScopeFilters = (scopeType, audience = [], filters = {}) =>
  scopeType === 'series'
    ? applySeriesCrmFilters(audience, filters)
    : applyAudienceCrmFilters(audience, filters);

const buildScopeContextUrl = (config, campaign) =>
  getCampaignScopeType(campaign) === 'series'
    ? buildSeriesUrl(config.appOrigin, campaign.seriesId || campaign.eventId)
    : buildEventUrl(config.appOrigin, campaign.eventId);

const buildScopeCtaLabel = (campaign) =>
  getCampaignScopeType(campaign) === 'series' ? 'Open series' : 'Open event';

const getRecipientOverrides = (campaign = {}) =>
  (Array.isArray(campaign.recipientOverrides) ? campaign.recipientOverrides : []).filter(
    (recipient) => recipient?.userId
  );

const JOURNEY_SKIP_REASON_LABELS = Object.freeze({
  cooldown: 'Suppressed by cooldown',
  goal_already_met: 'Already hit the journey goal'
});

const buildJourneySkippedRecipient = ({
  recipient = {},
  reason = '',
  touchIndex = 0,
  campaignId = '',
  skippedAt = new Date()
}) => ({
  userId: String(recipient?.userId || '').trim(),
  attendeeName: String(recipient?.attendeeName || '').trim(),
  email: String(recipient?.email || '').trim(),
  reason,
  reasonLabel: JOURNEY_SKIP_REASON_LABELS[reason] || 'Skipped',
  touchIndex: Number(touchIndex || 0),
  campaignId: String(campaignId || '').trim(),
  skippedAt
});

const mergeJourneySkippedRecipients = (existing = [], additions = []) => {
  const merged = new Map();

  for (const item of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(additions) ? additions : [])]) {
    const userId = String(item?.userId || '').trim();
    const reason = String(item?.reason || '').trim();
    if (!userId || !reason) {
      continue;
    }

    const touchIndex = Number(item?.touchIndex || 0);
    const campaignId = String(item?.campaignId || '').trim();
    merged.set(`${userId}:${reason}:${touchIndex}:${campaignId}`, {
      userId,
      attendeeName: String(item?.attendeeName || '').trim(),
      email: String(item?.email || '').trim(),
      reason,
      reasonLabel:
        String(item?.reasonLabel || '').trim() || JOURNEY_SKIP_REASON_LABELS[reason] || 'Skipped',
      touchIndex,
      campaignId,
      skippedAt: item?.skippedAt || null
    });
  }

  return [...merged.values()];
};

const buildCampaignDispatchContext = ({
  config,
  campaign,
  scopeMeta = {}
}) => {
  if (campaign.triggerType === 'event_completed_next_drop' && campaign?.journeyMeta?.targetEventId) {
    return {
      ctaUrl: buildEventUrl(config.appOrigin, campaign.journeyMeta.targetEventId),
      ctaLabel: 'View next drop',
      contextTitle:
        campaign.journeyMeta.targetEventTitle || scopeMeta.title || 'event',
      journeyMeta: {
        goalType: campaign.journeyMeta.goalType || 'book_next_event',
        targetEventId: campaign.journeyMeta.targetEventId,
        targetEventTitle: campaign.journeyMeta.targetEventTitle || '',
        targetEventStartsAt: campaign.journeyMeta.targetEventStartsAt || null
      }
    };
  }

  if (campaign.triggerType === 'event_completed_next_drop') {
    if (!scopeMeta?.nextOrganizerEvent?.eventId) {
      return {
        error: 'No published upcoming organizer event is available for this journey.'
      };
    }

    return {
      ctaUrl: buildEventUrl(config.appOrigin, scopeMeta.nextOrganizerEvent.eventId),
      ctaLabel: 'View next drop',
      contextTitle: scopeMeta.nextOrganizerEvent.title || scopeMeta.title || 'event',
      journeyMeta: {
        goalType: 'book_next_event',
        targetEventId: scopeMeta.nextOrganizerEvent.eventId,
        targetEventTitle: scopeMeta.nextOrganizerEvent.title || '',
        targetEventStartsAt: scopeMeta.nextOrganizerEvent.startsAt || null
      }
      };
  }

  if (campaign.triggerType === 'booking_abandoned' && campaign?.journeyMeta?.targetEventId) {
    return {
      ctaUrl: buildScopeContextUrl(config, campaign),
      ctaLabel: 'Complete booking',
      contextTitle: campaign.journeyMeta.targetEventTitle || scopeMeta.title || 'event',
      journeyMeta: {
        goalType: campaign.journeyMeta.goalType || 'confirmed_booking',
        targetEventId: campaign.journeyMeta.targetEventId,
        targetEventTitle: campaign.journeyMeta.targetEventTitle || '',
        targetEventStartsAt: campaign.journeyMeta.targetEventStartsAt || null
      }
    };
  }

  if (campaign.triggerType === 'booking_abandoned') {
    return {
      ctaUrl: buildScopeContextUrl(config, campaign),
      ctaLabel: 'Complete booking',
      contextTitle: scopeMeta.title || 'event',
      journeyMeta: {
        goalType: 'confirmed_booking',
        targetEventId: campaign.eventId,
        targetEventTitle: scopeMeta.title || '',
        targetEventStartsAt: scopeMeta.startsAt || null
      }
    };
  }

  return {
    ctaUrl: buildScopeContextUrl(config, campaign),
    ctaLabel: buildScopeCtaLabel(campaign),
    contextTitle:
      getCampaignScopeType(campaign) === 'series'
        ? (scopeMeta.name || 'series')
        : (scopeMeta.title || 'event')
  };
};

const splitJourneyRecipientsByGoal = async ({
  campaign,
  recipients = []
}) => {
  if (!Array.isArray(recipients) || !recipients.length) {
    return {
      deliverableRecipients: [],
      skippedRecipients: []
    };
  }

  const targetEventId = String(campaign?.journeyMeta?.targetEventId || '').trim();
  if (!targetEventId || campaign?.journeyMeta?.stopOnGoal === false) {
    return {
      deliverableRecipients: recipients,
      skippedRecipients: []
    };
  }

  const userIds = [...new Set(
    recipients
      .map((recipient) => String(recipient?.userId || '').trim())
      .filter(Boolean)
  )];

  if (!userIds.length) {
    return {
      deliverableRecipients: [],
      skippedRecipients: []
    };
  }

  const convertedAudience = await EventAudience.find({
    eventId: targetEventId,
    userId: {
      $in: userIds
    }
  })
    .select('userId')
    .lean();
  const convertedUserIds = new Set(
    convertedAudience.map((entry) => String(entry.userId || '').trim()).filter(Boolean)
  );

  if (!convertedUserIds.size) {
    return {
      deliverableRecipients: recipients,
      skippedRecipients: []
    };
  }

  const touchIndex = Number(campaign?.journeyMeta?.touchIndex || 0);
  const campaignId = campaign?._id?.toString?.() || campaign?._id || '';
  const deliverableRecipients = [];
  const skippedRecipients = [];

  for (const recipient of recipients) {
    const userId = String(recipient?.userId || '').trim();
    if (!userId) {
      continue;
    }

    if (convertedUserIds.has(userId)) {
      skippedRecipients.push(
        buildJourneySkippedRecipient({
          recipient,
          reason: 'goal_already_met',
          touchIndex,
          campaignId,
          skippedAt: new Date()
        })
      );
      continue;
    }

    deliverableRecipients.push(recipient);
  }

  return {
    deliverableRecipients,
    skippedRecipients
  };
};

const syncAutomationDispatchState = async ({
  campaign,
  status,
  dispatchError = ''
}) => {
  const automationId = String(campaign?.automationId || '').trim();
  if (!automationId || campaign?.sourceType !== 'automation') {
    return;
  }

  await AudienceAutomation.findByIdAndUpdate(automationId, {
    $set: {
      lastCampaignId: campaign._id?.toString?.() || campaign._id || '',
      lastDispatchStatus: status,
      lastDispatchError: dispatchError || ''
    }
  });
};

const buildCampaignRecipientCounts = ({ recipients = [], channel = 'both' }) => ({
  recipientCount: recipients.length,
  inAppRecipientCount: channel === 'email' ? 0 : recipients.length,
  emailRecipientCount:
    channel === 'in_app'
      ? 0
      : recipients.filter((recipient) => recipient.email).length
});

const buildCampaignEmailHtml = ({
  attendeeName,
  contextTitle,
  title,
  body,
  clickUrl,
  openTrackingUrl,
  ctaLabel = 'Open'
}) => `
  <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">
    <p>Hi ${escapeHtml(attendeeName || 'there')},</p>
    <p><strong>${escapeHtml(title)}</strong></p>
    <p>${escapeHtml(body).replace(/\n/g, '<br />')}</p>
    <p>
      <a href="${escapeHtml(clickUrl)}" style="display:inline-block;padding:12px 18px;border-radius:9999px;background:#111827;color:#f9fafb;text-decoration:none;font-weight:700;">
        ${escapeHtml(ctaLabel || `Open ${contextTitle || 'details'}`)}
      </a>
    </p>
    <img src="${escapeHtml(openTrackingUrl)}" alt="" width="1" height="1" style="display:block;border:0;outline:none;text-decoration:none;" />
  </div>
`;

const loadCrmEventMeta = async ({ eventServiceClient, eventId }) => {
  const response = await eventServiceClient.get(`/api/events/${eventId}/internal-meta`);
  return response.data.data;
};

const loadBookingAudienceSnapshot = async ({ bookingServiceClient, eventId }) => {
  const response = await bookingServiceClient.get(`/api/bookings/internal/events/${eventId}/audience-crm`);
  return response.data.data;
};

const loadMergedCrmAudience = async ({ bookingServiceClient, eventId, eventMeta }) => {
  const [bookingSnapshot, networkingAudience] = await Promise.all([
    loadBookingAudienceSnapshot({
      bookingServiceClient,
      eventId
    }),
    EventAudience.find({ eventId })
      .select('userId attendeeName email networking')
      .lean()
  ]);

  return mergeAudienceCrmRecords({
    bookingAudience: bookingSnapshot.audience || [],
    networkingAudience,
    eventMeta
  });
};

const loadCrmSeriesMeta = async ({ eventServiceClient, seriesId }) => {
  const response = await eventServiceClient.get(`/api/events/series/${seriesId}/internal-meta`);
  return response.data.data;
};

const loadSeriesCrmAudience = async ({ eventServiceClient, seriesId }) => {
  const response = await eventServiceClient.get(`/api/events/series/${seriesId}/internal-members`);
  return response.data.data.members || [];
};

const createTrackingDelivery = async ({
  campaign,
  recipient,
  channel,
  ctaUrl
}) =>
  AudienceCampaignDelivery.create({
    campaignId: campaign._id.toString(),
    eventId: campaign.eventId,
    organizerId: campaign.organizerId,
    userId: recipient.userId,
    email: recipient.email || '',
    channel,
    trackingToken: crypto.randomUUID(),
    ctaUrl
  });

const markDeliveryOpened = async (filter, at = new Date()) =>
  AudienceCampaignDelivery.findOneAndUpdate(
    filter,
    {
      $set: {
        openedAt: at
      }
    },
    {
      new: true
    }
  );

const markDeliveryClicked = async (filter, at = new Date()) =>
  AudienceCampaignDelivery.findOneAndUpdate(
    filter,
    {
      $set: {
        clickedAt: at,
        openedAt: at
      }
    },
    {
      new: true
    }
  );

const collectCampaignAnalytics = async (campaignIds = []) => {
  const normalizedIds = [...new Set(
    (Array.isArray(campaignIds) ? campaignIds : [])
      .map((campaignId) => String(campaignId || '').trim())
      .filter(Boolean)
  )];

  if (!normalizedIds.length) {
    return new Map();
  }

  const grouped = await AudienceCampaignDelivery.aggregate([
    {
      $match: {
        campaignId: {
          $in: normalizedIds
        }
      }
    },
    {
      $group: {
        _id: '$campaignId',
        targetDeliveryCount: {
          $sum: 1
        },
        deliveredCount: {
          $sum: {
            $cond: [{ $ifNull: ['$deliveredAt', false] }, 1, 0]
          }
        },
        openedCount: {
          $sum: {
            $cond: [{ $ifNull: ['$openedAt', false] }, 1, 0]
          }
        },
        clickedCount: {
          $sum: {
            $cond: [{ $ifNull: ['$clickedAt', false] }, 1, 0]
          }
        }
      }
    }
  ]);

  return new Map(
    grouped.map((entry) => [
      entry._id,
      {
        targetDeliveryCount: Number(entry.targetDeliveryCount || 0),
        deliveredCount: Number(entry.deliveredCount || 0),
        openedCount: Number(entry.openedCount || 0),
        clickedCount: Number(entry.clickedCount || 0)
      }
    ])
  );
};

const buildAnalyticsPayload = (campaign, rawAnalytics = {}) => {
  const fallbackTargetCount =
    Number(campaign.inAppRecipientCount || 0) + Number(campaign.emailRecipientCount || 0);
  const targetDeliveryCount = Number(
    rawAnalytics.targetDeliveryCount !== undefined
      ? rawAnalytics.targetDeliveryCount
      : fallbackTargetCount
  );
  const deliveredCount = Number(rawAnalytics.deliveredCount || 0);
  const openedCount = Number(rawAnalytics.openedCount || 0);
  const clickedCount = Number(rawAnalytics.clickedCount || 0);
  const deliveryDenominator = targetDeliveryCount || 1;
  const openDenominator = deliveredCount || 1;

  return {
    targetDeliveryCount,
    deliveredCount,
    openedCount,
    clickedCount,
    deliveryRate: Number(((deliveredCount / deliveryDenominator) * 100).toFixed(1)),
    openRate: Number(((openedCount / openDenominator) * 100).toFixed(1)),
    clickRate: Number(((clickedCount / openDenominator) * 100).toFixed(1))
  };
};

const serializeAudienceCampaign = (campaign, analytics = null) => ({
  campaignId: campaign._id.toString(),
  scopeType: getCampaignScopeType(campaign),
  scopeId:
    getCampaignScopeType(campaign) === 'series'
      ? (campaign.seriesId || campaign.eventId)
      : campaign.eventId,
  eventId: getCampaignScopeType(campaign) === 'event' ? campaign.eventId : null,
  seriesId: getCampaignScopeType(campaign) === 'series'
    ? (campaign.seriesId || campaign.eventId)
    : null,
  title: campaign.title,
  body: campaign.body,
  channel: campaign.channel,
  sourceType: campaign.sourceType || 'manual',
  automationId: campaign.automationId || null,
  automationName: campaign.automationName || '',
  triggerType: campaign.triggerType || '',
  status: campaign.status || CAMPAIGN_STATUS_SENT,
  scheduledFor: campaign.scheduledFor || null,
  segmentId: campaign.segmentId || null,
  segmentName: campaign.segmentName || '',
  recipientCount: Number(campaign.recipientCount || 0),
  inAppRecipientCount: Number(campaign.inAppRecipientCount || 0),
  emailRecipientCount: Number(campaign.emailRecipientCount || 0),
  filters: normalizeScopeFilters(getCampaignScopeType(campaign), campaign.filters || {}),
  sentAt: campaign.sentAt || null,
  dispatchError: campaign.dispatchError || '',
  createdAt: campaign.createdAt,
  journeyMeta: campaign.journeyMeta || null,
  variantMeta: campaign.variantMeta || null,
  analytics: buildAnalyticsPayload(campaign, analytics || {})
});

const dispatchCampaign = async ({
  campaignId,
  config,
  createNotification,
  queue,
  eventServiceClient,
  bookingServiceClient,
  logger
}) => {
  const campaign = await AudienceCampaign.findOneAndUpdate(
    {
      _id: campaignId,
      status: {
        $in: [CAMPAIGN_STATUS_QUEUED, CAMPAIGN_STATUS_SCHEDULED]
      }
    },
    {
      $set: {
        status: CAMPAIGN_STATUS_SENDING,
        dispatchError: ''
      }
    },
    {
      new: true
    }
  );

  if (!campaign) {
    return AudienceCampaign.findById(campaignId);
  }

  try {
    const scopeType = getCampaignScopeType(campaign);
    const scopeMeta = scopeType === 'series'
      ? await loadCrmSeriesMeta({
          eventServiceClient,
          seriesId: campaign.seriesId || campaign.eventId
        })
      : await loadCrmEventMeta({
          eventServiceClient,
          eventId: campaign.eventId
        });
    const dispatchContext = buildCampaignDispatchContext({
      config,
      campaign,
      scopeMeta
    });

    if (dispatchContext.error) {
      campaign.status = CAMPAIGN_STATUS_FAILED;
      campaign.dispatchError = dispatchContext.error;
      campaign.sentAt = null;
      await campaign.save();
      await syncAutomationDispatchState({
        campaign,
        status: CAMPAIGN_STATUS_FAILED,
        dispatchError: campaign.dispatchError
      });
      return campaign;
    }

    campaign.journeyMeta = dispatchContext.journeyMeta
      ? {
          ...(campaign.journeyMeta || {}),
          ...dispatchContext.journeyMeta
        }
      : (campaign.journeyMeta || null);

    const recipientOverrides = getRecipientOverrides(campaign);
    const audience = recipientOverrides.length
      ? []
      : scopeType === 'series'
        ? await loadSeriesCrmAudience({
            eventServiceClient,
            seriesId: campaign.seriesId || campaign.eventId
          })
        : await loadMergedCrmAudience({
            bookingServiceClient,
            eventId: campaign.eventId,
            eventMeta: scopeMeta
          });
    const recipients = recipientOverrides.length
      ? recipientOverrides
      : applyScopeFilters(scopeType, audience, campaign.filters || {});
    const existingMatchedRecipients = Array.isArray(campaign?.journeyRecipients?.matchedRecipients)
      ? campaign.journeyRecipients.matchedRecipients.filter((recipient) => recipient?.userId)
      : recipientOverrides;
    const existingSkippedRecipients = Array.isArray(campaign?.journeyRecipients?.skippedRecipients)
      ? campaign.journeyRecipients.skippedRecipients
      : [];
    const {
      deliverableRecipients,
      skippedRecipients: goalSkippedRecipients
    } = campaign?.journeyMeta?.goalType
      ? await splitJourneyRecipientsByGoal({
          campaign,
          recipients
        })
      : {
          deliverableRecipients: recipients,
          skippedRecipients: []
        };

    if (existingMatchedRecipients.length || existingSkippedRecipients.length || goalSkippedRecipients.length) {
      campaign.journeyRecipients = {
        matchedRecipients: existingMatchedRecipients,
        skippedRecipients: mergeJourneySkippedRecipients(
          existingSkippedRecipients,
          goalSkippedRecipients
        )
      };
    }

    if (!deliverableRecipients.length) {
      if (campaign?.journeyMeta?.goalType) {
        campaign.recipientCount = 0;
        campaign.inAppRecipientCount = 0;
        campaign.emailRecipientCount = 0;
        campaign.status = CAMPAIGN_STATUS_SENT;
        campaign.dispatchError = 'All targeted attendees already reached the journey goal before this touch was sent.';
        campaign.sentAt = new Date();
        await campaign.save();
        await syncAutomationDispatchState({
          campaign,
          status: CAMPAIGN_STATUS_SENT,
          dispatchError: campaign.dispatchError
        });
        return campaign;
      }

      campaign.status = CAMPAIGN_STATUS_FAILED;
      campaign.dispatchError = recipientOverrides.length
        ? 'No recipients were available for this journey when it was ready to send.'
        : getCampaignScopeType(campaign) === 'series'
          ? 'No series members matched this segment when the campaign was ready to send.'
          : 'No attendees matched this segment when the campaign was ready to send.';
      campaign.sentAt = null;
      await campaign.save();
      await syncAutomationDispatchState({
        campaign,
        status: CAMPAIGN_STATUS_FAILED,
        dispatchError: campaign.dispatchError
      });
      return campaign;
    }

    let inAppRecipientCount = 0;
    let emailRecipientCount = 0;
    let dispatchFailures = 0;

    for (const recipient of deliverableRecipients) {
      const ctaUrl = recipient.ctaUrl || dispatchContext.ctaUrl;
      const ctaLabel = recipient.ctaLabel || dispatchContext.ctaLabel;

      if (campaign.channel !== 'email') {
        try {
          const delivery = await createTrackingDelivery({
            campaign,
            recipient,
            channel: 'in_app',
            ctaUrl
          });
          const clickUrl = buildTrackingUrl(config.apiGatewayUrl, 'click', delivery.trackingToken);
          const notification = await createNotification({
            userId: recipient.userId,
            eventId: campaign.eventId,
            email: recipient.email,
            type: 'crm.campaign',
            title: campaign.title,
            body: campaign.body,
            metadata: {
              campaignId: campaign._id.toString(),
              campaignDeliveryId: delivery._id.toString(),
              ctaUrl,
              trackingUrl: clickUrl,
              ctaLabel,
              scopeType,
              seriesId: campaign.seriesId || null
            }
          });

          delivery.notificationId = notification._id.toString();
          delivery.deliveredAt = new Date();
          await delivery.save();
          inAppRecipientCount += 1;
        } catch (error) {
          dispatchFailures += 1;
          logger?.warn?.({
            message: 'Failed to dispatch in-app CRM campaign delivery',
            campaignId: campaign._id.toString(),
            recipientUserId: recipient.userId,
            error: error.message
          });
        }
      }

      if (campaign.channel !== 'in_app' && recipient.email) {
        try {
          const delivery = await createTrackingDelivery({
            campaign,
            recipient,
            channel: 'email',
            ctaUrl
          });
          const openTrackingUrl = buildTrackingUrl(config.apiGatewayUrl, 'open', delivery.trackingToken);
          const clickUrl = buildTrackingUrl(config.apiGatewayUrl, 'click', delivery.trackingToken);

          await queue.add('send-crm-email', {
            deliveryId: delivery._id.toString(),
            to: recipient.email,
            subject: campaign.title,
            html: buildCampaignEmailHtml({
              attendeeName: recipient.attendeeName,
              contextTitle: dispatchContext.contextTitle,
              title: campaign.title,
              body: campaign.body,
              clickUrl,
              openTrackingUrl,
              ctaLabel
            })
          });
          emailRecipientCount += 1;
        } catch (error) {
          dispatchFailures += 1;
          logger?.warn?.({
            message: 'Failed to queue CRM email delivery',
            campaignId: campaign._id.toString(),
            recipientUserId: recipient.userId,
            error: error.message
          });
        }
      }
    }

    campaign.recipientCount = deliverableRecipients.length;
    campaign.inAppRecipientCount = inAppRecipientCount;
    campaign.emailRecipientCount = emailRecipientCount;
    campaign.sentAt = new Date();

    if (!inAppRecipientCount && !emailRecipientCount) {
      campaign.status = CAMPAIGN_STATUS_FAILED;
      campaign.dispatchError = 'The campaign could not be dispatched to any matching attendees.';
    } else {
      campaign.status = CAMPAIGN_STATUS_SENT;
      campaign.dispatchError =
        dispatchFailures > 0
          ? `${dispatchFailures} ${dispatchFailures === 1 ? 'delivery was' : 'deliveries were'} skipped during dispatch.`
          : '';
    }

    await campaign.save();

    if (
      campaign.status === CAMPAIGN_STATUS_SENT &&
      campaign?.journeyMeta?.resendEnabled &&
      Number(campaign?.journeyMeta?.touchIndex || 0) === 0 &&
      Number(campaign?.journeyMeta?.resendDelayHours || 0) > 0 &&
      deliverableRecipients.length
    ) {
      const resendScheduledFor = new Date(
        Date.now() + Number(campaign.journeyMeta.resendDelayHours || 0) * 60 * 60 * 1000
      );
      const resendRecipientCounts = buildCampaignRecipientCounts({
        recipients: deliverableRecipients,
        channel: campaign.channel
      });
      const resendCampaign = await AudienceCampaign.create({
        scopeType: campaign.scopeType || 'event',
        eventId: campaign.eventId,
        seriesId: campaign.seriesId || '',
        organizerId: campaign.organizerId,
        createdByUserId: campaign.createdByUserId,
        sourceType: campaign.sourceType || 'automation',
        automationId: campaign.automationId || '',
        automationName: campaign.automationName || '',
        triggerType: campaign.triggerType || '',
        segmentId: campaign.segmentId || '',
        segmentName: campaign.segmentName || '',
        title: campaign.title,
        body: campaign.body,
        channel: campaign.channel,
        filters: campaign.filters || {},
        status: CAMPAIGN_STATUS_SCHEDULED,
        scheduledFor: resendScheduledFor,
        recipientOverrides: deliverableRecipients,
        journeyMeta: {
          ...(campaign.journeyMeta || {}),
          resendEnabled: false,
          touchIndex: 1,
          parentCampaignId: campaign._id.toString()
        },
        journeyRecipients: {
          matchedRecipients: deliverableRecipients,
          skippedRecipients: []
        },
        variantMeta: campaign.variantMeta || null,
        ...resendRecipientCounts
      });

      await scheduleCampaignDispatch({
        campaignId: resendCampaign._id.toString(),
        queue,
        scheduledFor: resendScheduledFor
      });
    }

    await syncAutomationDispatchState({
      campaign,
      status: campaign.status,
      dispatchError: campaign.dispatchError
    });

    return campaign;
  } catch (error) {
    campaign.status = CAMPAIGN_STATUS_FAILED;
    campaign.dispatchError = error.message;
    campaign.sentAt = null;
    await campaign.save();
    await syncAutomationDispatchState({
      campaign,
      status: CAMPAIGN_STATUS_FAILED,
      dispatchError: campaign.dispatchError
    });
    throw error;
  }
};

const scheduleCampaignDispatch = async ({
  campaignId,
  queue,
  scheduledFor
}) =>
  queue.add(
    'dispatch-crm-campaign',
    {
      campaignId
    },
    {
      jobId: `crm-campaign:${campaignId}`,
      delay: Math.max(0, new Date(scheduledFor).getTime() - Date.now())
    }
  );

module.exports = {
  CAMPAIGN_STATUS_FAILED,
  CAMPAIGN_STATUS_QUEUED,
  CAMPAIGN_STATUS_SCHEDULED,
  CAMPAIGN_STATUS_SENDING,
  CAMPAIGN_STATUS_SENT,
  TRACKING_PIXEL_GIF,
  buildCampaignDispatchContext,
  buildCampaignRecipientCounts,
  buildCampaignEmailHtml,
  buildTrackingUrl,
  collectCampaignAnalytics,
  dispatchCampaign,
  loadCrmEventMeta,
  loadCrmSeriesMeta,
  loadMergedCrmAudience,
  loadSeriesCrmAudience,
  markDeliveryClicked,
  markDeliveryOpened,
  scheduleCampaignDispatch,
  serializeAudienceCampaign
};
