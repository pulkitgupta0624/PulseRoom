const AudienceAutomation = require('../models/AudienceAutomation');
const AudienceCampaign = require('../models/AudienceCampaign');
const AudienceCampaignDelivery = require('../models/AudienceCampaignDelivery');
const EventAudience = require('../models/EventAudience');
const { collectCampaignAnalytics } = require('./campaignService');
const {
  AUTOMATION_TRIGGER_CONFIG,
  AUTOMATION_TRIGGER_TYPES,
  normalizeJourneyAbTest
} = require('./automationService');

const JOURNEY_TRIGGER_TYPES = new Set([
  AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED,
  AUTOMATION_TRIGGER_TYPES.EVENT_COMPLETED_NEXT_DROP
]);

const EMPTY_JOURNEY_ANALYTICS = Object.freeze({
  summary: {
    journeyCount: 0,
    activeJourneyCount: 0,
    targetedUsers: 0,
    deliveredCount: 0,
    clickedCount: 0,
    clickRate: 0,
    recoveredCount: 0,
    nextDropConversionCount: 0
  },
  items: []
});

const JOURNEY_GOAL_LABELS = Object.freeze({
  confirmed_booking: 'Recovered bookings',
  book_next_event: 'Next-drop bookings'
});

const JOURNEY_SKIP_REASON_LABELS = Object.freeze({
  cooldown: 'Suppressed by cooldown',
  goal_already_met: 'Already hit the journey goal'
});

const toIdString = (value) =>
  value?._id?.toString?.() ||
  value?._id ||
  value?.toString?.() ||
  '';

const normalizeJourneyMeta = (campaign = {}) => {
  if (campaign?.journeyMeta) {
    return {
      goalType: String(campaign.journeyMeta.goalType || '').trim(),
      targetEventId: String(campaign.journeyMeta.targetEventId || '').trim(),
      targetEventTitle: String(campaign.journeyMeta.targetEventTitle || '').trim(),
      targetEventStartsAt: campaign.journeyMeta.targetEventStartsAt || null
    };
  }

  if (campaign.triggerType === AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED) {
    return {
      goalType: 'confirmed_booking',
      targetEventId: String(campaign.eventId || '').trim(),
      targetEventTitle: '',
      targetEventStartsAt: null
    };
  }

  return {
    goalType: '',
    targetEventId: '',
    targetEventTitle: '',
    targetEventStartsAt: null
  };
};

const buildRate = (numerator, denominator) =>
  Number((((Number(numerator) || 0) / (Number(denominator) || 1)) * 100).toFixed(1));

const buildJourneyTouchLabel = (touchIndex = 0) => {
  const normalizedTouchIndex = Number(touchIndex || 0);
  if (normalizedTouchIndex === 0) {
    return 'Touch 1';
  }
  if (normalizedTouchIndex === 1) {
    return 'Resend';
  }
  return `Touch ${normalizedTouchIndex + 1}`;
};

const normalizeRecipientProfile = (recipient = {}) => ({
  userId: String(recipient?.userId || '').trim(),
  attendeeName: String(recipient?.attendeeName || '').trim(),
  email: String(recipient?.email || '').trim()
});

const normalizeJourneyAbTestConfig = (automation = {}) =>
  normalizeJourneyAbTest(
    automation?.triggerType,
    automation?.journeyAbTest || {},
    automation?.title || '',
    automation?.body || ''
  );

const normalizeVariantMeta = (campaign = {}) => {
  if (!campaign?.variantMeta?.variantKey) {
    return null;
  }

  return {
    experimentEnabled: Boolean(campaign.variantMeta.experimentEnabled),
    variantKey: String(campaign.variantMeta.variantKey || '').trim(),
    variantLabel: String(campaign.variantMeta.variantLabel || '').trim() || 'Variant',
    autoWinnerEnabled: Boolean(campaign.variantMeta.autoWinnerEnabled),
    winnerVariantKey: String(campaign.variantMeta.winnerVariantKey || '').trim(),
    winnerSelected: Boolean(campaign.variantMeta.winnerSelected)
  };
};

const mergeRecipientProfile = (current = {}, incoming = {}) => ({
  ...current,
  attendeeName: current.attendeeName || incoming.attendeeName || '',
  email: current.email || incoming.email || ''
});

const setEarliestDate = (currentValue, candidateValue) => {
  if (!candidateValue) {
    return currentValue || null;
  }

  const candidate = new Date(candidateValue);
  if (Number.isNaN(candidate.getTime())) {
    return currentValue || null;
  }

  if (!currentValue) {
    return candidate;
  }

  const current = new Date(currentValue);
  if (Number.isNaN(current.getTime()) || candidate.getTime() < current.getTime()) {
    return candidate;
  }

  return currentValue;
};

const setLatestDate = (currentValue, candidateValue) => {
  if (!candidateValue) {
    return currentValue || null;
  }

  const candidate = new Date(candidateValue);
  if (Number.isNaN(candidate.getTime())) {
    return currentValue || null;
  }

  if (!currentValue) {
    return candidate;
  }

  const current = new Date(currentValue);
  if (Number.isNaN(current.getTime()) || candidate.getTime() > current.getTime()) {
    return candidate;
  }

  return currentValue;
};

