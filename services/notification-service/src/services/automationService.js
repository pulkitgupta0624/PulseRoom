const crypto = require('crypto');
const { DomainEvents } = require('@pulseroom/common');
const AudienceAutomation = require('../models/AudienceAutomation');
const AudienceCampaign = require('../models/AudienceCampaign');
const AudienceCampaignDelivery = require('../models/AudienceCampaignDelivery');
const EventAudience = require('../models/EventAudience');
const {
  CAMPAIGN_STATUS_FAILED,
  CAMPAIGN_STATUS_QUEUED,
  CAMPAIGN_STATUS_SCHEDULED,
  CAMPAIGN_STATUS_SENT,
  buildCampaignDispatchContext,
  buildCampaignRecipientCounts,
  dispatchCampaign,
  loadCrmSeriesMeta,
  loadSeriesCrmAudience,
  scheduleCampaignDispatch
} = require('./campaignService');
const {
  applyAudienceCrmFilters,
  normalizeAudienceCrmFilters
} = require('./crmService');
const {
  applySeriesCrmFilters,
  normalizeSeriesCrmFilters
} = require('./seriesCrmService');

const AUTOMATION_STATUS_ACTIVE = 'active';
const AUTOMATION_STATUS_PAUSED = 'paused';
const AUTOMATION_TRIGGER_TYPES = Object.freeze({
  EVENT_STARTS_24H: 'event_starts_24h',
  EVENT_STARTS_1H: 'event_starts_1h',
  REPLAY_READY: 'replay_ready',
  BOOKING_ABANDONED: 'booking_abandoned',
  EVENT_COMPLETED_NO_SHOW: 'event_completed_no_show',
  EVENT_COMPLETED_NEXT_DROP: 'event_completed_next_drop',
  SERIES_MEMBERSHIP_ACTIVATED: 'series_membership_activated',
  SERIES_NEXT_EVENT_24H: 'series_next_event_24h'
});

const AUTOMATION_TRIGGER_CONFIG = Object.freeze({
  [AUTOMATION_TRIGGER_TYPES.EVENT_STARTS_24H]: {
    label: '24 hours before event',
    scopeType: 'event',
    scheduleOffsetMs: 24 * 60 * 60 * 1000,
    templates: {
      title: 'You are on tomorrow\'s guest list',
      body: 'Your event starts in 24 hours. Open PulseRoom, lock in your must-see sessions, and arrive ready to jump in.'
    }
  },
  [AUTOMATION_TRIGGER_TYPES.EVENT_STARTS_1H]: {
    label: '1 hour before event',
    scopeType: 'event',
    scheduleOffsetMs: 60 * 60 * 1000,
    templates: {
      title: 'Starting soon: your event opens in one hour',
      body: 'You are one hour out from the event. Double-check your agenda, join links, and any networking plans before doors open.'
    }
  },
  [AUTOMATION_TRIGGER_TYPES.REPLAY_READY]: {
    label: 'Replay is ready',
    scopeType: 'event',
    domainEvent: DomainEvents.REPLAY_AVAILABLE,
    templates: {
      title: 'Replay is live',
      body: 'The replay is ready now. Catch the full event, revisit key moments, and share it with your team.'
    }
  },
  [AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED]: {
    label: 'Abandoned checkout recovery',
    scopeType: 'event',
    domainEvent: DomainEvents.BOOKING_ABANDONED,
    payloadRecipientOnly: true,
    templates: {
      title: 'Your spot is still warm',
      body: 'You were close to checking out. Jump back in, complete your booking, and lock in your place before tickets move.'
    }
  },
  [AUTOMATION_TRIGGER_TYPES.EVENT_COMPLETED_NO_SHOW]: {
    label: 'No-show follow-up after event',
    scopeType: 'event',
    domainEvent: DomainEvents.EVENT_COMPLETED,
    enforcedFilters: {
      checkedIn: 'no-show'
    },
    templates: {
      title: 'We missed you at the event',
      body: 'You missed the live event, but you are still part of the room. Jump into the replay and catch the sessions that mattered most.'
    }
  },
  [AUTOMATION_TRIGGER_TYPES.EVENT_COMPLETED_NEXT_DROP]: {
    label: 'Next drop follow-up after event',
    scopeType: 'event',
    domainEvent: DomainEvents.EVENT_COMPLETED,
    templates: {
      title: 'Keep the momentum going',
      body: 'Thanks for showing up. The next room from this organizer is already live, so grab your seat while the energy is still high.'
    }
  },
  [AUTOMATION_TRIGGER_TYPES.SERIES_MEMBERSHIP_ACTIVATED]: {
    label: 'New member welcome',
    scopeType: 'series',
    domainEvent: DomainEvents.SERIES_MEMBERSHIP_ACTIVATED,
    singleRecipientFromPayload: true,
    templates: {
      title: 'Welcome to the series',
      body: 'Your pass is active now. Open the series hub, explore upcoming drops, and lock in the member perks waiting for you.'
    }
  },
  [AUTOMATION_TRIGGER_TYPES.SERIES_NEXT_EVENT_24H]: {
    label: '24 hours before next series drop',
    scopeType: 'series',
    scheduleOffsetMs: 24 * 60 * 60 * 1000,
    templates: {
      title: 'Your next series drop starts tomorrow',
      body: 'The next live drop is 24 hours away. Check the agenda, claim member pricing, and arrive ready for the next room.'
    }
  }
});

