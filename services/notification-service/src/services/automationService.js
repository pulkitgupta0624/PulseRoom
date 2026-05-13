const { DomainEvents } = require('@pulseroom/common');
const AudienceAutomation = require('../models/AudienceAutomation');
const AudienceCampaign = require('../models/AudienceCampaign');
const {
  CAMPAIGN_STATUS_FAILED,
  CAMPAIGN_STATUS_QUEUED,
  buildCampaignRecipientCounts,
  dispatchCampaign,
  loadCrmSeriesMeta,
  loadSeriesCrmAudience
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
  EVENT_COMPLETED_NO_SHOW: 'event_completed_no_show',
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

const getAutomationScopeType = (automation = {}) =>
  automation.scopeType || (automation.seriesId ? 'series' : 'event');

const isScheduledAutomationTrigger = (triggerType) =>
  Boolean(AUTOMATION_TRIGGER_CONFIG[triggerType]?.scheduleOffsetMs);

const getAutomationTriggerConfig = (triggerType) =>
  AUTOMATION_TRIGGER_CONFIG[triggerType] || null;

const getAutomationJobId = (automationId) => `crm-automation:${automationId}`;

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

  const triggerKey = computeAutomationTriggerKey(automation.triggerType, scopeMeta);
  if (hasProcessedTriggerKey(automation, triggerKey)) {
    return null;
  }

  const scheduledFor = computeAutomationScheduledFor(automation.triggerType, scopeMeta);
  if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
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

  const audience = await loadAutomationAudience({
    automation,
    scopeMeta,
    bookingServiceClient,
    eventServiceClient,
    loadMergedCrmAudience
  });
  const resolvedFilters = mergeAutomationFilters(automation.triggerType, automation.filters || {}, scopeType);
  let recipients = applyFiltersForScope(scopeType, audience, resolvedFilters);

  if (AUTOMATION_TRIGGER_CONFIG[automation.triggerType]?.singleRecipientFromPayload) {
    recipients = recipients.filter((entry) => entry.userId === triggerPayload.userId);
  }

  const recipientCounts = buildCampaignRecipientCounts({
    recipients,
    channel: automation.channel
  });

  const campaign = await AudienceCampaign.create({
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
    filters: resolvedFilters,
    status: CAMPAIGN_STATUS_QUEUED,
    ...recipientCounts
  });

  let dispatchedCampaign = campaign;

  if (!recipients.length) {
    dispatchedCampaign.status = CAMPAIGN_STATUS_FAILED;
    dispatchedCampaign.dispatchError =
      scopeType === 'series'
        ? 'No series members matched this automation when it fired.'
        : 'No attendees matched this automation when it fired.';
    await dispatchedCampaign.save();
  } else {
    dispatchedCampaign = await dispatchCampaign({
      campaignId: campaign._id.toString(),
      config,
      createNotification,
      queue,
      eventServiceClient,
      bookingServiceClient,
      logger
    });
  }

  automation.lastTriggeredAt = new Date();
  appendTriggerKey(automation, triggerKey);
  automation.lastCampaignId = campaign._id.toString();
  automation.lastDispatchStatus =
    dispatchedCampaign.status === CAMPAIGN_STATUS_FAILED ? 'failed' : 'sent';
  automation.lastDispatchError = dispatchedCampaign.dispatchError || '';
  await automation.save();

  return {
    automation,
    campaign: dispatchedCampaign
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
  isScheduledAutomationTrigger,
  mergeAutomationFilters,
  removeAutomationDispatchJob,
  scheduleAutomationDispatch,
  serializeAudienceAutomation,
  syncAutomationsForEvent,
  syncAutomationsForSeries
};