const createTargetedRecipientEntry = (recipient = {}) => {
  const profile = normalizeRecipientProfile(recipient);
  return {
    ...profile,
    touchLabels: new Set(),
    variantLabels: new Set(),
    firstTargetedAt: null,
    lastTargetedAt: null,
    deliveredCount: 0,
    clickedCount: 0,
    firstClickedAt: null,
    lastClickedAt: null,
    convertedAt: null,
    targetEventId: '',
    targetEventTitle: '',
    attributedTouchLabel: ''
  };
};

const createSkippedRecipientEntry = (recipient = {}) => {
  const profile = normalizeRecipientProfile(recipient);
  return {
    ...profile,
    reasons: new Set(),
    reasonLabels: new Set(),
    touchLabels: new Set(),
    variantLabels: new Set(),
    firstSkippedAt: null,
    lastSkippedAt: null
  };
};

const toSerializableRecipientList = (entries = [], sortField = '') =>
  entries
    .map((entry) => ({
      ...entry,
      touchLabels: Array.isArray(entry.touchLabels)
        ? entry.touchLabels
        : [...(entry.touchLabels || [])],
      variantLabels: Array.isArray(entry.variantLabels)
        ? entry.variantLabels
        : [...(entry.variantLabels || [])],
      reasonLabels: Array.isArray(entry.reasonLabels)
        ? entry.reasonLabels
        : [...(entry.reasonLabels || [])],
      reasons: Array.isArray(entry.reasons)
        ? entry.reasons
        : [...(entry.reasons || [])],
      touchCount: Array.isArray(entry.touchLabels)
        ? entry.touchLabels.length
        : (entry.touchLabels?.size || 0),
      variantCount: Array.isArray(entry.variantLabels)
        ? entry.variantLabels.length
        : (entry.variantLabels?.size || 0),
      skipCount: Array.isArray(entry.reasonLabels)
        ? entry.reasonLabels.length
        : (entry.reasonLabels?.size || 0)
    }))
    .sort((left, right) => {
      if (sortField) {
        const leftTime = left?.[sortField] ? new Date(left[sortField]).getTime() : 0;
        const rightTime = right?.[sortField] ? new Date(right[sortField]).getTime() : 0;
        if (rightTime !== leftTime) {
          return rightTime - leftTime;
        }
      }

      return String(left.attendeeName || left.email || left.userId).localeCompare(
        String(right.attendeeName || right.email || right.userId)
      );
    });

