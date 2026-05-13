const crypto = require('crypto');
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
    const audience = scopeType === 'series'
      ? await loadSeriesCrmAudience({
          eventServiceClient,
          seriesId: campaign.seriesId || campaign.eventId
        })
      : await loadMergedCrmAudience({
          bookingServiceClient,
          eventId: campaign.eventId,
          eventMeta: scopeMeta
        });
    const recipients = applyScopeFilters(scopeType, audience, campaign.filters || {});

    if (!recipients.length) {
      campaign.status = CAMPAIGN_STATUS_FAILED;
      campaign.dispatchError =
        getCampaignScopeType(campaign) === 'series'
          ? 'No series members matched this segment when the campaign was ready to send.'
          : 'No attendees matched this segment when the campaign was ready to send.';
      campaign.sentAt = null;
      await campaign.save();
      return campaign;
    }

    const ctaUrl = buildScopeContextUrl(config, campaign);
    const ctaLabel = buildScopeCtaLabel(campaign);
    let inAppRecipientCount = 0;
    let emailRecipientCount = 0;
    let dispatchFailures = 0;

    for (const recipient of recipients) {
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
              contextTitle:
                scopeType === 'series'
                  ? (scopeMeta.name || 'series')
                  : (scopeMeta.title || 'event'),
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

    campaign.recipientCount = recipients.length;
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
    return campaign;
  } catch (error) {
    campaign.status = CAMPAIGN_STATUS_FAILED;
    campaign.dispatchError = error.message;
    campaign.sentAt = null;
    await campaign.save();
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