const JOURNEY_TRIGGER_TYPES = new Set([
  AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED,
  AUTOMATION_TRIGGER_TYPES.EVENT_COMPLETED_NEXT_DROP
]);
const JOURNEY_AB_TEST_VARIANT_KEYS = Object.freeze(['A', 'B']);
const JOURNEY_AB_TEST_VARIANT_LABELS = Object.freeze({
  A: 'Variant A',
  B: 'Variant B'
});

const isJourneyOptimizationTrigger = (triggerType) => JOURNEY_TRIGGER_TYPES.has(triggerType);
const getJourneySettingsDefaults = (triggerType) => {
  if (triggerType === AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED) {
    return {
      initialDelayMinutes: 30,
      resendEnabled: true,
      resendDelayHours: 12,
      cooldownHours: 72,
      stopOnGoal: true
    };
  }

  if (triggerType === AUTOMATION_TRIGGER_TYPES.EVENT_COMPLETED_NEXT_DROP) {
    return {
      initialDelayMinutes: 180,
      resendEnabled: true,
      resendDelayHours: 24,
      cooldownHours: 168,
      stopOnGoal: true
    };
  }

  return {
    initialDelayMinutes: 0,
    resendEnabled: false,
    resendDelayHours: 24,
    cooldownHours: 72,
    stopOnGoal: true
  };
};

const normalizePositiveWholeNumber = (value, {
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  fallback = 0
} = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const rounded = Math.trunc(numeric);
  if (rounded < min || rounded > max) {
    return fallback;
  }

  return rounded;
};

const buildRate = (numerator, denominator) =>
  Number((((Number(numerator) || 0) / (Number(denominator) || 1)) * 100).toFixed(1));

const normalizeJourneySettings = (triggerType, settings = {}) => {
  if (!isJourneyOptimizationTrigger(triggerType)) {
    return null;
  }

  const defaults = getJourneySettingsDefaults(triggerType);

  return {
    initialDelayMinutes: normalizePositiveWholeNumber(settings.initialDelayMinutes, {
      min: 0,
      max: 7 * 24 * 60,
      fallback: defaults.initialDelayMinutes
    }),
    resendEnabled:
      settings.resendEnabled === undefined
        ? defaults.resendEnabled
        : Boolean(settings.resendEnabled),
    resendDelayHours: normalizePositiveWholeNumber(settings.resendDelayHours, {
      min: 1,
      max: 7 * 24,
      fallback: defaults.resendDelayHours
    }),
    cooldownHours: normalizePositiveWholeNumber(settings.cooldownHours, {
      min: 0,
      max: 30 * 24,
      fallback: defaults.cooldownHours
    }),
    stopOnGoal:
      settings.stopOnGoal === undefined
        ? defaults.stopOnGoal
        : settings.stopOnGoal !== false
  };
};

const normalizeJourneyAbTest = (triggerType, abTest = {}, fallbackTitle = '', fallbackBody = '') => {
  if (!isJourneyOptimizationTrigger(triggerType)) {
    return null;
  }

  const providedVariants = new Map(
    (Array.isArray(abTest?.variants) ? abTest.variants : [])
      .filter((variant) => JOURNEY_AB_TEST_VARIANT_KEYS.includes(String(variant?.key || '').trim()))
      .map((variant) => [String(variant.key).trim(), variant])
  );
  const variantA = providedVariants.get('A') || {};
  const variantB = providedVariants.get('B') || {};
  const enabled = Boolean(abTest?.enabled);
  const minimumSampleSize = normalizePositiveWholeNumber(abTest?.minimumSampleSize, {
    min: 10,
    max: 100000,
    fallback: 50
  });
  const winnerVariantKey = JOURNEY_AB_TEST_VARIANT_KEYS.includes(
    String(abTest?.winnerVariantKey || '').trim()
  )
    ? String(abTest.winnerVariantKey).trim()
    : '';

  return {
    enabled,
    autoWinnerEnabled: enabled && Boolean(abTest?.autoWinnerEnabled),
    minimumSampleSize,
    winnerVariantKey: enabled ? winnerVariantKey : '',
    variants: JOURNEY_AB_TEST_VARIANT_KEYS.map((key) => ({
      key,
      label: JOURNEY_AB_TEST_VARIANT_LABELS[key],
      title: String(
        (key === 'A'
          ? (variantA.title !== undefined ? variantA.title : fallbackTitle)
          : variantB.title) || ''
      ).trim(),
      body: String(
        (key === 'A'
          ? (variantA.body !== undefined ? variantA.body : fallbackBody)
          : variantB.body) || ''
      ).trim()
    }))
  };
};

const getJourneyAbTestVariant = (abTest = null, variantKey = '') =>
  (Array.isArray(abTest?.variants) ? abTest.variants : []).find(
    (variant) => variant.key === variantKey
  ) || null;

const getAutomationScopeType = (automation = {}) =>
  automation.scopeType || (automation.seriesId ? 'series' : 'event');

const isScheduledAutomationTrigger = (triggerType) =>
  Boolean(AUTOMATION_TRIGGER_CONFIG[triggerType]?.scheduleOffsetMs);

const getAutomationTriggerConfig = (triggerType) =>
  AUTOMATION_TRIGGER_CONFIG[triggerType] || null;

const getAutomationJobId = (automationId) => `crm-automation:${automationId}`;