const buildJourneyAnalyticsPayload = ({
  automations = [],
  campaigns = [],
  campaignAnalytics = new Map(),
  deliveries = [],
  eventAudiences = []
}) => {
  const relevantAutomations = (Array.isArray(automations) ? automations : []).filter((automation) =>
    JOURNEY_TRIGGER_TYPES.has(String(automation?.triggerType || '').trim())
  );

  if (!relevantAutomations.length) {
    return {
      summary: {
        ...EMPTY_JOURNEY_ANALYTICS.summary
      },
      items: []
    };
  }

  const campaignsByAutomationId = new Map();
  for (const campaign of Array.isArray(campaigns) ? campaigns : []) {
    const automationId = String(campaign?.automationId || '').trim();
    if (!automationId) {
      continue;
    }

    if (!campaignsByAutomationId.has(automationId)) {
      campaignsByAutomationId.set(automationId, []);
    }
    campaignsByAutomationId.get(automationId).push(campaign);
  }

  const deliveriesByCampaignId = new Map();
  for (const delivery of Array.isArray(deliveries) ? deliveries : []) {
    const campaignId = String(delivery?.campaignId || '').trim();
    if (!campaignId) {
      continue;
    }

    if (!deliveriesByCampaignId.has(campaignId)) {
      deliveriesByCampaignId.set(campaignId, []);
    }
    deliveriesByCampaignId.get(campaignId).push(delivery);
  }

  const audienceCreatedAtByEventAndUser = new Map();
  for (const audience of Array.isArray(eventAudiences) ? eventAudiences : []) {
    const eventId = String(audience?.eventId || '').trim();
    const userId = String(audience?.userId || '').trim();
    if (!eventId || !userId) {
      continue;
    }

    const createdAt = new Date(audience.createdAt || 0);
    if (Number.isNaN(createdAt.getTime())) {
      continue;
    }

    audienceCreatedAtByEventAndUser.set(`${eventId}:${userId}`, createdAt);
  }

  const items = relevantAutomations.map((automation) => {
    const automationId = toIdString(automation);
    const relatedCampaigns = campaignsByAutomationId.get(automationId) || [];
    const journeyAbTest = normalizeJourneyAbTestConfig(automation);
    const uniqueRecipientIds = new Set();
    const conversionCandidates = new Map();
    const variantAggregates = new Map();

    let targetDeliveryCount = 0;
    let deliveredCount = 0;
    let openedCount = 0;
    let clickedCount = 0;

    for (const campaign of relatedCampaigns) {
      const campaignId = toIdString(campaign);
      const analytics = campaignAnalytics.get(campaignId) || {};
      const campaignDeliveries = deliveriesByCampaignId.get(campaignId) || [];
      const journeyMeta = normalizeJourneyMeta(campaign);
      const variantMeta = normalizeVariantMeta(campaign);

      targetDeliveryCount += Number(analytics.targetDeliveryCount || 0);
      deliveredCount += Number(analytics.deliveredCount || 0);
      openedCount += Number(analytics.openedCount || 0);
      clickedCount += Number(analytics.clickedCount || 0);

      if (variantMeta?.variantKey) {
        if (!variantAggregates.has(variantMeta.variantKey)) {
          variantAggregates.set(variantMeta.variantKey, {
            variantKey: variantMeta.variantKey,
            variantLabel: variantMeta.variantLabel,
            uniqueRecipientIds: new Set(),
            deliveredCount: 0,
            clickedCount: 0,
            conversionCandidates: new Map()
          });
        }
        const variantAggregate = variantAggregates.get(variantMeta.variantKey);
        for (const recipient of Array.isArray(campaign.recipientOverrides) ? campaign.recipientOverrides : []) {
          const userId = String(recipient?.userId || '').trim();
          if (userId) {
            variantAggregate.uniqueRecipientIds.add(userId);
          }
        }
        variantAggregate.deliveredCount += Number(analytics.deliveredCount || 0);
        variantAggregate.clickedCount += Number(analytics.clickedCount || 0);
      }

      for (const delivery of campaignDeliveries) {
        const userId = String(delivery?.userId || '').trim();
        if (!userId) {
          continue;
        }

        uniqueRecipientIds.add(userId);

        if (!journeyMeta.targetEventId) {
          continue;
        }

        const deliveredAt = new Date(
          delivery.deliveredAt ||
          delivery.createdAt ||
          campaign.sentAt ||
          campaign.createdAt ||
          0
        );
        if (Number.isNaN(deliveredAt.getTime())) {
          continue;
        }

        const candidateKey = `${journeyMeta.targetEventId}:${userId}`;
        const existingCandidate = conversionCandidates.get(candidateKey);
        if (!existingCandidate || deliveredAt.getTime() < existingCandidate.eligibleAt.getTime()) {
          conversionCandidates.set(candidateKey, {
            userId,
            targetEventId: journeyMeta.targetEventId,
            eligibleAt: deliveredAt
          });
        }

        if (variantMeta?.variantKey && variantAggregates.has(variantMeta.variantKey)) {
          const variantAggregate = variantAggregates.get(variantMeta.variantKey);
          const existingVariantCandidate = variantAggregate.conversionCandidates.get(candidateKey);
          if (
            !existingVariantCandidate ||
            deliveredAt.getTime() < existingVariantCandidate.eligibleAt.getTime()
          ) {
            variantAggregate.conversionCandidates.set(candidateKey, {
              userId,
              targetEventId: journeyMeta.targetEventId,
              eligibleAt: deliveredAt
            });
          }
        }
      }
    }

    let conversionCount = 0;
    for (const candidate of conversionCandidates.values()) {
      const convertedAt = audienceCreatedAtByEventAndUser.get(
        `${candidate.targetEventId}:${candidate.userId}`
      );
      if (convertedAt && convertedAt.getTime() >= candidate.eligibleAt.getTime()) {
        conversionCount += 1;
      }
    }

    const variantStats = [...variantAggregates.values()].map((variantAggregate) => {
      let variantConversionCount = 0;

      for (const candidate of variantAggregate.conversionCandidates.values()) {
        const convertedAt = audienceCreatedAtByEventAndUser.get(
          `${candidate.targetEventId}:${candidate.userId}`
        );
        if (convertedAt && convertedAt.getTime() >= candidate.eligibleAt.getTime()) {
          variantConversionCount += 1;
        }
      }

      return {
        variantKey: variantAggregate.variantKey,
        variantLabel: variantAggregate.variantLabel,
        uniqueRecipientCount: variantAggregate.uniqueRecipientIds.size,
        deliveredCount: variantAggregate.deliveredCount,
        clickedCount: variantAggregate.clickedCount,
        conversionCount: variantConversionCount,
        clickRate: buildRate(variantAggregate.clickedCount, variantAggregate.deliveredCount),
        conversionRate: buildRate(
          variantConversionCount,
          variantAggregate.uniqueRecipientIds.size
        ),
        winnerSelected: Boolean(
          journeyAbTest?.winnerVariantKey &&
          journeyAbTest.winnerVariantKey === variantAggregate.variantKey
        )
      };
    }).sort((left, right) => left.variantKey.localeCompare(right.variantKey));

    const latestCampaign = relatedCampaigns[0] || null;
    const latestJourneyMeta = latestCampaign ? normalizeJourneyMeta(latestCampaign) : normalizeJourneyMeta(automation);
    const uniqueRecipientCount = uniqueRecipientIds.size;

    return {
      automationId,
      name: automation.name,
      triggerType: automation.triggerType,
      triggerLabel:
        AUTOMATION_TRIGGER_CONFIG[automation.triggerType]?.label || automation.triggerType,
      status: automation.status,
      channel: automation.channel,
      lastTriggeredAt: automation.lastTriggeredAt || null,
      lastDispatchStatus: automation.lastDispatchStatus || '',
      lastDispatchError: automation.lastDispatchError || '',
      latestSentAt: latestCampaign?.sentAt || null,
      campaignCount: relatedCampaigns.length,
      targetDeliveryCount,
      deliveredCount,
      openedCount,
      clickedCount,
      uniqueRecipientCount,
      openRate: buildRate(openedCount, deliveredCount),
      clickRate: buildRate(clickedCount, deliveredCount),
      conversionCount,
      conversionRate: buildRate(conversionCount, uniqueRecipientCount),
      abTestEnabled: Boolean(journeyAbTest?.enabled),
      winnerVariantKey: journeyAbTest?.winnerVariantKey || '',
      variantStats,
      conversionGoalLabel:
        JOURNEY_GOAL_LABELS[latestJourneyMeta.goalType] ||
        (automation.triggerType === AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED
          ? JOURNEY_GOAL_LABELS.confirmed_booking
          : JOURNEY_GOAL_LABELS.book_next_event),
      targetEventId: latestJourneyMeta.targetEventId || '',
      targetEventTitle: latestJourneyMeta.targetEventTitle || '',
      targetEventStartsAt: latestJourneyMeta.targetEventStartsAt || null
    };
  });

  const summary = items.reduce((accumulator, item) => {
    accumulator.journeyCount += 1;
    if (item.status === 'active') {
      accumulator.activeJourneyCount += 1;
    }
    accumulator.targetedUsers += Number(item.uniqueRecipientCount || 0);
    accumulator.deliveredCount += Number(item.deliveredCount || 0);
    accumulator.clickedCount += Number(item.clickedCount || 0);
    if (item.triggerType === AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED) {
      accumulator.recoveredCount += Number(item.conversionCount || 0);
    }
    if (item.triggerType === AUTOMATION_TRIGGER_TYPES.EVENT_COMPLETED_NEXT_DROP) {
      accumulator.nextDropConversionCount += Number(item.conversionCount || 0);
    }
    return accumulator;
  }, {
    journeyCount: 0,
    activeJourneyCount: 0,
    targetedUsers: 0,
    deliveredCount: 0,
    clickedCount: 0,
    clickRate: 0,
    recoveredCount: 0,
    nextDropConversionCount: 0
  });

  summary.clickRate = buildRate(summary.clickedCount, summary.deliveredCount);

  return {
    summary,
    items
  };
};

const buildJourneyDetailPayload = ({
  automation = null,
  campaigns = [],
  campaignAnalytics = new Map(),
  deliveries = [],
  eventAudiences = []
}) => {
  if (
    !automation ||
    !JOURNEY_TRIGGER_TYPES.has(String(automation?.triggerType || '').trim())
  ) {
    return null;
  }

  const journeyAbTest = normalizeJourneyAbTestConfig(automation);
  const sortedCampaigns = [...(Array.isArray(campaigns) ? campaigns : [])].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || left?.sentAt || 0).getTime();
    const rightTime = new Date(right?.createdAt || right?.sentAt || 0).getTime();
    return leftTime - rightTime;
  });

  const deliveriesByCampaignId = new Map();
  for (const delivery of Array.isArray(deliveries) ? deliveries : []) {
    const campaignId = String(delivery?.campaignId || '').trim();
    if (!campaignId) {
      continue;
    }

    if (!deliveriesByCampaignId.has(campaignId)) {
      deliveriesByCampaignId.set(campaignId, []);
    }
    deliveriesByCampaignId.get(campaignId).push(delivery);
  }

  const audienceCreatedAtByEventAndUser = new Map();
  for (const audience of Array.isArray(eventAudiences) ? eventAudiences : []) {
    const eventId = String(audience?.eventId || '').trim();
    const userId = String(audience?.userId || '').trim();
    if (!eventId || !userId) {
      continue;
    }

    const createdAt = new Date(audience.createdAt || 0);
    if (Number.isNaN(createdAt.getTime())) {
      continue;
    }

    audienceCreatedAtByEventAndUser.set(`${eventId}:${userId}`, createdAt);
  }

  const matchedRecipientIds = new Set();
  const targetedRecipientsByUserId = new Map();
  const skippedRecipientsByUserId = new Map();
  const deliveredRecipientIds = new Set();
  const clickedRecipientIds = new Set();
  const cooldownSkippedUserIds = new Set();
  const goalSkippedUserIds = new Set();
  const conversionCandidatesByEventAndUser = new Map();
  const touchSummaries = [];
  const touchSummaryByCampaignId = new Map();
  const variantSummariesByKey = new Map();

  for (const campaign of sortedCampaigns) {
    const campaignId = toIdString(campaign);
    const analytics = campaignAnalytics.get(campaignId) || {};
    const journeyMeta = normalizeJourneyMeta(campaign);
    const variantMeta = normalizeVariantMeta(campaign);
    const touchIndex = Number(campaign?.journeyMeta?.touchIndex || 0);
    const touchLabel = buildJourneyTouchLabel(touchIndex);
    const campaignDeliveries = deliveriesByCampaignId.get(campaignId) || [];
    const matchedRecipients = Array.isArray(campaign?.journeyRecipients?.matchedRecipients)
      ? campaign.journeyRecipients.matchedRecipients.filter((recipient) => recipient?.userId)
      : [];
    const targetedRecipients = Array.isArray(campaign?.recipientOverrides)
      ? campaign.recipientOverrides.filter((recipient) => recipient?.userId)
      : [];
    const skippedRecipients = Array.isArray(campaign?.journeyRecipients?.skippedRecipients)
      ? campaign.journeyRecipients.skippedRecipients.filter((recipient) => recipient?.userId)
      : [];
    const touchAnchorAt = campaign.sentAt || campaign.scheduledFor || campaign.createdAt || null;
    if (variantMeta?.variantKey && !variantSummariesByKey.has(variantMeta.variantKey)) {
      variantSummariesByKey.set(variantMeta.variantKey, {
        variantKey: variantMeta.variantKey,
        variantLabel: variantMeta.variantLabel,
        targetedUserIds: new Set(),
        deliveredCount: 0,
        clickedCount: 0,
        convertedCount: 0
      });
    }

    for (const recipient of matchedRecipients) {
      matchedRecipientIds.add(String(recipient.userId || '').trim());
    }

    const touchTargetedUserIds = new Set();
    for (const recipient of targetedRecipients) {
      const profile = normalizeRecipientProfile(recipient);
      if (!profile.userId) {
        continue;
      }

      touchTargetedUserIds.add(profile.userId);
      const existingEntry = targetedRecipientsByUserId.get(profile.userId) || createTargetedRecipientEntry(profile);
      const mergedEntry = mergeRecipientProfile(existingEntry, profile);
      mergedEntry.touchLabels.add(touchLabel);
      if (variantMeta?.variantLabel) {
        mergedEntry.variantLabels.add(variantMeta.variantLabel);
      }
      mergedEntry.firstTargetedAt = setEarliestDate(mergedEntry.firstTargetedAt, touchAnchorAt);
      mergedEntry.lastTargetedAt = setLatestDate(mergedEntry.lastTargetedAt, touchAnchorAt);
      targetedRecipientsByUserId.set(profile.userId, mergedEntry);
      if (variantMeta?.variantKey && variantSummariesByKey.has(variantMeta.variantKey)) {
        variantSummariesByKey.get(variantMeta.variantKey).targetedUserIds.add(profile.userId);
      }
    }

    const touchSkippedUserIds = new Set();
    let cooldownSkippedCount = 0;
    let goalSkippedCount = 0;

    for (const skippedRecipient of skippedRecipients) {
      const profile = normalizeRecipientProfile(skippedRecipient);
      if (!profile.userId) {
        continue;
      }

      touchSkippedUserIds.add(profile.userId);
      if (skippedRecipient.reason === 'cooldown') {
        cooldownSkippedUserIds.add(profile.userId);
        cooldownSkippedCount += 1;
      }
      if (skippedRecipient.reason === 'goal_already_met') {
        goalSkippedUserIds.add(profile.userId);
        goalSkippedCount += 1;
      }

      const existingEntry =
        skippedRecipientsByUserId.get(profile.userId) || createSkippedRecipientEntry(profile);
      const mergedEntry = mergeRecipientProfile(existingEntry, profile);
      mergedEntry.reasons.add(String(skippedRecipient.reason || '').trim());
      mergedEntry.reasonLabels.add(
        String(skippedRecipient.reasonLabel || '').trim() ||
          JOURNEY_SKIP_REASON_LABELS[skippedRecipient.reason] ||
          'Skipped'
      );
      mergedEntry.touchLabels.add(touchLabel);
      if (variantMeta?.variantLabel) {
        mergedEntry.variantLabels.add(variantMeta.variantLabel);
      }
      mergedEntry.firstSkippedAt = setEarliestDate(
        mergedEntry.firstSkippedAt,
        skippedRecipient.skippedAt || campaign.createdAt
      );
      mergedEntry.lastSkippedAt = setLatestDate(
        mergedEntry.lastSkippedAt,
        skippedRecipient.skippedAt || campaign.createdAt
      );
      skippedRecipientsByUserId.set(profile.userId, mergedEntry);
    }

    const touchSummary = {
      campaignId,
      status: campaign.status || 'sent',
      touchIndex,
      touchLabel,
      variantKey: variantMeta?.variantKey || '',
      variantLabel: variantMeta?.variantLabel || '',
      winnerSelected: Boolean(
        variantMeta?.variantKey &&
        journeyAbTest?.winnerVariantKey &&
        journeyAbTest.winnerVariantKey === variantMeta.variantKey
      ),
      scheduledFor: campaign.scheduledFor || null,
      sentAt: campaign.sentAt || null,
      createdAt: campaign.createdAt || null,
      recipientCount: Number(campaign.recipientCount || 0),
      matchedRecipientCount: matchedRecipients.length,
      targetedRecipientCount: touchTargetedUserIds.size,
      deliveredCount: Number(analytics.deliveredCount || 0),
      clickedCount: Number(analytics.clickedCount || 0),
      convertedCount: 0,
      skippedRecipientCount: touchSkippedUserIds.size,
      cooldownSkippedCount,
      goalSkippedCount,
      clickRate: buildRate(analytics.clickedCount || 0, analytics.deliveredCount || 0),
      conversionRate: 0
    };

    touchSummaries.push(touchSummary);
    touchSummaryByCampaignId.set(campaignId, touchSummary);

    for (const delivery of campaignDeliveries) {
      const profile = normalizeRecipientProfile(delivery);
      if (!profile.userId) {
        continue;
      }

      deliveredRecipientIds.add(profile.userId);
      const existingEntry =
        targetedRecipientsByUserId.get(profile.userId) || createTargetedRecipientEntry(profile);
      const mergedEntry = mergeRecipientProfile(existingEntry, profile);
      mergedEntry.touchLabels.add(touchLabel);
      if (variantMeta?.variantLabel) {
        mergedEntry.variantLabels.add(variantMeta.variantLabel);
      }
      mergedEntry.firstTargetedAt = setEarliestDate(
        mergedEntry.firstTargetedAt,
        delivery.deliveredAt || delivery.createdAt || touchAnchorAt
      );
      mergedEntry.lastTargetedAt = setLatestDate(
        mergedEntry.lastTargetedAt,
        delivery.deliveredAt || delivery.createdAt || touchAnchorAt
      );
      mergedEntry.deliveredCount += delivery.deliveredAt ? 1 : 0;

      if (delivery.clickedAt) {
        clickedRecipientIds.add(profile.userId);
        mergedEntry.clickedCount += 1;
        mergedEntry.firstClickedAt = setEarliestDate(mergedEntry.firstClickedAt, delivery.clickedAt);
        mergedEntry.lastClickedAt = setLatestDate(mergedEntry.lastClickedAt, delivery.clickedAt);
      }

      if (variantMeta?.variantKey && variantSummariesByKey.has(variantMeta.variantKey)) {
        const variantSummary = variantSummariesByKey.get(variantMeta.variantKey);
        if (delivery.deliveredAt) {
          variantSummary.deliveredCount += 1;
        }
        if (delivery.clickedAt) {
          variantSummary.clickedCount += 1;
        }
      }

      targetedRecipientsByUserId.set(profile.userId, mergedEntry);

      if (!journeyMeta.targetEventId) {
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

      const candidateKey = `${journeyMeta.targetEventId}:${profile.userId}`;
      if (!conversionCandidatesByEventAndUser.has(candidateKey)) {
        conversionCandidatesByEventAndUser.set(candidateKey, []);
      }
      conversionCandidatesByEventAndUser.get(candidateKey).push({
        campaignId,
        userId: profile.userId,
        attendeeName: mergedEntry.attendeeName,
        email: mergedEntry.email,
        targetEventId: journeyMeta.targetEventId,
        targetEventTitle: journeyMeta.targetEventTitle || '',
        eligibleAt,
        touchIndex,
        touchLabel,
        variantKey: variantMeta?.variantKey || '',
        variantLabel: variantMeta?.variantLabel || ''
      });
    }
  }

  const convertedRecipients = [];
  for (const [candidateKey, candidates] of conversionCandidatesByEventAndUser.entries()) {
    const convertedAt = audienceCreatedAtByEventAndUser.get(candidateKey);
    if (!convertedAt) {
      continue;
    }

    const eligibleCandidate = [...candidates]
      .filter((candidate) => convertedAt.getTime() >= candidate.eligibleAt.getTime())
      .sort((left, right) => right.eligibleAt.getTime() - left.eligibleAt.getTime())[0];

    if (!eligibleCandidate) {
      continue;
    }

    const convertedRecipient = {
      recordId: candidateKey,
      userId: eligibleCandidate.userId,
      attendeeName: eligibleCandidate.attendeeName,
      email: eligibleCandidate.email,
      convertedAt,
      targetEventId: eligibleCandidate.targetEventId,
      targetEventTitle: eligibleCandidate.targetEventTitle,
      attributedTouchLabel: eligibleCandidate.touchLabel,
      attributedTouchIndex: eligibleCandidate.touchIndex,
      attributedVariantKey: eligibleCandidate.variantKey || '',
      attributedVariantLabel: eligibleCandidate.variantLabel || ''
    };
    convertedRecipients.push(convertedRecipient);

    const touchSummary = touchSummaryByCampaignId.get(eligibleCandidate.campaignId);
    if (touchSummary) {
      touchSummary.convertedCount += 1;
    }
    if (eligibleCandidate.variantKey && variantSummariesByKey.has(eligibleCandidate.variantKey)) {
      variantSummariesByKey.get(eligibleCandidate.variantKey).convertedCount += 1;
    }

    const targetedEntry = targetedRecipientsByUserId.get(eligibleCandidate.userId);
    if (targetedEntry) {
      targetedEntry.convertedAt = setLatestDate(targetedEntry.convertedAt, convertedAt);
      targetedEntry.targetEventId = eligibleCandidate.targetEventId;
      targetedEntry.targetEventTitle = eligibleCandidate.targetEventTitle;
      targetedEntry.attributedTouchLabel = eligibleCandidate.touchLabel;
      if (eligibleCandidate.variantLabel) {
        targetedEntry.variantLabels.add(eligibleCandidate.variantLabel);
      }
      targetedRecipientsByUserId.set(eligibleCandidate.userId, targetedEntry);
    }
  }

  for (const touchSummary of touchSummaries) {
    touchSummary.conversionRate = buildRate(
      touchSummary.convertedCount,
      touchSummary.targetedRecipientCount
    );
  }

  const variantSummaries = [...variantSummariesByKey.values()]
    .map((variantSummary) => ({
      variantKey: variantSummary.variantKey,
      variantLabel: variantSummary.variantLabel,
      uniqueRecipientCount: variantSummary.targetedUserIds.size,
      deliveredCount: variantSummary.deliveredCount,
      clickedCount: variantSummary.clickedCount,
      conversionCount: variantSummary.convertedCount,
      clickRate: buildRate(variantSummary.clickedCount, variantSummary.deliveredCount),
      conversionRate: buildRate(
        variantSummary.convertedCount,
        variantSummary.targetedUserIds.size
      ),
      winnerSelected: Boolean(
        journeyAbTest?.winnerVariantKey &&
        journeyAbTest.winnerVariantKey === variantSummary.variantKey
      )
    }))
    .sort((left, right) => left.variantKey.localeCompare(right.variantKey));

  const targetedRecipients = toSerializableRecipientList(
    [...targetedRecipientsByUserId.values()],
    'lastTargetedAt'
  );
  const clickedRecipients = toSerializableRecipientList(
    targetedRecipients.filter((recipient) => Number(recipient.clickedCount || 0) > 0),
    'lastClickedAt'
  );
  const skippedRecipients = toSerializableRecipientList(
    [...skippedRecipientsByUserId.values()],
    'lastSkippedAt'
  );
  const serializedConvertedRecipients = [...convertedRecipients].sort(
    (left, right) => new Date(right.convertedAt).getTime() - new Date(left.convertedAt).getTime()
  );
  const latestCampaign = [...sortedCampaigns].sort(
    (left, right) =>
      new Date(right?.sentAt || right?.createdAt || 0).getTime() -
      new Date(left?.sentAt || left?.createdAt || 0).getTime()
  )[0] || null;
  const latestJourneyMeta = latestCampaign ? normalizeJourneyMeta(latestCampaign) : normalizeJourneyMeta(automation);

  const summary = {
    campaignCount: sortedCampaigns.length,
    sentTouchCount: touchSummaries.filter((touch) => touch.status === 'sent').length,
    matchedRecipientCount: matchedRecipientIds.size,
    targetedRecipientCount: targetedRecipients.length,
    deliveredRecipientCount: deliveredRecipientIds.size,
    clickedRecipientCount: clickedRecipientIds.size,
    convertedRecipientCount: serializedConvertedRecipients.length,
    skippedRecipientCount: skippedRecipients.length,
    cooldownSkippedCount: cooldownSkippedUserIds.size,
    goalSkippedCount: goalSkippedUserIds.size,
    deliveredCount: touchSummaries.reduce(
      (accumulator, touch) => accumulator + Number(touch.deliveredCount || 0),
      0
    ),
    clickedCount: touchSummaries.reduce(
      (accumulator, touch) => accumulator + Number(touch.clickedCount || 0),
      0
    ),
    clickRate: 0,
    conversionRate: 0,
    abTestEnabled: Boolean(journeyAbTest?.enabled),
    winnerVariantKey: journeyAbTest?.winnerVariantKey || '',
    latestSentAt: latestCampaign?.sentAt || null,
    lastTriggeredAt: automation.lastTriggeredAt || null
  };

  summary.clickRate = buildRate(summary.clickedCount, summary.deliveredCount);
  summary.conversionRate = buildRate(
    summary.convertedRecipientCount,
    summary.targetedRecipientCount
  );

  return {
    automation: {
      automationId: toIdString(automation),
      name: automation.name,
      triggerType: automation.triggerType,
      triggerLabel:
        AUTOMATION_TRIGGER_CONFIG[automation.triggerType]?.label || automation.triggerType,
      status: automation.status,
      channel: automation.channel,
      lastTriggeredAt: automation.lastTriggeredAt || null,
      lastDispatchStatus: automation.lastDispatchStatus || '',
      lastDispatchError: automation.lastDispatchError || '',
      abTestEnabled: Boolean(journeyAbTest?.enabled),
      winnerVariantKey: journeyAbTest?.winnerVariantKey || '',
      conversionGoalLabel:
        JOURNEY_GOAL_LABELS[latestJourneyMeta.goalType] ||
        (automation.triggerType === AUTOMATION_TRIGGER_TYPES.BOOKING_ABANDONED
          ? JOURNEY_GOAL_LABELS.confirmed_booking
          : JOURNEY_GOAL_LABELS.book_next_event),
      targetEventId: latestJourneyMeta.targetEventId || '',
      targetEventTitle: latestJourneyMeta.targetEventTitle || '',
      targetEventStartsAt: latestJourneyMeta.targetEventStartsAt || null
    },
    summary,
    touches: touchSummaries.sort((left, right) => {
      if (left.touchIndex !== right.touchIndex) {
        return left.touchIndex - right.touchIndex;
      }

      return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
    }),
    variantSummaries,
    targetedRecipients,
    clickedRecipients,
    convertedRecipients: serializedConvertedRecipients,
    skippedRecipients
  };
};