const isSchedulableAutomationScope = (automation, scopeMeta = {}) => {
  const scopeType = getAutomationScopeType(automation);
  if (scopeType === 'series') {
    return String(scopeMeta.status || '').trim().toLowerCase() === 'active';
  }

  return String(scopeMeta.status || '').trim().toLowerCase() === 'published';
};

const normalizeFiltersForScope = (scopeType, filters = {}) =>
  scopeType === 'series'
    ? normalizeSeriesCrmFilters(filters)
    : normalizeAudienceCrmFilters(filters);

const applyFiltersForScope = (scopeType, audience = [], filters = {}) =>
  scopeType === 'series'
    ? applySeriesCrmFilters(audience, filters)
    : applyAudienceCrmFilters(audience, filters);

const mergeAutomationFilters = (triggerType, filters = {}, scopeType = 'event') => {
  const normalized = normalizeFiltersForScope(scopeType, filters);
  const enforcedFilters = AUTOMATION_TRIGGER_CONFIG[triggerType]?.enforcedFilters || {};

  return {
    ...normalized,
    ...enforcedFilters
  };
};

const computeAutomationScheduledFor = (triggerType, scopeMeta = {}) => {
  const triggerConfig = AUTOMATION_TRIGGER_CONFIG[triggerType];
  if (!triggerConfig?.scheduleOffsetMs) {
    return null;
  }

  const anchorDate =
    triggerType === AUTOMATION_TRIGGER_TYPES.SERIES_NEXT_EVENT_24H
      ? scopeMeta.nextEventStartsAt
      : scopeMeta.startsAt;

  if (!anchorDate) {
    return null;
  }

  return new Date(
    new Date(anchorDate).getTime() - Number(triggerConfig.scheduleOffsetMs || 0)
  );
};

const computeAutomationTriggerKey = (triggerType, scopeMeta = {}, payload = {}) => {
  if (triggerType === AUTOMATION_TRIGGER_TYPES.SERIES_MEMBERSHIP_ACTIVATED) {
    return `series:${payload.seriesId || scopeMeta.seriesId}:membership:${payload.membershipId || payload.userId}:${triggerType}`;
  }

  if (triggerType === AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED) {
    const eventId = payload.eventId || scopeMeta.eventId;
    const bookingId = payload.bookingId || payload.userId;
    if (!eventId || !bookingId) {
      return '';
    }

    return `event:${eventId}:booking:${bookingId}:${triggerType}`;
  }

  if (triggerType === AUTOMATION_TRIGGER_TYPES.SERIES_NEXT_EVENT_24H) {
    if (!scopeMeta.seriesId || !scopeMeta.nextEventId) {
      return '';
    }

    return `series:${scopeMeta.seriesId}:event:${scopeMeta.nextEventId}:${triggerType}`;
  }

  const eventId = payload.eventId || scopeMeta.eventId;
  if (!eventId) {
    return '';
  }

  return `event:${eventId}:${triggerType}`;
};

const hasLegacyTriggeredState = (automation) =>
  Boolean(automation?.lastTriggeredAt) &&
  !Array.isArray(automation?.recentTriggerKeys);

const hasProcessedTriggerKey = (automation, triggerKey) => {
  if (hasLegacyTriggeredState(automation)) {
    return true;
  }

  if (!triggerKey) {
    return false;
  }

  if (Array.isArray(automation?.recentTriggerKeys) && automation.recentTriggerKeys.includes(triggerKey)) {
    return true;
  }

  return false;
};

const appendTriggerKey = (automation, triggerKey) => {
  if (!triggerKey) {
    return;
  }

  const existingKeys = Array.isArray(automation.recentTriggerKeys)
    ? automation.recentTriggerKeys.filter(Boolean)
    : [];

  automation.recentTriggerKeys = [...new Set([...existingKeys, triggerKey])].slice(-25);
};

const removeAutomationDispatchJob = async ({ automationId, queue }) => {
  const job = await queue.getJob(getAutomationJobId(automationId));
  if (job) {
    await job.remove();
  }
};

const scheduleAutomationDispatch = async ({
  automation,
  scopeMeta,
  queue
}) => {
  await removeAutomationDispatchJob({
    automationId: automation._id.toString(),
    queue
  });

  if (
    automation.status !== AUTOMATION_STATUS_ACTIVE ||
    !isScheduledAutomationTrigger(automation.triggerType)
  ) {
    return null;
  }

  if (!isSchedulableAutomationScope(automation, scopeMeta)) {
    return null;
  }

  const triggerKey = computeAutomationTriggerKey(automation.triggerType, scopeMeta);
  if (hasProcessedTriggerKey(automation, triggerKey)) {
    return null;
  }

  const scheduledFor = computeAutomationScheduledFor(automation.triggerType, scopeMeta);
  if (
    !scheduledFor ||
    Number.isNaN(scheduledFor.getTime()) ||
    scheduledFor.getTime() <= Date.now()
  ) {
    return null;
  }

  await queue.add(
    'dispatch-crm-automation',
    {
      automationId: automation._id.toString(),
      triggerKey
    },
    {
      jobId: getAutomationJobId(automation._id.toString()),
      delay: Math.max(0, scheduledFor.getTime() - Date.now())
    }
  );

  return scheduledFor;
};

const serializeAudienceAutomation = (automation) => {
  const scopeType = getAutomationScopeType(automation);

  return {
    automationId: automation._id.toString(),
    scopeType,
    scopeId: scopeType === 'series' ? (automation.seriesId || automation.eventId) : automation.eventId,
    eventId: scopeType === 'event' ? automation.eventId : null,
    seriesId: scopeType === 'series' ? (automation.seriesId || automation.eventId) : null,
    name: automation.name,
    title: automation.title,
    body: automation.body,
    channel: automation.channel,
    triggerType: automation.triggerType,
    triggerLabel:
      AUTOMATION_TRIGGER_CONFIG[automation.triggerType]?.label || automation.triggerType,
    status: automation.status,
    segmentId: automation.segmentId || null,
    segmentName: automation.segmentName || '',
    filters: mergeAutomationFilters(automation.triggerType, automation.filters || {}, scopeType),
    journeySettings: normalizeJourneySettings(automation.triggerType, automation.journeySettings || {}),
    journeyAbTest: normalizeJourneyAbTest(
      automation.triggerType,
      automation.journeyAbTest || {},
      automation.title,
      automation.body
    ),
    scheduledFor: automation.scheduledFor || null,
    lastTriggeredAt: automation.lastTriggeredAt || null,
    lastCampaignId: automation.lastCampaignId || null,
    lastDispatchStatus: automation.lastDispatchStatus || '',
    lastDispatchError: automation.lastDispatchError || '',
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt
  };
};

const loadAutomationScopeMeta = async ({
  automation,
  eventServiceClient
}) => {
  const scopeType = getAutomationScopeType(automation);
  if (scopeType === 'series') {
    return loadCrmSeriesMeta({
      eventServiceClient,
      seriesId: automation.seriesId || automation.eventId
    });
  }

  const eventMetaResponse = await eventServiceClient.get(
    `/api/events/${automation.eventId}/internal-meta`
  );
  return eventMetaResponse.data.data;
};

const loadAutomationAudience = async ({
  automation,
  scopeMeta,
  bookingServiceClient,
  eventServiceClient,
  loadMergedCrmAudience
}) => {
  const scopeType = getAutomationScopeType(automation);
  if (scopeType === 'series') {
    return loadSeriesCrmAudience({
      eventServiceClient,
      seriesId: automation.seriesId || automation.eventId
    });
  }

  return loadMergedCrmAudience({
    bookingServiceClient,
    eventId: automation.eventId,
    eventMeta: scopeMeta
  });
};

const buildPayloadRecipientOverride = (triggerType, triggerPayload = {}) => {
  if (triggerType !== AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED || !triggerPayload.userId) {
    return null;
  }

  const attendeeName = String(triggerPayload.attendeeName || '').trim() || 'Attendee';

  return {
    userId: String(triggerPayload.userId),
    attendeeName,
    email: String(triggerPayload.attendeeEmail || '').trim(),
    tierName: String(triggerPayload.tierName || '').trim(),
    ticketCount: Math.max(1, Number(triggerPayload.quantity || 1)),
    referredBooking: Boolean(String(triggerPayload.referralCode || '').trim()),
    hasCheckedIn: false,
    registeredSessionCount: 0,
    waitlistedSessionCount: 0,
    isNetworkingOptedIn: false,
    isNoShow: false,
    ctaUrl: String(triggerPayload.recoveryUrl || '').trim(),
    ctaLabel: 'Complete booking'
  };
};

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
  reasonLabel: reason === 'cooldown' ? 'Suppressed by cooldown' : 'Skipped',
  touchIndex: Number(touchIndex || 0),
  campaignId: String(campaignId || '').trim(),
  skippedAt
});