const loadEventJourneyAnalytics = async ({
  eventId,
  organizerId,
  automations = []
}) => {
  const relevantAutomations = (Array.isArray(automations) ? automations : []).filter((automation) =>
    JOURNEY_TRIGGER_TYPES.has(String(automation?.triggerType || '').trim())
  );

  if (!relevantAutomations.length) {
    return {
      summary: {
        ...EMPTY_JOURNEY_ANALYTICS.summary
      },
      items: []
    };
  }

  const automationIds = relevantAutomations
    .map((automation) => toIdString(automation))
    .filter(Boolean);

  const campaigns = await AudienceCampaign.find({
    scopeType: {
      $ne: 'series'
    },
    eventId,
    organizerId,
    sourceType: 'automation',
    automationId: {
      $in: automationIds
    }
  })
    .sort({ createdAt: -1 })
    .lean();

  const campaignIds = campaigns.map((campaign) => toIdString(campaign)).filter(Boolean);

  let campaignAnalytics = new Map();
  let deliveries = [];
  let eventAudiences = [];

  if (campaignIds.length) {
    campaignAnalytics = await collectCampaignAnalytics(campaignIds);
    deliveries = await AudienceCampaignDelivery.find({
      campaignId: {
        $in: campaignIds
      }
    })
      .select('campaignId userId createdAt deliveredAt openedAt clickedAt')
      .lean();

    const targetEventIds = [...new Set(
      campaigns
        .map((campaign) => normalizeJourneyMeta(campaign).targetEventId)
        .filter(Boolean)
    )];
    const userIds = [...new Set(
      deliveries
        .map((delivery) => String(delivery?.userId || '').trim())
        .filter(Boolean)
    )];

    if (targetEventIds.length && userIds.length) {
      eventAudiences = await EventAudience.find({
        eventId: {
          $in: targetEventIds
        },
        userId: {
          $in: userIds
        }
      })
        .select('eventId userId createdAt')
        .lean();
    }
  }

  return buildJourneyAnalyticsPayload({
    automations: relevantAutomations,
    campaigns,
    campaignAnalytics,
    deliveries,
    eventAudiences
  });
};

const loadEventJourneyDetail = async ({
  eventId,
  organizerId,
  automationId
}) => {
  const automation = await AudienceAutomation.findOne({
    _id: automationId,
    scopeType: {
      $ne: 'series'
    },
    eventId,
    organizerId,
    triggerType: {
      $in: [...JOURNEY_TRIGGER_TYPES]
    }
  }).lean();

  if (!automation) {
    return null;
  }

  const campaigns = await AudienceCampaign.find({
    scopeType: {
      $ne: 'series'
    },
    eventId,
    organizerId,
    sourceType: 'automation',
    automationId
  })
    .sort({ createdAt: 1 })
    .lean();

  const campaignIds = campaigns.map((campaign) => toIdString(campaign)).filter(Boolean);
  let campaignAnalytics = new Map();
  let deliveries = [];
  let eventAudiences = [];

  if (campaignIds.length) {
    campaignAnalytics = await collectCampaignAnalytics(campaignIds);
    deliveries = await AudienceCampaignDelivery.find({
      campaignId: {
        $in: campaignIds
      }
    })
      .select('campaignId userId email channel createdAt deliveredAt openedAt clickedAt')
      .lean();

    const targetEventIds = [...new Set(
      campaigns
        .map((campaign) => normalizeJourneyMeta(campaign).targetEventId)
        .filter(Boolean)
    )];
    const userIds = [...new Set(
      deliveries
        .map((delivery) => String(delivery?.userId || '').trim())
        .filter(Boolean)
    )];

    if (targetEventIds.length && userIds.length) {
      eventAudiences = await EventAudience.find({
        eventId: {
          $in: targetEventIds
        },
        userId: {
          $in: userIds
        }
      })
        .select('eventId userId attendeeName email createdAt')
        .lean();
    }
  }

  return buildJourneyDetailPayload({
    automation,
    campaigns,
    campaignAnalytics,
    deliveries,
    eventAudiences
  });
};

module.exports = {
  EMPTY_JOURNEY_ANALYTICS,
  JOURNEY_TRIGGER_TYPES,
  buildJourneyAnalyticsPayload,
  buildJourneyDetailPayload,
  loadEventJourneyAnalytics,
  loadEventJourneyDetail
};