const splitJourneyRecipientsForCooldown = async ({
  automationId,
  recipients = [],
  cooldownHours = 0
}) => {
  if (!cooldownHours || !Array.isArray(recipients) || !recipients.length) {
    return {
      deliverableRecipients: recipients,
      skippedRecipients: []
    };
  }

  const cutoff = new Date(Date.now() - Number(cooldownHours || 0) * 60 * 60 * 1000);
  const recentCampaigns = await AudienceCampaign.find({
    automationId,
    sourceType: 'automation',
    createdAt: {
      $gte: cutoff
    },
    status: {
      $in: [CAMPAIGN_STATUS_QUEUED, CAMPAIGN_STATUS_SCHEDULED, CAMPAIGN_STATUS_SENT]
    }
  })
    .select('recipientOverrides')
    .lean();
  const cooledDownUserIds = new Set(
    recentCampaigns
      .flatMap((campaign) => campaign.recipientOverrides || [])
      .map((recipient) => String(recipient?.userId || '').trim())
      .filter(Boolean)
  );

  if (!cooledDownUserIds.size) {
    return {
      deliverableRecipients: recipients,
      skippedRecipients: []
    };
  }

  const deliverableRecipients = [];
  const skippedRecipients = [];

  for (const recipient of recipients) {
    const userId = String(recipient?.userId || '').trim();
    if (!userId) {
      continue;
    }

    if (cooledDownUserIds.has(userId)) {
      skippedRecipients.push(
        buildJourneySkippedRecipient({
          recipient,
          reason: 'cooldown',
          touchIndex: 0,
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

const buildJourneyVariantMeta = ({
  journeyAbTest = null,
  variantKey = ''
}) => {
  if (!journeyAbTest?.enabled || !variantKey) {
    return null;
  }

  const variant = getJourneyAbTestVariant(journeyAbTest, variantKey);
  if (!variant) {
    return null;
  }

  return {
    experimentEnabled: true,
    variantKey,
    variantLabel: variant.label || JOURNEY_AB_TEST_VARIANT_LABELS[variantKey] || variantKey,
    autoWinnerEnabled: Boolean(journeyAbTest.autoWinnerEnabled),
    winnerVariantKey: String(journeyAbTest.winnerVariantKey || '').trim(),
    winnerSelected:
      Boolean(journeyAbTest.winnerVariantKey) &&
      String(journeyAbTest.winnerVariantKey || '').trim() === variantKey
  };
};

const getJourneyExperimentBucket = ({
  automationId,
  userId
}) => {
  const digest = crypto
    .createHash('sha256')
    .update(`${automationId}:${userId}`)
    .digest();

  return digest.readUInt16BE(0) % 100;
};

const splitJourneyRecipientsByVariant = ({
  automationId,
  recipients = [],
  journeyAbTest = null
}) => {
  if (!journeyAbTest?.enabled || !Array.isArray(recipients) || !recipients.length) {
    return [{
      variantKey: '',
      recipients: Array.isArray(recipients) ? recipients : []
    }];
  }

  const winnerVariantKey = JOURNEY_AB_TEST_VARIANT_KEYS.includes(
    String(journeyAbTest.winnerVariantKey || '').trim()
  )
    ? String(journeyAbTest.winnerVariantKey).trim()
    : '';

  if (winnerVariantKey) {
    return [{
      variantKey: winnerVariantKey,
      recipients
    }];
  }

  const buckets = new Map(
    JOURNEY_AB_TEST_VARIANT_KEYS.map((variantKey) => [variantKey, []])
  );

  for (const recipient of recipients) {
    const userId = String(recipient?.userId || '').trim();
    if (!userId) {
      continue;
    }

    const bucketValue = getJourneyExperimentBucket({
      automationId,
      userId
    });
    const variantKey = bucketValue < 50 ? 'A' : 'B';
    buckets.get(variantKey).push(recipient);
  }

  return JOURNEY_AB_TEST_VARIANT_KEYS
    .map((variantKey) => ({
      variantKey,
      recipients: buckets.get(variantKey) || []
    }))
    .filter((entry) => entry.recipients.length);
};

const resolveJourneyAbTestWinner = async ({
  automation,
  journeyAbTest
}) => {
  if (!journeyAbTest?.enabled) {
    return '';
  }

  const configuredWinner = JOURNEY_AB_TEST_VARIANT_KEYS.includes(
    String(journeyAbTest.winnerVariantKey || '').trim()
  )
    ? String(journeyAbTest.winnerVariantKey).trim()
    : '';
  if (configuredWinner || !journeyAbTest.autoWinnerEnabled) {
    return configuredWinner;
  }

  const sentCampaigns = await AudienceCampaign.find({
    automationId: automation._id.toString(),
    sourceType: 'automation',
    status: CAMPAIGN_STATUS_SENT,
    'variantMeta.variantKey': {
      $in: JOURNEY_AB_TEST_VARIANT_KEYS
    }
  })
    .select('recipientOverrides journeyMeta variantMeta sentAt createdAt')
    .lean();

  if (!sentCampaigns.length) {
    return '';
  }

  const sampleUserIdsByVariant = new Map(
    JOURNEY_AB_TEST_VARIANT_KEYS.map((variantKey) => [variantKey, new Set()])
  );
  const campaignsByVariant = new Map(
    JOURNEY_AB_TEST_VARIANT_KEYS.map((variantKey) => [variantKey, []])
  );

  for (const campaign of sentCampaigns) {
    const variantKey = String(campaign?.variantMeta?.variantKey || '').trim();
    if (!campaignsByVariant.has(variantKey)) {
      continue;
    }

    campaignsByVariant.get(variantKey).push(campaign);

    if (Number(campaign?.journeyMeta?.touchIndex || 0) !== 0) {
      continue;
    }

    for (const recipient of Array.isArray(campaign.recipientOverrides) ? campaign.recipientOverrides : []) {
      const userId = String(recipient?.userId || '').trim();
      if (userId) {
        sampleUserIdsByVariant.get(variantKey).add(userId);
      }
    }
  }

  if (
    JOURNEY_AB_TEST_VARIANT_KEYS.some(
      (variantKey) => sampleUserIdsByVariant.get(variantKey).size < Number(journeyAbTest.minimumSampleSize || 0)
    )
  ) {
    return '';
  }

  const campaignIds = sentCampaigns.map((campaign) => campaign?._id?.toString?.() || campaign?._id).filter(Boolean);
  const deliveries = await AudienceCampaignDelivery.find({
    campaignId: {
      $in: campaignIds
    }
  })
    .select('campaignId userId deliveredAt createdAt clickedAt')
    .lean();
  const deliveriesByCampaignId = new Map();
  for (const delivery of deliveries) {
    const campaignId = String(delivery?.campaignId || '').trim();
    if (!campaignId) {
      continue;
    }
    if (!deliveriesByCampaignId.has(campaignId)) {
      deliveriesByCampaignId.set(campaignId, []);
    }
    deliveriesByCampaignId.get(campaignId).push(delivery);
  }

  const targetEventIds = [...new Set(
    sentCampaigns
      .map((campaign) => String(campaign?.journeyMeta?.targetEventId || '').trim())
      .filter(Boolean)
  )];
  const deliveredUserIds = [...new Set(
    deliveries
      .map((delivery) => String(delivery?.userId || '').trim())
      .filter(Boolean)
  )];
  const eventAudiences = targetEventIds.length && deliveredUserIds.length
    ? await EventAudience.find({
        eventId: {
          $in: targetEventIds
        },
        userId: {
          $in: deliveredUserIds
        }
      })
        .select('eventId userId createdAt')
        .lean()
    : [];
  const convertedAtByEventAndUser = new Map(
    eventAudiences.map((entry) => [`${entry.eventId}:${entry.userId}`, new Date(entry.createdAt || 0)])
  );

  const metricsByVariant = new Map(
    JOURNEY_AB_TEST_VARIANT_KEYS.map((variantKey) => [variantKey, {
      sampleSize: sampleUserIdsByVariant.get(variantKey).size,
      deliveredCount: 0,
      clickedCount: 0,
      conversionCandidates: new Map()
    }])
  );

  for (const campaign of sentCampaigns) {
    const campaignId = campaign?._id?.toString?.() || campaign?._id || '';
    const variantKey = String(campaign?.variantMeta?.variantKey || '').trim();
    if (!metricsByVariant.has(variantKey)) {
      continue;
    }

    const variantMetrics = metricsByVariant.get(variantKey);
    const deliveriesForCampaign = deliveriesByCampaignId.get(String(campaignId)) || [];

    for (const delivery of deliveriesForCampaign) {
      const userId = String(delivery?.userId || '').trim();
      if (!userId || !sampleUserIdsByVariant.get(variantKey).has(userId)) {
        continue;
      }

      if (delivery.deliveredAt) {
        variantMetrics.deliveredCount += 1;
      }
      if (delivery.clickedAt) {
        variantMetrics.clickedCount += 1;
      }

      const targetEventId = String(campaign?.journeyMeta?.targetEventId || '').trim();
      if (!targetEventId) {
        continue;
      }

      const eligibleAt = new Date(
        delivery.deliveredAt ||
        delivery.createdAt ||
        campaign.sentAt ||
        campaign.createdAt ||
        0
      );
      if (Number.isNaN(eligibleAt.getTime())) {
        continue;
      }

      const candidateKey = `${targetEventId}:${userId}`;
      const existingCandidate = variantMetrics.conversionCandidates.get(candidateKey);
      if (!existingCandidate || eligibleAt.getTime() < existingCandidate.getTime()) {
        variantMetrics.conversionCandidates.set(candidateKey, eligibleAt);
      }
    }
  }

  const scoredVariants = JOURNEY_AB_TEST_VARIANT_KEYS.map((variantKey) => {
    const metrics = metricsByVariant.get(variantKey);
    let conversionCount = 0;

    for (const [candidateKey, eligibleAt] of metrics.conversionCandidates.entries()) {
      const convertedAt = convertedAtByEventAndUser.get(candidateKey);
      if (convertedAt && convertedAt.getTime() >= eligibleAt.getTime()) {
        conversionCount += 1;
      }
    }

    return {
      variantKey,
      sampleSize: metrics.sampleSize,
      deliveredCount: metrics.deliveredCount,
      clickedCount: metrics.clickedCount,
      conversionCount,
      clickRate: buildRate(metrics.clickedCount, metrics.deliveredCount),
      conversionRate: buildRate(conversionCount, metrics.sampleSize)
    };
  });

  const [variantA, variantB] = scoredVariants;
  if (!variantA || !variantB) {
    return '';
  }

  if (variantA.conversionRate !== variantB.conversionRate) {
    return variantA.conversionRate > variantB.conversionRate ? 'A' : 'B';
  }

  if (variantA.clickRate !== variantB.clickRate) {
    return variantA.clickRate > variantB.clickRate ? 'A' : 'B';
  }

  return 'A';
};

const executeAudienceAutomation = async ({
  automationId,
  config,
  createNotification,
  queue,
  eventServiceClient,
  bookingServiceClient,
  loadMergedCrmAudience,
  logger,
  triggerPayload = {},
  triggerKey: requestedTriggerKey = ''
}) => {
  const automation = await AudienceAutomation.findById(automationId);
  if (!automation || automation.status !== AUTOMATION_STATUS_ACTIVE) {
    return {
      automation,
      campaign: null
    };
  }

  const triggerConfig = AUTOMATION_TRIGGER_CONFIG[automation.triggerType] || {};
  const scopeType = getAutomationScopeType(automation);
  const scopeMeta = await loadAutomationScopeMeta({
    automation,
    eventServiceClient
  });
  const triggerKey = requestedTriggerKey || computeAutomationTriggerKey(
    automation.triggerType,
    {
      ...scopeMeta,
      eventId: scopeType === 'event' ? automation.eventId : undefined,
      seriesId: scopeType === 'series' ? (automation.seriesId || automation.eventId) : undefined
    },
    triggerPayload
  );

  if (hasProcessedTriggerKey(automation, triggerKey)) {
    return {
      automation,
      campaign: null
    };
  }

  const payloadRecipient = buildPayloadRecipientOverride(automation.triggerType, triggerPayload);
  const audience = triggerConfig.payloadRecipientOnly
    ? (payloadRecipient ? [payloadRecipient] : [])
    : await loadAutomationAudience({
        automation,
        scopeMeta,
        bookingServiceClient,
        eventServiceClient,
        loadMergedCrmAudience
      });
  const resolvedFilters = mergeAutomationFilters(automation.triggerType, automation.filters || {}, scopeType);
  let recipients = applyFiltersForScope(scopeType, audience, resolvedFilters);

  if (triggerConfig.singleRecipientFromPayload) {
    recipients = recipients.filter((entry) => entry.userId === triggerPayload.userId);
  }

  const isJourneyTrigger = isJourneyOptimizationTrigger(automation.triggerType);
  const matchedRecipients = [...recipients];
  const journeySettings = normalizeJourneySettings(
    automation.triggerType,
    automation.journeySettings || {}
  );
  let journeyAbTest = normalizeJourneyAbTest(
    automation.triggerType,
    automation.journeyAbTest || {},
    automation.title,
    automation.body
  );
  const automationDispatchContext = isJourneyTrigger
    ? buildCampaignDispatchContext({
        config,
        campaign: {
          triggerType: automation.triggerType,
          eventId: automation.eventId,
          seriesId: scopeType === 'series' ? (automation.seriesId || automation.eventId) : '',
          journeyMeta: null
        },
        scopeMeta
      })
    : null;
  let cooldownSkippedRecipients = [];

  if (isJourneyTrigger) {
    const cooldownResult = await splitJourneyRecipientsForCooldown({
      automationId: automation._id.toString(),
      recipients,
      cooldownHours: journeySettings?.cooldownHours || 0
    });
    recipients = cooldownResult.deliverableRecipients;
    cooldownSkippedRecipients = cooldownResult.skippedRecipients;
    journeyAbTest = journeyAbTest
      ? {
          ...journeyAbTest,
          winnerVariantKey: await resolveJourneyAbTestWinner({
            automation,
            journeyAbTest
          })
        }
      : null;
  }

  const baseCampaignPayload = {
    scopeType,
    eventId: automation.eventId,
    seriesId: scopeType === 'series' ? (automation.seriesId || automation.eventId) : '',
    organizerId: automation.organizerId,
    createdByUserId: automation.updatedByUserId || automation.createdByUserId,
    sourceType: 'automation',
    automationId: automation._id.toString(),
    automationName: automation.name,
    triggerType: automation.triggerType,
    segmentId: automation.segmentId || '',
    segmentName: automation.segmentName || '',
    title: automation.title,
    body: automation.body,
    channel: automation.channel,
    filters: resolvedFilters
  };
  let campaign;
  let dispatchedCampaign;
  let dispatchedCampaigns = [];

  if (!recipients.length || automationDispatchContext?.error) {
    const recipientOverrides = triggerConfig.payloadRecipientOnly || isJourneyTrigger ? recipients : [];
    const recipientCounts = buildCampaignRecipientCounts({
      recipients,
      channel: automation.channel
    });
    const cooldownSuppressed =
      isJourneyTrigger &&
      matchedRecipients.length > 0 &&
      !recipients.length &&
      Number(journeySettings?.cooldownHours || 0) > 0;
    campaign = await AudienceCampaign.create({
      ...baseCampaignPayload,
      recipientOverrides,
      journeyRecipients: isJourneyTrigger
        ? {
            matchedRecipients,
            skippedRecipients: cooldownSkippedRecipients
          }
        : null,
      ...recipientCounts,
      status: CAMPAIGN_STATUS_FAILED,
      journeyMeta: isJourneyTrigger && automationDispatchContext?.journeyMeta
        ? {
            ...automationDispatchContext.journeyMeta,
            stopOnGoal: journeySettings?.stopOnGoal !== false,
            resendEnabled: Boolean(journeySettings?.resendEnabled),
            resendDelayHours: journeySettings?.resendDelayHours || 0,
            touchIndex: 0
          }
        : null,
      dispatchError: automationDispatchContext?.error ||
        (
          cooldownSuppressed
            ? 'All matching attendees are still inside this journey cooldown window.'
            : scopeType === 'series'
              ? 'No series members matched this automation when it fired.'
              : 'No attendees matched this automation when it fired.'
        )
    });
    dispatchedCampaign = campaign;
    dispatchedCampaigns = [campaign];
  } else if (isJourneyTrigger) {
    const scheduledFor = Number(journeySettings?.initialDelayMinutes || 0) > 0
      ? new Date(Date.now() + Number(journeySettings.initialDelayMinutes || 0) * 60 * 1000)
      : null;
    const variantBuckets = splitJourneyRecipientsByVariant({
      automationId: automation._id.toString(),
      recipients,
      journeyAbTest
    });
    const createdCampaigns = [];

    for (const bucket of variantBuckets) {
      const recipientOverrides = bucket.recipients;
      if (!recipientOverrides.length) {
        continue;
      }

      const variant = bucket.variantKey
        ? getJourneyAbTestVariant(journeyAbTest, bucket.variantKey)
        : null;
      const recipientCounts = buildCampaignRecipientCounts({
        recipients: recipientOverrides,
        channel: automation.channel
      });
      const nextCampaign = await AudienceCampaign.create({
        ...baseCampaignPayload,
        title: variant?.title || automation.title,
        body: variant?.body || automation.body,
        recipientOverrides,
        journeyRecipients: {
          matchedRecipients: recipientOverrides,
          skippedRecipients: []
        },
        variantMeta: buildJourneyVariantMeta({
          journeyAbTest,
          variantKey: bucket.variantKey
        }),
        ...recipientCounts,
        status: scheduledFor ? CAMPAIGN_STATUS_SCHEDULED : CAMPAIGN_STATUS_QUEUED,
        scheduledFor,
        journeyMeta: {
          ...(automationDispatchContext?.journeyMeta || {}),
          stopOnGoal: journeySettings?.stopOnGoal !== false,
          resendEnabled: Boolean(journeySettings?.resendEnabled),
          resendDelayHours: journeySettings?.resendDelayHours || 0,
          touchIndex: 0
        }
      });
      createdCampaigns.push(nextCampaign);
    }

    campaign = createdCampaigns[0] || null;

    if (scheduledFor) {
      for (const createdCampaign of createdCampaigns) {
        await scheduleCampaignDispatch({
          campaignId: createdCampaign._id.toString(),
          queue,
          scheduledFor
        });
      }
      dispatchedCampaigns = createdCampaigns;
      dispatchedCampaign = createdCampaigns[0] || null;
    } else {
      for (const createdCampaign of createdCampaigns) {
        const result = await dispatchCampaign({
          campaignId: createdCampaign._id.toString(),
          config,
          createNotification,
          queue,
          eventServiceClient,
          bookingServiceClient,
          logger
        });
        dispatchedCampaigns.push(result);
      }
      dispatchedCampaign = dispatchedCampaigns[0] || null;
    }
  } else {
    const recipientCounts = buildCampaignRecipientCounts({
      recipients,
      channel: automation.channel
    });
    campaign = await AudienceCampaign.create({
      ...baseCampaignPayload,
      recipientOverrides: [],
      journeyRecipients: null,
      ...recipientCounts,
      status: CAMPAIGN_STATUS_QUEUED
    });

    dispatchedCampaign = await dispatchCampaign({
      campaignId: campaign._id.toString(),
      config,
      createNotification,
      queue,
      eventServiceClient,
      bookingServiceClient,
      logger
    });
    dispatchedCampaigns = [dispatchedCampaign];
  }

  const primaryCampaign = dispatchedCampaigns[0] || dispatchedCampaign || campaign;
  const primaryCampaignId =
    primaryCampaign?._id?.toString?.() ||
    primaryCampaign?._id ||
    campaign?._id?.toString?.() ||
    campaign?._id ||
    '';
  const aggregateStatus = dispatchedCampaigns.some((entry) => entry?.status === CAMPAIGN_STATUS_SENT)
    ? 'sent'
    : dispatchedCampaigns.some((entry) => entry?.status === CAMPAIGN_STATUS_SCHEDULED)
      ? 'scheduled'
      : 'failed';
  const aggregateDispatchError =
    dispatchedCampaigns
      .map((entry) => String(entry?.dispatchError || '').trim())
      .filter(Boolean)
      .join(' | ') || '';

  automation.lastTriggeredAt = new Date();
  appendTriggerKey(automation, triggerKey);
  automation.lastCampaignId = primaryCampaignId;
  automation.lastDispatchStatus = aggregateStatus;
  automation.lastDispatchError = aggregateDispatchError;
  automation.journeySettings = journeySettings;
  automation.journeyAbTest = journeyAbTest;
  await automation.save();

  return {
    automation,
    campaign: primaryCampaign,
    campaigns: dispatchedCampaigns
  };
};

const syncAutomationsForEvent = async ({
  eventId,
  queue,
  eventServiceClient
}) => {
  const eventMetaResponse = await eventServiceClient.get(`/api/events/${eventId}/internal-meta`);
  const eventMeta = eventMetaResponse.data.data;
  const automations = await AudienceAutomation.find({
    scopeType: {
      $ne: 'series'
    },
    eventId,
    triggerType: {
      $in: Object.values(AUTOMATION_TRIGGER_TYPES).filter(isScheduledAutomationTrigger)
    }
  });

  for (const automation of automations) {
    const scheduledFor = await scheduleAutomationDispatch({
      automation,
      scopeMeta: {
        ...eventMeta,
        eventId
      },
      queue
    });

    automation.scheduledFor = scheduledFor;
    await automation.save();
  }

  return automations;
};

const syncAutomationsForSeries = async ({
  seriesId,
  queue,
  eventServiceClient
}) => {
  const scopeMeta = await loadCrmSeriesMeta({
    eventServiceClient,
    seriesId
  });
  const automations = await AudienceAutomation.find({
    scopeType: 'series',
    seriesId,
    triggerType: {
      $in: Object.values(AUTOMATION_TRIGGER_TYPES).filter(isScheduledAutomationTrigger)
    }
  });

  for (const automation of automations) {
    const scheduledFor = await scheduleAutomationDispatch({
      automation,
      scopeMeta,
      queue
    });

    automation.scheduledFor = scheduledFor;
    await automation.save();
  }

  return automations;
};

module.exports = {
  AUTOMATION_STATUS_ACTIVE,
  AUTOMATION_STATUS_PAUSED,
  AUTOMATION_TRIGGER_CONFIG,
  AUTOMATION_TRIGGER_TYPES,
  computeAutomationScheduledFor,
  computeAutomationTriggerKey,
  executeAudienceAutomation,
  getAutomationTriggerConfig,
  getAutomationScopeType,
  isJourneyOptimizationTrigger,
  isScheduledAutomationTrigger,
  mergeAutomationFilters,
  normalizeJourneyAbTest,
  normalizeJourneySettings,
  removeAutomationDispatchJob,
  scheduleAutomationDispatch,
  serializeAudienceAutomation,
  syncAutomationsForEvent,
  syncAutomationsForSeries
};
