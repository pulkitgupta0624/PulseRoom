const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  Roles,
  sendSuccess
} = require('@pulseroom/common');
const Notification = require('../models/Notification');
const EventAudience = require('../models/EventAudience');
const NetworkingMatch = require('../models/NetworkingMatch');
const AudienceSegment = require('../models/AudienceSegment');
const AudienceCampaign = require('../models/AudienceCampaign');
const AudienceAutomation = require('../models/AudienceAutomation');
const {
  CAMPAIGN_STATUS_QUEUED,
  CAMPAIGN_STATUS_SCHEDULED,
  TRACKING_PIXEL_GIF,
  buildCampaignRecipientCounts,
  collectCampaignAnalytics,
  dispatchCampaign,
  loadCrmEventMeta: loadEventMetaForCampaigns,
  loadCrmSeriesMeta: loadSeriesMetaForCampaigns,
  loadMergedCrmAudience: loadMergedAudienceForCampaigns,
  loadSeriesCrmAudience: loadSeriesAudienceForCampaigns,
  markDeliveryClicked,
  markDeliveryOpened,
  scheduleCampaignDispatch,
  serializeAudienceCampaign
} = require('../services/campaignService');
const {
  AUTOMATION_STATUS_ACTIVE,
  AUTOMATION_STATUS_PAUSED,
  AUTOMATION_TRIGGER_CONFIG,
  computeAutomationScheduledFor,
  isJourneyOptimizationTrigger,
  isScheduledAutomationTrigger,
  normalizeJourneyAbTest,
  normalizeJourneySettings,
  removeAutomationDispatchJob,
  scheduleAutomationDispatch,
  serializeAudienceAutomation
} = require('../services/automationService');
const {
  enrichMatchesWithAiIntros,
  generateNetworkingMatches,
  isBookableMeetingSlot,
  normalizeAvailabilitySlots
} = require('../services/networkingService');
const {
  applyAudienceCrmFilters,
  buildAudienceCrmSummary,
  normalizeAudienceCrmFilters
} = require('../services/crmService');
const {
  applySeriesCrmFilters,
  buildSeriesCrmSummary,
  normalizeSeriesCrmFilters
} = require('../services/seriesCrmService');
const {
  loadEventJourneyAnalytics,
  loadEventJourneyDetail
} = require('../services/journeyAnalyticsService');

const router = express.Router();
const NETWORKING_DECISIONS = new Set(['pending', 'accepted', 'skipped']);
const NETWORKING_MEETING_STATUSES = new Set(['none', 'proposed', 'confirmed', 'declined', 'cancelled']);
const CRM_CAMPAIGN_CHANNELS = new Set(['in_app', 'email', 'both']);
const CRM_AUTOMATION_STATUSES = new Set([AUTOMATION_STATUS_ACTIVE, AUTOMATION_STATUS_PAUSED]);
const getCrmAutomationTriggersForScope = (scopeType = 'event') =>
  new Set(
    Object.entries(AUTOMATION_TRIGGER_CONFIG)
      .filter(([, config]) => (config.scopeType || 'event') === scopeType)
      .map(([triggerType]) => triggerType)
  );

const assertInternalEventService = (req) => {
  if (req.headers['x-service-name'] !== 'event-service') {
    throw new AppError('Forbidden', 403, 'forbidden');
  }
};

const buildMessageUrl = (appOrigin, userId) =>
  `${String(appOrigin || '').replace(/\/$/, '')}/messages/${userId}`;

const buildMyBookingsUrl = (appOrigin) =>
  `${String(appOrigin || '').replace(/\/$/, '')}/my-bookings`;

const buildNetworkingEmailHtml = ({
  attendeeName,
  counterpart,
  eventTitle,
  summary,
  introMessage,
  sharedInterests,
  appOrigin
}) => `
  <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">
    <p>Hi ${attendeeName || 'there'},</p>
    <p>We found a strong pre-event networking match for <strong>${eventTitle}</strong>.</p>
    <p><strong>${counterpart.displayName}</strong>${counterpart.location ? ` is based in ${counterpart.location}.` : '.'}</p>
    <p>${introMessage || summary}</p>
    ${sharedInterests?.length ? `<p>Shared interests: <strong>${sharedInterests.slice(0, 4).join(', ')}</strong></p>` : ''}
    <p>
      <a href="${buildMessageUrl(appOrigin, counterpart.userId)}" style="display:inline-block;padding:12px 18px;border-radius:9999px;background:#111827;color:#f9fafb;text-decoration:none;font-weight:700;">
        Start the conversation
      </a>
    </p>
  </div>
`;

const formatNetworkingMeetingWindow = ({ startsAt, endsAt }) => {
  const startDate = new Date(startsAt || 0);
  const endDate = new Date(endsAt || 0);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 'the proposed time';
  }

  const fullFormatter = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC'
  });
  const timeFormatter = new Intl.DateTimeFormat('en-IN', {
    timeStyle: 'short',
    timeZone: 'UTC'
  });

  return `${fullFormatter.format(startDate)} - ${timeFormatter.format(endDate)} UTC`;
};

const buildNetworkingMeetingEmailHtml = ({
  attendeeName,
  counterpartName,
  actorName,
  eventTitle,
  slot,
  note,
  meetingStatus,
  appOrigin
}) => {
  const slotLabel = formatNetworkingMeetingWindow(slot);

  if (meetingStatus === 'confirmed') {
    return `
      <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">
        <p>Hi ${attendeeName || 'there'},</p>
        <p>Your networking meetup for <strong>${eventTitle}</strong> is confirmed.</p>
        <p><strong>${counterpartName || actorName || 'Your match'}</strong> is booked for ${slotLabel}.</p>
        ${note ? `<p>Note: ${note}</p>` : ''}
        <p>
          <a href="${buildMyBookingsUrl(appOrigin)}" style="display:inline-block;padding:12px 18px;border-radius:9999px;background:#111827;color:#f9fafb;text-decoration:none;font-weight:700;">
            Open tickets
          </a>
        </p>
      </div>
    `;
  }

  if (meetingStatus === 'declined') {
    return `
      <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">
        <p>Hi ${attendeeName || 'there'},</p>
        <p>${actorName || 'Your match'} declined the proposed networking meetup for <strong>${eventTitle}</strong>.</p>
        <p>The declined slot was ${slotLabel}. You can suggest another time from your ticket page.</p>
        <p>
          <a href="${buildMyBookingsUrl(appOrigin)}" style="display:inline-block;padding:12px 18px;border-radius:9999px;background:#111827;color:#f9fafb;text-decoration:none;font-weight:700;">
            Propose another slot
          </a>
        </p>
      </div>
    `;
  }

  if (meetingStatus === 'cancelled') {
    return `
      <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">
        <p>Hi ${attendeeName || 'there'},</p>
        <p>${actorName || 'Your match'} cancelled the networking meetup for <strong>${eventTitle}</strong>.</p>
        <p>The previous slot was ${slotLabel}. You can propose a new time whenever you are ready.</p>
        <p>
          <a href="${buildMyBookingsUrl(appOrigin)}" style="display:inline-block;padding:12px 18px;border-radius:9999px;background:#111827;color:#f9fafb;text-decoration:none;font-weight:700;">
            Review networking
          </a>
        </p>
      </div>
    `;
  }

  return `
    <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">
      <p>Hi ${attendeeName || 'there'},</p>
      <p>${actorName || 'Your match'} proposed a networking meetup for <strong>${eventTitle}</strong>.</p>
      <p>Suggested time: <strong>${slotLabel}</strong></p>
      ${note ? `<p>Note: ${note}</p>` : ''}
      <p>
        <a href="${buildMyBookingsUrl(appOrigin)}" style="display:inline-block;padding:12px 18px;border-radius:9999px;background:#111827;color:#f9fafb;text-decoration:none;font-weight:700;">
          Review proposal
        </a>
      </p>
    </div>
  `;
};

const sanitizeNetworkingText = (value, maxLength = 240) =>
  String(value || '').trim().slice(0, maxLength);

const normalizeNetworkingList = (values = []) =>
  [...new Set((Array.isArray(values) ? values : [])
    .map((value) => sanitizeNetworkingText(value, 40).toLowerCase())
    .filter(Boolean))]
    .slice(0, 8);

const serializeAvailabilitySlots = (slots = []) =>
  normalizeAvailabilitySlots(slots).map((slot) => ({
    startsAt: slot.startsAt,
    endsAt: slot.endsAt
  }));

const serializeNetworkingProfile = (networking = {}) => ({
  meetingGoal: sanitizeNetworkingText(networking.meetingGoal, 80),
  canHelpWith: Array.isArray(networking.canHelpWith) ? networking.canHelpWith : [],
  lookingFor: Array.isArray(networking.lookingFor) ? networking.lookingFor : [],
  availabilityNote: sanitizeNetworkingText(networking.availabilityNote, 240),
  availabilitySlots: serializeAvailabilitySlots(networking.availabilitySlots || [])
});

const hasNetworkingProfile = (networking = {}) => {
  const profile = serializeNetworkingProfile(networking);
  return Boolean(
    profile.meetingGoal ||
    profile.canHelpWith.length ||
    profile.lookingFor.length ||
    profile.availabilityNote ||
    profile.availabilitySlots.length
  );
};

const buildParticipantStatuses = (participantUserIds = [], participantStatuses = []) => {
  const existingStatuses = new Map(
    (Array.isArray(participantStatuses) ? participantStatuses : [])
      .filter((status) => status?.userId)
      .map((status) => [status.userId, status])
  );

  return participantUserIds.map((userId) => {
    const existing = existingStatuses.get(userId);
    const decision = NETWORKING_DECISIONS.has(existing?.decision) ? existing.decision : 'pending';
    return {
      userId,
      decision,
      decidedAt: existing?.decidedAt || null
    };
  });
};

const serializeParticipantStatus = (status) => ({
  decision: NETWORKING_DECISIONS.has(status?.decision) ? status.decision : 'pending',
  decidedAt: status?.decidedAt || null
});

const serializeAudienceNetworking = (audience) => ({
  optedIn: Boolean(audience.networking?.optedIn),
  optedInAt: audience.networking?.optedInAt || null,
  lastMatchedAt: audience.networking?.lastMatchedAt || null,
  profile: serializeNetworkingProfile(audience.networking || {})
});

const serializeAudienceProfileForManage = (audience) => ({
  userId: audience.userId,
  attendeeName: audience.attendeeName || audience.email || 'Attendee',
  email: audience.email || '',
  optedInAt: audience.networking?.optedInAt || null,
  lastMatchedAt: audience.networking?.lastMatchedAt || null,
  profile: serializeNetworkingProfile(audience.networking || {})
});

const normalizeNetworkingMeetingStatus = (status) =>
  NETWORKING_MEETING_STATUSES.has(status) ? status : 'none';

const mergeParticipantAudienceProfile = (participant = {}, audience = null) => ({
  ...participant,
  displayName: audience?.attendeeName || participant.displayName,
  email: audience?.email || participant.email,
  networkingProfile: audience
    ? serializeNetworkingProfile(audience.networking || {})
    : serializeNetworkingProfile(participant.networkingProfile || {})
});

const serializeMeetingForUser = (meeting = {}, userId, participants = []) => {
  const status = normalizeNetworkingMeetingStatus(meeting?.status);
  const proposedByUserId = meeting?.proposedByUserId || '';
  const proposedBy = participants.find((participant) => participant.userId === proposedByUserId);
  const respondedBy = participants.find((participant) => participant.userId === meeting?.respondedByUserId);
  const cancelledBy = participants.find((participant) => participant.userId === meeting?.cancelledByUserId);

  return {
    status,
    startsAt: meeting?.startsAt || null,
    endsAt: meeting?.endsAt || null,
    note: sanitizeNetworkingText(meeting?.note, 240),
    proposedByUserId,
    proposedByName: proposedBy?.displayName || proposedBy?.email || 'Your match',
    proposedAt: meeting?.proposedAt || null,
    respondedByUserId: meeting?.respondedByUserId || '',
    respondedByName: respondedBy?.displayName || respondedBy?.email || '',
    respondedAt: meeting?.respondedAt || null,
    confirmedAt: meeting?.confirmedAt || null,
    declinedAt: meeting?.declinedAt || null,
    cancelledAt: meeting?.cancelledAt || null,
    cancelledByUserId: meeting?.cancelledByUserId || '',
    cancelledByName: cancelledBy?.displayName || cancelledBy?.email || '',
    canRespond: status === 'proposed' && proposedByUserId && proposedByUserId !== userId,
    canCancel: ['proposed', 'confirmed'].includes(status),
    isMine: proposedByUserId === userId
  };
};

const serializeAudienceSegment = (segment) => ({
  segmentId: segment._id.toString(),
  name: segment.name,
  filters: normalizeAudienceCrmFilters(segment.filters || {}),
  createdAt: segment.createdAt,
  updatedAt: segment.updatedAt
});

const serializeSeriesAudienceSegment = (segment) => ({
  segmentId: segment._id.toString(),
  name: segment.name,
  filters: normalizeSeriesCrmFilters(segment.filters || {}),
  createdAt: segment.createdAt,
  updatedAt: segment.updatedAt
});

const assertOrganizerCrmAccess = (eventMeta, user) => {
  if (!user || ![Roles.ORGANIZER, Roles.ADMIN].includes(user.role)) {
    throw new AppError('Forbidden', 403, 'forbidden');
  }

  if (user.role !== Roles.ADMIN && eventMeta?.organizerId !== user.sub) {
    throw new AppError('Forbidden', 403, 'forbidden');
  }
};

const loadCrmEventMeta = async (req, eventId) => {
  try {
    return await loadEventMetaForCampaigns({
      eventServiceClient: req.clients.eventService,
      eventId
    });
  } catch (error) {
    if (error.response?.status === 404) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    throw new AppError('Unable to load event CRM context right now', 502, 'event_lookup_failed');
  }
};

const loadMergedCrmAudience = async (req, eventId, eventMeta) => {
  try {
    const audience = await loadMergedAudienceForCampaigns({
      bookingServiceClient: req.clients.bookingService,
      eventId,
      eventMeta
    });

    return {
      audience,
      bookingSummary: {}
    };
  } catch (error) {
    throw new AppError(
      error.response?.data?.message || 'Unable to load attendee CRM data right now',
      error.response?.status || 502,
      error.response?.data?.code || 'crm_audience_lookup_failed'
    );
  }
};

const loadCrmSeriesMeta = async (req, seriesId) => {
  try {
    return await loadSeriesMetaForCampaigns({
      eventServiceClient: req.clients.eventService,
      seriesId
    });
  } catch (error) {
    if (error.response?.status === 404) {
      throw new AppError('Series not found', 404, 'series_not_found');
    }

    throw new AppError('Unable to load series CRM context right now', 502, 'series_lookup_failed');
  }
};

const loadSeriesCrmAudience = async (req, seriesId) => {
  try {
    const audience = await loadSeriesAudienceForCampaigns({
      eventServiceClient: req.clients.eventService,
      seriesId
    });

    return {
      audience
    };
  } catch (error) {
    throw new AppError(
      error.response?.data?.message || 'Unable to load series member CRM data right now',
      error.response?.status || 502,
      error.response?.data?.code || 'series_crm_audience_lookup_failed'
    );
  }
};

const buildAudienceNetworkingUpdate = (payload = {}, currentNetworking = {}) => {
  const nextNetworking = {
    ...(currentNetworking?.toObject ? currentNetworking.toObject() : currentNetworking)
  };

  if (payload.optedIn !== undefined) {
    const optedIn = Boolean(payload.optedIn);
    nextNetworking.optedIn = optedIn;
    nextNetworking.optedInAt = optedIn
      ? (currentNetworking?.optedIn ? currentNetworking.optedInAt || new Date() : new Date())
      : null;
  }
  if (payload.meetingGoal !== undefined) {
    nextNetworking.meetingGoal = sanitizeNetworkingText(payload.meetingGoal, 80);
  }
  if (payload.canHelpWith !== undefined) {
    nextNetworking.canHelpWith = normalizeNetworkingList(payload.canHelpWith);
  }
  if (payload.lookingFor !== undefined) {
    nextNetworking.lookingFor = normalizeNetworkingList(payload.lookingFor);
  }
  if (payload.availabilityNote !== undefined) {
    nextNetworking.availabilityNote = sanitizeNetworkingText(payload.availabilityNote, 240);
  }
  if (payload.availabilitySlots !== undefined) {
    nextNetworking.availabilitySlots = normalizeAvailabilitySlots(payload.availabilitySlots);
  }

  return nextNetworking;
};

const serializeManageMeeting = (meeting = {}, participants = []) => {
  const status = normalizeNetworkingMeetingStatus(meeting?.status);
  const proposedBy = participants.find((participant) => participant.userId === meeting?.proposedByUserId);

  return {
    status,
    startsAt: meeting?.startsAt || null,
    endsAt: meeting?.endsAt || null,
    proposedByUserId: meeting?.proposedByUserId || '',
    proposedByName: proposedBy?.displayName || proposedBy?.email || ''
  };
};

const serializeMatchForUser = (match, userId, audienceMap = new Map()) => {
  const participants = (match.participants || []).map((participant) =>
    mergeParticipantAudienceProfile(participant, audienceMap.get(participant.userId))
  );
  const counterpart = participants.find((participant) => participant.userId !== userId);
  const participantStatuses = buildParticipantStatuses(
    match.participantUserIds || participants.map((participant) => participant.userId),
    match.participantStatuses
  );
  const myStatus = participantStatuses.find((status) => status.userId === userId);
  const counterpartStatus = participantStatuses.find((status) => status.userId !== userId);

  return {
    matchId: match._id.toString(),
    eventId: match.eventId,
    counterpart,
    sharedInterests: match.sharedInterests || [],
    sharedIntentTags: match.sharedIntentTags || [],
    score: Number(match.score || 0),
    summary: match.summary || '',
    myStatus: serializeParticipantStatus(myStatus),
    counterpartStatus: serializeParticipantStatus(counterpartStatus),
    meeting: serializeMeetingForUser(match.meeting || {}, userId, participants),
    mutualAcceptance:
      myStatus?.decision === 'accepted' &&
      counterpartStatus?.decision === 'accepted',
    introEmailSentAt: match.introEmailSentAt || null,
    createdAt: match.createdAt
  };
};

const buildManageResponse = async (eventId) => {
  const [audienceCount, optedInAudience, matches] = await Promise.all([
    EventAudience.countDocuments({ eventId }),
    EventAudience.find({
      eventId,
      'networking.optedIn': true
    })
      .sort({ updatedAt: -1 })
      .lean(),
    NetworkingMatch.find({ eventId })
      .sort({ score: -1, createdAt: -1 })
      .lean()
  ]);

  const optedInCount = optedInAudience.length;
  const matchedAttendeeIds = new Set();
  const meetingGoalCounts = new Map();
  let profiledOptIns = 0;
  for (const match of matches) {
    for (const participantUserId of match.participantUserIds || []) {
      matchedAttendeeIds.add(participantUserId);
    }
  }
  for (const attendee of optedInAudience) {
    if (hasNetworkingProfile(attendee.networking || {})) {
      profiledOptIns += 1;
    }

    const goal = sanitizeNetworkingText(attendee.networking?.meetingGoal, 80);
    if (goal) {
      meetingGoalCounts.set(goal, (meetingGoalCounts.get(goal) || 0) + 1);
    }
  }

  const lastGeneratedAt = matches.reduce((latest, match) => {
    if (!match.generatedAt) {
      return latest;
    }

    if (!latest || new Date(match.generatedAt) > new Date(latest)) {
      return match.generatedAt;
    }

    return latest;
  }, null);

  return {
    audienceCount,
    optedInCount,
    profiledOptIns,
    createdMatches: matches.length,
    matchedAttendees: matchedAttendeeIds.size,
    meetingProposals: matches.filter(
      (match) => normalizeNetworkingMeetingStatus(match.meeting?.status) === 'proposed'
    ).length,
    confirmedMeetings: matches.filter(
      (match) => normalizeNetworkingMeetingStatus(match.meeting?.status) === 'confirmed'
    ).length,
    introEmailsSent: matches.filter((match) => match.introEmailSentAt).length * 2,
    acceptedResponses: matches.reduce(
      (total, match) =>
        total +
        buildParticipantStatuses(match.participantUserIds, match.participantStatuses)
          .filter((status) => status.decision === 'accepted')
          .length,
      0
    ),
    skippedResponses: matches.reduce(
      (total, match) =>
        total +
        buildParticipantStatuses(match.participantUserIds, match.participantStatuses)
          .filter((status) => status.decision === 'skipped')
          .length,
      0
    ),
    mutualMatches: matches.filter((match) => {
      const statuses = buildParticipantStatuses(match.participantUserIds, match.participantStatuses);
      return statuses.length > 1 && statuses.every((status) => status.decision === 'accepted');
    }).length,
    lastGeneratedAt,
    topGoals: [...meetingGoalCounts.entries()]
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }
        return left[0].localeCompare(right[0]);
      })
      .slice(0, 5)
      .map(([goal, count]) => ({ goal, count })),
    audienceProfiles: optedInAudience.slice(0, 12).map(serializeAudienceProfileForManage),
    recentMatches: matches.slice(0, 10).map((match) => ({
      matchId: match._id.toString(),
      sharedInterests: match.sharedInterests || [],
      sharedIntentTags: match.sharedIntentTags || [],
      score: Number(match.score || 0),
      summary: match.summary || '',
      introEmailSentAt: match.introEmailSentAt || null,
      participants: match.participants || [],
      meeting: serializeManageMeeting(match.meeting || {}, match.participants || []),
      participantStatuses: buildParticipantStatuses(
        match.participantUserIds,
        match.participantStatuses
      ).map((status) => ({
        userId: status.userId,
        ...serializeParticipantStatus(status)
      }))
    }))
  };
};

const loadAudienceOrThrow = async ({ eventId, userId }) => {
  const audience = await EventAudience.findOne({
    eventId,
    userId
  });

  if (!audience) {
    throw new AppError('Networking is only available to confirmed attendees', 404, 'audience_not_found');
  }

  return audience;
};

const loadAudienceMapForUsers = async ({ eventId, userIds = [] }) => {
  const resolvedUserIds = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
  if (!resolvedUserIds.length) {
    return new Map();
  }

  const audiences = await EventAudience.find({
    eventId,
    userId: {
      $in: resolvedUserIds
    }
  }).lean();

  return new Map(audiences.map((audience) => [audience.userId, audience]));
};

const assertMutualNetworkingAcceptance = (match) => {
  const statuses = buildParticipantStatuses(match.participantUserIds, match.participantStatuses);
  if (statuses.length < 2 || !statuses.every((status) => status.decision === 'accepted')) {
    throw new AppError(
      'Both attendees need to accept the intro before scheduling a meeting',
      409,
      'networking_match_not_ready'
    );
  }
};

const notifyNetworkingMeetingParticipant = async ({
  req,
  eventId,
  eventTitle,
  recipient,
  actor,
  counterpartName,
  meetingStatus,
  meeting
}) => {
  if (!recipient?.userId) {
    return;
  }

  const actorName = actor?.displayName || actor?.email || 'Your match';
  const slotLabel = formatNetworkingMeetingWindow(meeting || {});
  const ctaUrl = buildMyBookingsUrl(req.config.appOrigin);
  const notificationByStatus = {
    proposed: {
      type: 'networking.meeting.proposed',
      title: `${actorName} proposed a meetup`,
      body: `Suggested time: ${slotLabel}. Review it from your tickets page.`,
      ctaLabel: 'Review meeting'
    },
    confirmed: {
      type: 'networking.meeting.confirmed',
      title: `Networking meetup confirmed for ${eventTitle}`,
      body: `You are booked with ${counterpartName || actorName} at ${slotLabel}.`,
      ctaLabel: 'Open tickets'
    },
    declined: {
      type: 'networking.meeting.declined',
      title: `${actorName} declined the proposed meetup`,
      body: `The ${slotLabel} slot was declined. You can propose another time anytime.`,
      ctaLabel: 'Review networking'
    },
    cancelled: {
      type: 'networking.meeting.cancelled',
      title: `${actorName} cancelled the meetup`,
      body: `The ${slotLabel} networking slot is no longer booked.`,
      ctaLabel: 'Review networking'
    }
  };

  const notificationCopy = notificationByStatus[meetingStatus];
  if (!notificationCopy) {
    return;
  }

  await req.services.createNotification({
    userId: recipient.userId,
    eventId,
    email: recipient.email,
    type: notificationCopy.type,
    title: notificationCopy.title,
    body: notificationCopy.body,
    metadata: {
      counterpartUserId: actor?.userId || '',
      ctaUrl,
      ctaLabel: notificationCopy.ctaLabel
    }
  });

  if (recipient.email) {
    await req.services.queue.add('send-email', {
      to: recipient.email,
      subject: notificationCopy.title,
      html: buildNetworkingMeetingEmailHtml({
        attendeeName: recipient.displayName || recipient.attendeeName || recipient.email,
        counterpartName,
        actorName,
        eventTitle,
        slot: meeting,
        note: sanitizeNetworkingText(meeting?.note, 240),
        meetingStatus,
        appOrigin: req.config.appOrigin
      })
    });
  }
};

router.get(
  '/campaigns/track/open/:trackingToken',
  asyncHandler(async (req, res) => {
    await markDeliveryOpened({
      trackingToken: req.params.trackingToken
    });

    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, max-age=0');
    res.status(200).send(TRACKING_PIXEL_GIF);
  })
);

router.get(
  '/campaigns/track/click/:trackingToken',
  asyncHandler(async (req, res) => {
    const delivery = await markDeliveryClicked({
      trackingToken: req.params.trackingToken
    });

    res.redirect(delivery?.ctaUrl || req.config.appOrigin);
  })
);

router.get(
  '/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find({
      userId: req.user.sub
    }).sort({ createdAt: -1 });

    sendSuccess(res, notifications);
  })
);

router.get(
  '/me/unread-count',
  authenticate(),
  asyncHandler(async (req, res) => {
    const unreadCount = await Notification.countDocuments({
      userId: req.user.sub,
      readAt: { $exists: false }
    });

    sendSuccess(res, { unreadCount });
  })
);

router.patch(
  '/:notificationId/read',
  authenticate(),
  asyncHandler(async (req, res) => {
    const notification = await Notification.findById(req.params.notificationId);
    if (!notification || notification.userId !== req.user.sub) {
      throw new AppError('Notification not found', 404, 'notification_not_found');
    }

    notification.readAt = new Date();
    await notification.save();

    if (notification.metadata?.campaignDeliveryId) {
      await markDeliveryOpened(
        {
          _id: notification.metadata.campaignDeliveryId
        },
        notification.readAt
      );
    }

    sendSuccess(res, notification);
  })
);

router.get(
  '/events/:eventId/crm',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadCrmEventMeta(req, req.params.eventId);
    assertOrganizerCrmAccess(eventMeta, req.user);

    const filters = normalizeAudienceCrmFilters(req.query);
    const [{ audience }, segments, recentCampaigns, automations] = await Promise.all([
      loadMergedCrmAudience(req, req.params.eventId, eventMeta),
      AudienceSegment.find({
        scopeType: {
          $ne: 'series'
        },
        eventId: req.params.eventId,
        organizerId: eventMeta.organizerId
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean(),
      AudienceCampaign.find({
        scopeType: {
          $ne: 'series'
        },
        eventId: req.params.eventId,
        organizerId: eventMeta.organizerId
      })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      AudienceAutomation.find({
        scopeType: {
          $ne: 'series'
        },
        eventId: req.params.eventId,
        organizerId: eventMeta.organizerId
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean()
    ]);
    const campaignAnalytics = await collectCampaignAnalytics(
      recentCampaigns.map((campaign) => campaign._id.toString())
    );
    const journeyAnalytics = await loadEventJourneyAnalytics({
      eventId: req.params.eventId,
      organizerId: eventMeta.organizerId,
      automations
    });

    const filteredAudience = applyAudienceCrmFilters(audience, filters);

    sendSuccess(res, {
      event: {
        eventId: req.params.eventId,
        title: eventMeta.title,
        status: eventMeta.status,
        startsAt: eventMeta.startsAt,
        endsAt: eventMeta.endsAt
      },
      filters,
      summary: {
        total: buildAudienceCrmSummary(audience),
        filtered: buildAudienceCrmSummary(filteredAudience)
      },
      audience: filteredAudience,
      segments: segments.map(serializeAudienceSegment),
      automations: automations.map(serializeAudienceAutomation),
      journeys: journeyAnalytics,
      recentCampaigns: recentCampaigns.map((campaign) =>
        serializeAudienceCampaign(
          campaign,
          campaignAnalytics.get(campaign._id.toString())
        )
      )
    });
  })
);

router.get(
  '/events/:eventId/crm/automations/:automationId/journey',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadCrmEventMeta(req, req.params.eventId);
    assertOrganizerCrmAccess(eventMeta, req.user);

    const journey = await loadEventJourneyDetail({
      eventId: req.params.eventId,
      organizerId: eventMeta.organizerId,
      automationId: req.params.automationId
    });

    if (!journey) {
      throw new AppError('Journey automation not found', 404, 'crm_journey_not_found');
    }

    sendSuccess(res, {
      journey
    });
  })
);

router.post(
  '/events/:eventId/crm/segments',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadCrmEventMeta(req, req.params.eventId);
    assertOrganizerCrmAccess(eventMeta, req.user);

    const name = String(req.body.name || '').trim();
    if (!name) {
      throw new AppError('Segment name is required', 422, 'crm_segment_name_required');
    }

    const filters = normalizeAudienceCrmFilters(req.body.filters || {});
    let segment;

    if (req.body.segmentId) {
      segment = await AudienceSegment.findOne({
        _id: req.body.segmentId,
        scopeType: {
          $ne: 'series'
        },
        eventId: req.params.eventId,
        organizerId: eventMeta.organizerId
      });
      if (!segment) {
        throw new AppError('Segment not found', 404, 'crm_segment_not_found');
      }

      segment.name = name;
      segment.filters = filters;
      segment.updatedByUserId = req.user.sub;
      await segment.save();
    } else {
      segment = await AudienceSegment.create({
        scopeType: 'event',
        eventId: req.params.eventId,
        organizerId: eventMeta.organizerId,
        createdByUserId: req.user.sub,
        updatedByUserId: req.user.sub,
        name,
        filters
      });
    }

    sendSuccess(res, {
      segment: serializeAudienceSegment(segment)
    });
  })
);

router.delete(
  '/events/:eventId/crm/segments/:segmentId',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadCrmEventMeta(req, req.params.eventId);
    assertOrganizerCrmAccess(eventMeta, req.user);

    const deletion = await AudienceSegment.findOneAndDelete({
      _id: req.params.segmentId,
      scopeType: {
        $ne: 'series'
      },
      eventId: req.params.eventId,
      organizerId: eventMeta.organizerId
    });

    if (!deletion) {
      throw new AppError('Segment not found', 404, 'crm_segment_not_found');
    }

    sendSuccess(res, {
      deleted: true
    });
  })
);

router.post(
  '/events/:eventId/crm/campaigns',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadCrmEventMeta(req, req.params.eventId);
    assertOrganizerCrmAccess(eventMeta, req.user);

    const title = String(req.body.title || '').trim().slice(0, 140);
    const body = String(req.body.body || '').trim().slice(0, 1600);
    const channel = CRM_CAMPAIGN_CHANNELS.has(String(req.body.channel || '').trim())
      ? String(req.body.channel).trim()
      : 'both';

    if (!title) {
      throw new AppError('Campaign title is required', 422, 'crm_campaign_title_required');
    }
    if (!body) {
      throw new AppError('Campaign body is required', 422, 'crm_campaign_body_required');
    }
    const scheduleMode = String(req.body.scheduleMode || 'now').trim() === 'later'
      ? 'later'
      : 'now';
    const scheduledFor = scheduleMode === 'later'
      ? new Date(req.body.scheduledFor)
      : null;

    if (
      scheduleMode === 'later' &&
      (!(scheduledFor instanceof Date) ||
        Number.isNaN(scheduledFor.getTime()) ||
        scheduledFor.getTime() <= Date.now())
    ) {
      throw new AppError(
        'Choose a valid future time for this scheduled campaign',
        422,
        'crm_campaign_schedule_invalid'
      );
    }

    let segment = null;
    if (req.body.segmentId) {
      segment = await AudienceSegment.findOne({
        _id: req.body.segmentId,
        scopeType: {
          $ne: 'series'
        },
        eventId: req.params.eventId,
        organizerId: eventMeta.organizerId
      }).lean();

      if (!segment) {
        throw new AppError('Segment not found', 404, 'crm_segment_not_found');
      }
    }

    const filters = normalizeAudienceCrmFilters(req.body.filters || segment?.filters || {});
    const { audience } = await loadMergedCrmAudience(req, req.params.eventId, eventMeta);
    const recipients = applyAudienceCrmFilters(audience, filters);

    if (!recipients.length) {
      throw new AppError(
        'No attendees match this audience segment right now',
        409,
        'crm_campaign_empty_audience'
      );
    }

    const recipientCounts = buildCampaignRecipientCounts({
      recipients,
      channel
    });

    if (channel === 'email' && recipientCounts.emailRecipientCount < 1) {
      throw new AppError(
        'This audience does not have any email addresses to send to yet',
        409,
        'crm_campaign_email_audience_empty'
      );
    }

    const campaign = await AudienceCampaign.create({
      scopeType: 'event',
      eventId: req.params.eventId,
      organizerId: eventMeta.organizerId,
      createdByUserId: req.user.sub,
      segmentId: segment?._id?.toString() || '',
      segmentName: segment?.name || '',
      title,
      body,
      channel,
      filters,
      status: scheduleMode === 'later' ? CAMPAIGN_STATUS_SCHEDULED : CAMPAIGN_STATUS_QUEUED,
      scheduledFor,
      ...recipientCounts
    });

    let nextCampaign = campaign;

    if (scheduleMode === 'later') {
      await scheduleCampaignDispatch({
        campaignId: campaign._id.toString(),
        queue: req.services.queue,
        scheduledFor
      });
    } else {
      nextCampaign = await dispatchCampaign({
        campaignId: campaign._id.toString(),
        config: req.config,
        createNotification: req.services.createNotification,
        queue: req.services.queue,
        eventServiceClient: req.clients.eventService,
        bookingServiceClient: req.clients.bookingService,
        logger: req.logger
      });

      if (nextCampaign?.status === 'failed') {
        throw new AppError(
          nextCampaign.dispatchError || 'Unable to send this campaign right now',
          409,
          'crm_campaign_dispatch_failed'
        );
      }
    }

    sendSuccess(res, {
      campaign: serializeAudienceCampaign(nextCampaign)
    }, 201);
  })
);

router.post(
  '/events/:eventId/crm/automations',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadCrmEventMeta(req, req.params.eventId);
    assertOrganizerCrmAccess(eventMeta, req.user);
    const eventAutomationTriggers = getCrmAutomationTriggersForScope('event');

    const name = String(req.body.name || '').trim().slice(0, 120);
    const title = String(req.body.title || '').trim().slice(0, 140);
    const body = String(req.body.body || '').trim().slice(0, 1600);
    const channel = CRM_CAMPAIGN_CHANNELS.has(String(req.body.channel || '').trim())
      ? String(req.body.channel).trim()
      : 'both';
    const triggerType = eventAutomationTriggers.has(String(req.body.triggerType || '').trim())
      ? String(req.body.triggerType).trim()
      : '';
    const status = CRM_AUTOMATION_STATUSES.has(String(req.body.status || '').trim())
      ? String(req.body.status).trim()
      : AUTOMATION_STATUS_ACTIVE;

    if (!name) {
      throw new AppError('Automation name is required', 422, 'crm_automation_name_required');
    }
    if (!title) {
      throw new AppError('Automation title is required', 422, 'crm_automation_title_required');
    }
    if (!body) {
      throw new AppError('Automation body is required', 422, 'crm_automation_body_required');
    }
    if (!triggerType) {
      throw new AppError('Choose a valid automation trigger', 422, 'crm_automation_trigger_invalid');
    }
    let segment = null;
    if (req.body.segmentId) {
      segment = await AudienceSegment.findOne({
        _id: req.body.segmentId,
        eventId: req.params.eventId,
        organizerId: eventMeta.organizerId
      }).lean();

      if (!segment) {
        throw new AppError('Segment not found', 404, 'crm_segment_not_found');
      }
    }

    const filters = normalizeAudienceCrmFilters(req.body.filters || segment?.filters || {});
    const journeySettings = normalizeJourneySettings(
      triggerType,
      req.body.journeySettings || {}
    );
    const journeyAbTest = normalizeJourneyAbTest(
      triggerType,
      req.body.journeyAbTest || {},
      title,
      body
    );
    if (
      journeyAbTest?.enabled &&
      (
        !journeyAbTest.variants?.[1]?.title ||
        !journeyAbTest.variants?.[1]?.body
      )
    ) {
      throw new AppError(
        'Add both a title and message for Variant B before enabling A/B testing.',
        422,
        'crm_automation_ab_test_variant_b_required'
      );
    }
    const validatedScheduledFor =
      status === AUTOMATION_STATUS_ACTIVE && isScheduledAutomationTrigger(triggerType)
        ? computeAutomationScheduledFor(triggerType, eventMeta)
        : null;

    if (
      status === AUTOMATION_STATUS_ACTIVE &&
      isScheduledAutomationTrigger(triggerType) &&
      (
        !validatedScheduledFor ||
        Number.isNaN(validatedScheduledFor.getTime()) ||
        validatedScheduledFor.getTime() <= Date.now()
      )
    ) {
      throw new AppError(
        'This automation trigger is already in the past for this event',
        409,
        'crm_automation_schedule_past'
      );
    }

    let automation;

    if (req.body.automationId) {
      automation = await AudienceAutomation.findOne({
        _id: req.body.automationId,
        scopeType: {
          $ne: 'series'
        },
        eventId: req.params.eventId,
        organizerId: eventMeta.organizerId
      });

      if (!automation) {
        throw new AppError('Automation not found', 404, 'crm_automation_not_found');
      }

      const previousTitle = automation.title;
      const previousBody = automation.body;
      const previousVariantBTitle = automation.journeyAbTest?.variants?.[1]?.title || '';
      const previousVariantBBody = automation.journeyAbTest?.variants?.[1]?.body || '';

      automation.name = name;
      automation.title = title;
      automation.body = body;
      automation.channel = channel;
      automation.triggerType = triggerType;
      automation.status = status;
      automation.segmentId = segment?._id?.toString() || '';
      automation.segmentName = segment?.name || '';
      automation.filters = filters;
      automation.journeySettings = journeySettings;
      if (
        automation?.journeyAbTest?.winnerVariantKey &&
        journeyAbTest?.enabled &&
        (
          previousTitle !== title ||
          previousBody !== body ||
          previousVariantBTitle !== journeyAbTest.variants?.[1]?.title ||
          previousVariantBBody !== journeyAbTest.variants?.[1]?.body
        )
      ) {
        journeyAbTest.winnerVariantKey = '';
      }
      automation.journeyAbTest = journeyAbTest;
      automation.updatedByUserId = req.user.sub;
    } else {
      automation = await AudienceAutomation.create({
        scopeType: 'event',
        eventId: req.params.eventId,
        organizerId: eventMeta.organizerId,
        createdByUserId: req.user.sub,
        updatedByUserId: req.user.sub,
        name,
        title,
        body,
        channel,
        triggerType,
        status,
        segmentId: segment?._id?.toString() || '',
        segmentName: segment?.name || '',
        filters,
        journeySettings,
        journeyAbTest
      });
    }

    if (!isJourneyOptimizationTrigger(triggerType)) {
      automation.journeySettings = null;
      automation.journeyAbTest = null;
    }

    if (
      automation.status === AUTOMATION_STATUS_ACTIVE &&
      isScheduledAutomationTrigger(automation.triggerType)
    ) {
      automation.scheduledFor = validatedScheduledFor;
      await automation.save();
      await scheduleAutomationDispatch({
        automation,
        scopeMeta: {
          ...eventMeta,
          eventId: req.params.eventId
        },
        queue: req.services.queue
      });
    } else {
      automation.scheduledFor = null;
      await automation.save();
      await removeAutomationDispatchJob({
        automationId: automation._id.toString(),
        queue: req.services.queue
      });
    }

    sendSuccess(res, {
      automation: serializeAudienceAutomation(automation)
    }, 201);
  })
);

router.delete(
  '/events/:eventId/crm/automations/:automationId',
  authenticate(),
  asyncHandler(async (req, res) => {
    const eventMeta = await loadCrmEventMeta(req, req.params.eventId);
    assertOrganizerCrmAccess(eventMeta, req.user);

    const automation = await AudienceAutomation.findOneAndDelete({
      _id: req.params.automationId,
      scopeType: {
        $ne: 'series'
      },
      eventId: req.params.eventId,
      organizerId: eventMeta.organizerId
    });

    if (!automation) {
      throw new AppError('Automation not found', 404, 'crm_automation_not_found');
    }

    await removeAutomationDispatchJob({
      automationId: req.params.automationId,
      queue: req.services.queue
    });

    sendSuccess(res, {
      deleted: true
    });
  })
);

router.get(
  '/series/:seriesId/crm',
  authenticate(),
  asyncHandler(async (req, res) => {
    const seriesMeta = await loadCrmSeriesMeta(req, req.params.seriesId);
    assertOrganizerCrmAccess(seriesMeta, req.user);

    const filters = normalizeSeriesCrmFilters(req.query);
    const [{ audience }, segments, recentCampaigns, automations] = await Promise.all([
      loadSeriesCrmAudience(req, req.params.seriesId),
      AudienceSegment.find({
        scopeType: 'series',
        eventId: req.params.seriesId,
        seriesId: req.params.seriesId,
        organizerId: seriesMeta.organizerId
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean(),
      AudienceCampaign.find({
        scopeType: 'series',
        eventId: req.params.seriesId,
        seriesId: req.params.seriesId,
        organizerId: seriesMeta.organizerId
      })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      AudienceAutomation.find({
        scopeType: 'series',
        eventId: req.params.seriesId,
        seriesId: req.params.seriesId,
        organizerId: seriesMeta.organizerId
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean()
    ]);
    const campaignAnalytics = await collectCampaignAnalytics(
      recentCampaigns.map((campaign) => campaign._id.toString())
    );

    const filteredAudience = applySeriesCrmFilters(audience, filters);

    sendSuccess(res, {
      series: {
        seriesId: req.params.seriesId,
        name: seriesMeta.name,
        slug: seriesMeta.slug || '',
        status: seriesMeta.status,
        nextEventId: seriesMeta.nextEventId || null,
        nextEventTitle: seriesMeta.nextEventTitle || '',
        nextEventStartsAt: seriesMeta.nextEventStartsAt || null
      },
      filters,
      summary: {
        total: buildSeriesCrmSummary(audience),
        filtered: buildSeriesCrmSummary(filteredAudience)
      },
      audience: filteredAudience,
      segments: segments.map(serializeSeriesAudienceSegment),
      automations: automations.map(serializeAudienceAutomation),
      recentCampaigns: recentCampaigns.map((campaign) =>
        serializeAudienceCampaign(
          campaign,
          campaignAnalytics.get(campaign._id.toString())
        )
      )
    });
  })
);

router.post(
  '/series/:seriesId/crm/segments',
  authenticate(),
  asyncHandler(async (req, res) => {
    const seriesMeta = await loadCrmSeriesMeta(req, req.params.seriesId);
    assertOrganizerCrmAccess(seriesMeta, req.user);

    const name = String(req.body.name || '').trim();
    if (!name) {
      throw new AppError('Segment name is required', 422, 'crm_segment_name_required');
    }

    const filters = normalizeSeriesCrmFilters(req.body.filters || {});
    let segment;

    if (req.body.segmentId) {
      segment = await AudienceSegment.findOne({
        _id: req.body.segmentId,
        scopeType: 'series',
        eventId: req.params.seriesId,
        seriesId: req.params.seriesId,
        organizerId: seriesMeta.organizerId
      });
      if (!segment) {
        throw new AppError('Segment not found', 404, 'crm_segment_not_found');
      }

      segment.name = name;
      segment.filters = filters;
      segment.updatedByUserId = req.user.sub;
      await segment.save();
    } else {
      segment = await AudienceSegment.create({
        scopeType: 'series',
        eventId: req.params.seriesId,
        seriesId: req.params.seriesId,
        organizerId: seriesMeta.organizerId,
        createdByUserId: req.user.sub,
        updatedByUserId: req.user.sub,
        name,
        filters
      });
    }

    sendSuccess(res, {
      segment: serializeSeriesAudienceSegment(segment)
    });
  })
);

router.delete(
  '/series/:seriesId/crm/segments/:segmentId',
  authenticate(),
  asyncHandler(async (req, res) => {
    const seriesMeta = await loadCrmSeriesMeta(req, req.params.seriesId);
    assertOrganizerCrmAccess(seriesMeta, req.user);

    const deletion = await AudienceSegment.findOneAndDelete({
      _id: req.params.segmentId,
      scopeType: 'series',
      eventId: req.params.seriesId,
      seriesId: req.params.seriesId,
      organizerId: seriesMeta.organizerId
    });

    if (!deletion) {
      throw new AppError('Segment not found', 404, 'crm_segment_not_found');
    }

    sendSuccess(res, {
      deleted: true
    });
  })
);

router.post(
  '/series/:seriesId/crm/campaigns',
  authenticate(),
  asyncHandler(async (req, res) => {
    const seriesMeta = await loadCrmSeriesMeta(req, req.params.seriesId);
    assertOrganizerCrmAccess(seriesMeta, req.user);

    const title = String(req.body.title || '').trim().slice(0, 140);
    const body = String(req.body.body || '').trim().slice(0, 1600);
    const channel = CRM_CAMPAIGN_CHANNELS.has(String(req.body.channel || '').trim())
      ? String(req.body.channel).trim()
      : 'both';

    if (!title) {
      throw new AppError('Campaign title is required', 422, 'crm_campaign_title_required');
    }
    if (!body) {
      throw new AppError('Campaign body is required', 422, 'crm_campaign_body_required');
    }

    const scheduleMode = String(req.body.scheduleMode || 'now').trim() === 'later'
      ? 'later'
      : 'now';
    const scheduledFor = scheduleMode === 'later'
      ? new Date(req.body.scheduledFor)
      : null;

    if (
      scheduleMode === 'later' &&
      (!(scheduledFor instanceof Date) ||
        Number.isNaN(scheduledFor.getTime()) ||
        scheduledFor.getTime() <= Date.now())
    ) {
      throw new AppError(
        'Choose a valid future time for this scheduled campaign',
        422,
        'crm_campaign_schedule_invalid'
      );
    }

    let segment = null;
    if (req.body.segmentId) {
      segment = await AudienceSegment.findOne({
        _id: req.body.segmentId,
        scopeType: 'series',
        eventId: req.params.seriesId,
        seriesId: req.params.seriesId,
        organizerId: seriesMeta.organizerId
      }).lean();

      if (!segment) {
        throw new AppError('Segment not found', 404, 'crm_segment_not_found');
      }
    }

    const filters = normalizeSeriesCrmFilters(req.body.filters || segment?.filters || {});
    const { audience } = await loadSeriesCrmAudience(req, req.params.seriesId);
    const recipients = applySeriesCrmFilters(audience, filters);

    if (!recipients.length) {
      throw new AppError(
        'No series members match this audience segment right now',
        409,
        'crm_campaign_empty_audience'
      );
    }

    const recipientCounts = buildCampaignRecipientCounts({
      recipients,
      channel
    });

    if (channel === 'email' && recipientCounts.emailRecipientCount < 1) {
      throw new AppError(
        'This member audience does not have any email addresses to send to yet',
        409,
        'crm_campaign_email_audience_empty'
      );
    }

    const campaign = await AudienceCampaign.create({
      scopeType: 'series',
      eventId: req.params.seriesId,
      seriesId: req.params.seriesId,
      organizerId: seriesMeta.organizerId,
      createdByUserId: req.user.sub,
      segmentId: segment?._id?.toString() || '',
      segmentName: segment?.name || '',
      title,
      body,
      channel,
      filters,
      status: scheduleMode === 'later' ? CAMPAIGN_STATUS_SCHEDULED : CAMPAIGN_STATUS_QUEUED,
      scheduledFor,
      ...recipientCounts
    });

    let nextCampaign = campaign;

    if (scheduleMode === 'later') {
      await scheduleCampaignDispatch({
        campaignId: campaign._id.toString(),
        queue: req.services.queue,
        scheduledFor
      });
    } else {
      nextCampaign = await dispatchCampaign({
        campaignId: campaign._id.toString(),
        config: req.config,
        createNotification: req.services.createNotification,
        queue: req.services.queue,
        eventServiceClient: req.clients.eventService,
        bookingServiceClient: req.clients.bookingService,
        logger: req.logger
      });

      if (nextCampaign?.status === 'failed') {
        throw new AppError(
          nextCampaign.dispatchError || 'Unable to send this campaign right now',
          409,
          'crm_campaign_dispatch_failed'
        );
      }
    }

    sendSuccess(res, {
      campaign: serializeAudienceCampaign(nextCampaign)
    }, 201);
  })
);

router.post(
  '/series/:seriesId/crm/automations',
  authenticate(),
  asyncHandler(async (req, res) => {
    const seriesMeta = await loadCrmSeriesMeta(req, req.params.seriesId);
    assertOrganizerCrmAccess(seriesMeta, req.user);
    const seriesAutomationTriggers = getCrmAutomationTriggersForScope('series');

    const name = String(req.body.name || '').trim().slice(0, 120);
    const title = String(req.body.title || '').trim().slice(0, 140);
    const body = String(req.body.body || '').trim().slice(0, 1600);
    const channel = CRM_CAMPAIGN_CHANNELS.has(String(req.body.channel || '').trim())
      ? String(req.body.channel).trim()
      : 'both';
    const triggerType = seriesAutomationTriggers.has(String(req.body.triggerType || '').trim())
      ? String(req.body.triggerType).trim()
      : '';
    const status = CRM_AUTOMATION_STATUSES.has(String(req.body.status || '').trim())
      ? String(req.body.status).trim()
      : AUTOMATION_STATUS_ACTIVE;

    if (!name) {
      throw new AppError('Automation name is required', 422, 'crm_automation_name_required');
    }
    if (!title) {
      throw new AppError('Automation title is required', 422, 'crm_automation_title_required');
    }
    if (!body) {
      throw new AppError('Automation body is required', 422, 'crm_automation_body_required');
    }
    if (!triggerType) {
      throw new AppError('Choose a valid automation trigger', 422, 'crm_automation_trigger_invalid');
    }

    let segment = null;
    if (req.body.segmentId) {
      segment = await AudienceSegment.findOne({
        _id: req.body.segmentId,
        scopeType: 'series',
        eventId: req.params.seriesId,
        seriesId: req.params.seriesId,
        organizerId: seriesMeta.organizerId
      }).lean();

      if (!segment) {
        throw new AppError('Segment not found', 404, 'crm_segment_not_found');
      }
    }

    const filters = normalizeSeriesCrmFilters(req.body.filters || segment?.filters || {});
    const validatedScheduledFor =
      status === AUTOMATION_STATUS_ACTIVE && isScheduledAutomationTrigger(triggerType)
        ? computeAutomationScheduledFor(triggerType, seriesMeta)
        : null;

    if (
      status === AUTOMATION_STATUS_ACTIVE &&
      isScheduledAutomationTrigger(triggerType) &&
      (
        !validatedScheduledFor ||
        Number.isNaN(validatedScheduledFor.getTime()) ||
        validatedScheduledFor.getTime() <= Date.now()
      )
    ) {
      throw new AppError(
        'This automation trigger is already in the past for the next series drop',
        409,
        'crm_automation_schedule_past'
      );
    }

    let automation;

    if (req.body.automationId) {
      automation = await AudienceAutomation.findOne({
        _id: req.body.automationId,
        scopeType: 'series',
        eventId: req.params.seriesId,
        seriesId: req.params.seriesId,
        organizerId: seriesMeta.organizerId
      });

      if (!automation) {
        throw new AppError('Automation not found', 404, 'crm_automation_not_found');
      }

      automation.name = name;
      automation.title = title;
      automation.body = body;
      automation.channel = channel;
      automation.triggerType = triggerType;
      automation.status = status;
      automation.segmentId = segment?._id?.toString() || '';
      automation.segmentName = segment?.name || '';
      automation.filters = filters;
      automation.updatedByUserId = req.user.sub;
    } else {
      automation = await AudienceAutomation.create({
        scopeType: 'series',
        eventId: req.params.seriesId,
        seriesId: req.params.seriesId,
        organizerId: seriesMeta.organizerId,
        createdByUserId: req.user.sub,
        updatedByUserId: req.user.sub,
        name,
        title,
        body,
        channel,
        triggerType,
        status,
        segmentId: segment?._id?.toString() || '',
        segmentName: segment?.name || '',
        filters
      });
    }

    if (
      automation.status === AUTOMATION_STATUS_ACTIVE &&
      isScheduledAutomationTrigger(automation.triggerType)
    ) {
      automation.scheduledFor = validatedScheduledFor;
      await automation.save();
      await scheduleAutomationDispatch({
        automation,
        scopeMeta: seriesMeta,
        queue: req.services.queue
      });
    } else {
      automation.scheduledFor = null;
      await automation.save();
      await removeAutomationDispatchJob({
        automationId: automation._id.toString(),
        queue: req.services.queue
      });
    }

    sendSuccess(res, {
      automation: serializeAudienceAutomation(automation)
    }, 201);
  })
);

router.delete(
  '/series/:seriesId/crm/automations/:automationId',
  authenticate(),
  asyncHandler(async (req, res) => {
    const seriesMeta = await loadCrmSeriesMeta(req, req.params.seriesId);
    assertOrganizerCrmAccess(seriesMeta, req.user);

    const automation = await AudienceAutomation.findOneAndDelete({
      _id: req.params.automationId,
      scopeType: 'series',
      eventId: req.params.seriesId,
      seriesId: req.params.seriesId,
      organizerId: seriesMeta.organizerId
    });

    if (!automation) {
      throw new AppError('Automation not found', 404, 'crm_automation_not_found');
    }

    await removeAutomationDispatchJob({
      automationId: req.params.automationId,
      queue: req.services.queue
    });

    sendSuccess(res, {
      deleted: true
    });
  })
);

router.post(
  '/internal/networking/:eventId/me',
  asyncHandler(async (req, res) => {
    assertInternalEventService(req);

    const audience = await loadAudienceOrThrow({
      eventId: req.params.eventId,
      userId: req.body.userId
    });
    const matches = await NetworkingMatch.find({
      eventId: req.params.eventId,
      participantUserIds: req.body.userId
    })
      .sort({ score: -1, createdAt: -1 })
      .lean();
    const audienceMap = await loadAudienceMapForUsers({
      eventId: req.params.eventId,
      userIds: matches.flatMap((match) => match.participantUserIds || [])
    });

    sendSuccess(res, {
      eventId: req.params.eventId,
      eventTitle: audience.eventTitle,
      attendeeName: audience.attendeeName,
      ...serializeAudienceNetworking(audience),
      matches: matches.map((match) => serializeMatchForUser(match, req.body.userId, audienceMap))
    });
  })
);

router.post(
  '/internal/networking/:eventId/opt-in',
  asyncHandler(async (req, res) => {
    assertInternalEventService(req);

    const audience = await loadAudienceOrThrow({
      eventId: req.params.eventId,
      userId: req.body.userId
    });

    const previousOptInState = Boolean(audience.networking?.optedIn);
    audience.networking = buildAudienceNetworkingUpdate(req.body, audience.networking || {});
    await audience.save();

    let matches = [];
    let removedMatches = [];

    if (audience.networking?.optedIn) {
      matches = await NetworkingMatch.find({
        eventId: req.params.eventId,
        participantUserIds: req.body.userId
      })
        .sort({ score: -1, createdAt: -1 })
        .lean();
    } else if (previousOptInState) {
      removedMatches = await NetworkingMatch.find({
        eventId: req.params.eventId,
        participantUserIds: req.body.userId
      }).lean();

      await NetworkingMatch.deleteMany({
        eventId: req.params.eventId,
        participantUserIds: req.body.userId
      });
    }

    const audienceMap = await loadAudienceMapForUsers({
      eventId: req.params.eventId,
      userIds: matches.flatMap((match) => match.participantUserIds || [])
    });

    if (removedMatches.length) {
      const removedAudienceMap = await loadAudienceMapForUsers({
        eventId: req.params.eventId,
        userIds: removedMatches.flatMap((match) => match.participantUserIds || [])
      });

      for (const removedMatch of removedMatches) {
        if (!['proposed', 'confirmed'].includes(normalizeNetworkingMeetingStatus(removedMatch.meeting?.status))) {
          continue;
        }

        const participants = (removedMatch.participants || []).map((participant) =>
          mergeParticipantAudienceProfile(participant, removedAudienceMap.get(participant.userId))
        );
        const actor = participants.find((participant) => participant.userId === req.body.userId) || {
          userId: req.body.userId,
          displayName: audience.attendeeName,
          email: audience.email
        };
        const counterpart = participants.find((participant) => participant.userId !== req.body.userId);

        await notifyNetworkingMeetingParticipant({
          req,
          eventId: req.params.eventId,
          eventTitle: audience.eventTitle,
          recipient: counterpart,
          actor,
          counterpartName: actor.displayName || actor.email || 'Your match',
          meetingStatus: 'cancelled',
          meeting: removedMatch.meeting || {}
        });
      }
    }

    sendSuccess(res, {
      eventId: req.params.eventId,
      ...serializeAudienceNetworking(audience),
      matches: matches.map((match) => serializeMatchForUser(match, req.body.userId, audienceMap))
    });
  })
);

router.post(
  '/internal/networking/:eventId/matches/:matchId/decision',
  asyncHandler(async (req, res) => {
    assertInternalEventService(req);

    const audience = await loadAudienceOrThrow({
      eventId: req.params.eventId,
      userId: req.body.userId
    });
    const match = await NetworkingMatch.findOne({
      _id: req.params.matchId,
      eventId: req.params.eventId,
      participantUserIds: req.body.userId
    });

    if (!match) {
      throw new AppError('Networking match not found', 404, 'networking_match_not_found');
    }

    const previousStatuses = buildParticipantStatuses(
      match.participantUserIds,
      match.participantStatuses
    );
    const previousStatus = previousStatuses.find((status) => status.userId === req.body.userId);
    const nextDecision = NETWORKING_DECISIONS.has(req.body.decision)
      ? req.body.decision
      : 'pending';
    const now = new Date();

    match.participantStatuses = previousStatuses.map((status) =>
      status.userId === req.body.userId
        ? {
            userId: status.userId,
            decision: nextDecision,
            decidedAt: nextDecision === 'pending' ? null : now
          }
        : status
    );
    await match.save();

    const updatedStatuses = buildParticipantStatuses(match.participantUserIds, match.participantStatuses);
    const actor = (match.participants || []).find((participant) => participant.userId === req.body.userId);
    const counterpart = (match.participants || []).find((participant) => participant.userId !== req.body.userId);
    const counterpartStatus = updatedStatuses.find((status) => status.userId === counterpart?.userId);

    if (
      nextDecision === 'accepted' &&
      previousStatus?.decision !== 'accepted' &&
      counterpart?.userId
    ) {
      const mutualAcceptance =
        counterpartStatus?.decision === 'accepted' &&
        updatedStatuses.every((status) => status.decision === 'accepted');
      const actorName = actor?.displayName || audience.attendeeName || 'Your match';

      await req.services.createNotification({
        userId: counterpart.userId,
        eventId: req.params.eventId,
        email: counterpart.email,
        type: 'networking.match.accepted',
        title: mutualAcceptance
          ? `Your networking intro is live for ${audience.eventTitle}`
          : `${actorName} is ready to connect`,
        body: mutualAcceptance
          ? `You and ${actorName} both accepted the intro. Start the conversation when it feels right.`
          : `${actorName} accepted the intro for ${audience.eventTitle}. Send a message if the fit looks good.`,
        metadata: {
          counterpartUserId: req.body.userId,
          ctaUrl: buildMessageUrl(req.config.appOrigin, req.body.userId),
          ctaLabel: mutualAcceptance ? 'Open messages' : 'View intro'
        }
      });
    }

    const audienceMap = await loadAudienceMapForUsers({
      eventId: req.params.eventId,
      userIds: match.participantUserIds || []
    });

    sendSuccess(res, {
      match: serializeMatchForUser(match.toObject(), req.body.userId, audienceMap)
    });
  })
);

router.post(
  '/internal/networking/:eventId/matches/:matchId/meeting',
  asyncHandler(async (req, res) => {
    assertInternalEventService(req);

    const audience = await loadAudienceOrThrow({
      eventId: req.params.eventId,
      userId: req.body.userId
    });
    const match = await NetworkingMatch.findOne({
      _id: req.params.matchId,
      eventId: req.params.eventId,
      participantUserIds: req.body.userId
    });

    if (!match) {
      throw new AppError('Networking match not found', 404, 'networking_match_not_found');
    }

    assertMutualNetworkingAcceptance(match);

    const action = String(req.body.action || '').trim().toLowerCase();
    const now = new Date();
    const participantAudiences = await loadAudienceMapForUsers({
      eventId: req.params.eventId,
      userIds: match.participantUserIds || []
    });
    const participants = (match.participants || []).map((participant) =>
      mergeParticipantAudienceProfile(participant, participantAudiences.get(participant.userId))
    );
    const actor = participants.find((participant) => participant.userId === req.body.userId);
    const counterpart = participants.find((participant) => participant.userId !== req.body.userId);
    const currentMeetingStatus = normalizeNetworkingMeetingStatus(match.meeting?.status);

    if (!counterpart?.userId) {
      throw new AppError('This match no longer has a valid counterpart', 409, 'networking_match_incomplete');
    }

    if (action === 'propose') {
      if (currentMeetingStatus === 'confirmed') {
        throw new AppError(
          'Cancel the confirmed meeting before proposing a new slot',
          409,
          'networking_meeting_already_confirmed'
        );
      }
      if (
        currentMeetingStatus === 'proposed' &&
        match.meeting?.proposedByUserId &&
        match.meeting.proposedByUserId !== req.body.userId
      ) {
        throw new AppError(
          'Respond to the current proposal before suggesting another slot',
          409,
          'networking_meeting_response_required'
        );
      }

      const proposedSlot = {
        startsAt: req.body.startsAt,
        endsAt: req.body.endsAt
      };

      if (
        !isBookableMeetingSlot({
          slot: proposedSlot,
          participantProfiles: participants.map((participant) => participant.networkingProfile || {})
        })
      ) {
        throw new AppError(
          'Choose a valid slot from the published availability windows',
          422,
          'networking_meeting_slot_invalid'
        );
      }

      const normalizedSlots = normalizeAvailabilitySlots([proposedSlot]);
      if (!normalizedSlots.length) {
        throw new AppError(
          'Meeting slots must be between 15 and 120 minutes',
          422,
          'networking_meeting_slot_invalid'
        );
      }

      match.meeting = {
        status: 'proposed',
        startsAt: normalizedSlots[0].startsAt,
        endsAt: normalizedSlots[0].endsAt,
        note: sanitizeNetworkingText(req.body.note, 240),
        proposedByUserId: req.body.userId,
        proposedAt: now,
        respondedByUserId: '',
        respondedAt: null,
        confirmedAt: null,
        declinedAt: null,
        cancelledAt: null,
        cancelledByUserId: ''
      };
      await match.save();

      await notifyNetworkingMeetingParticipant({
        req,
        eventId: req.params.eventId,
        eventTitle: audience.eventTitle,
        recipient: counterpart,
        actor,
        counterpartName: actor?.displayName || actor?.email || 'Your match',
        meetingStatus: 'proposed',
        meeting: match.meeting
      });
    } else if (action === 'confirm') {
      if (currentMeetingStatus !== 'proposed' || match.meeting?.proposedByUserId === req.body.userId) {
        throw new AppError(
          'Only the invited attendee can confirm a proposed meeting',
          409,
          'networking_meeting_confirm_invalid'
        );
      }

      match.meeting = {
        ...(match.meeting?.toObject ? match.meeting.toObject() : match.meeting),
        status: 'confirmed',
        respondedByUserId: req.body.userId,
        respondedAt: now,
        confirmedAt: now,
        declinedAt: null,
        cancelledAt: null,
        cancelledByUserId: ''
      };
      await match.save();

      const proposer = participants.find(
        (participant) => participant.userId === match.meeting?.proposedByUserId
      );

      await Promise.all([
        notifyNetworkingMeetingParticipant({
          req,
          eventId: req.params.eventId,
          eventTitle: audience.eventTitle,
          recipient: proposer,
          actor,
          counterpartName: actor?.displayName || actor?.email || 'Your match',
          meetingStatus: 'confirmed',
          meeting: match.meeting
        }),
        notifyNetworkingMeetingParticipant({
          req,
          eventId: req.params.eventId,
          eventTitle: audience.eventTitle,
          recipient: actor,
          actor: proposer || actor,
          counterpartName: proposer?.displayName || proposer?.email || 'Your match',
          meetingStatus: 'confirmed',
          meeting: match.meeting
        })
      ]);
    } else if (action === 'decline') {
      if (currentMeetingStatus !== 'proposed' || match.meeting?.proposedByUserId === req.body.userId) {
        throw new AppError(
          'Only the invited attendee can decline a proposed meeting',
          409,
          'networking_meeting_decline_invalid'
        );
      }

      match.meeting = {
        ...(match.meeting?.toObject ? match.meeting.toObject() : match.meeting),
        status: 'declined',
        respondedByUserId: req.body.userId,
        respondedAt: now,
        declinedAt: now
      };
      await match.save();

      const proposer = participants.find(
        (participant) => participant.userId === match.meeting?.proposedByUserId
      );

      await notifyNetworkingMeetingParticipant({
        req,
        eventId: req.params.eventId,
        eventTitle: audience.eventTitle,
        recipient: proposer,
        actor,
        counterpartName: actor?.displayName || actor?.email || 'Your match',
        meetingStatus: 'declined',
        meeting: match.meeting
      });
    } else if (action === 'cancel') {
      if (!['proposed', 'confirmed'].includes(currentMeetingStatus)) {
        throw new AppError(
          'There is no active meeting proposal to cancel',
          409,
          'networking_meeting_cancel_invalid'
        );
      }

      match.meeting = {
        ...(match.meeting?.toObject ? match.meeting.toObject() : match.meeting),
        status: 'cancelled',
        respondedByUserId: req.body.userId,
        respondedAt: now,
        cancelledAt: now,
        cancelledByUserId: req.body.userId
      };
      await match.save();

      await notifyNetworkingMeetingParticipant({
        req,
        eventId: req.params.eventId,
        eventTitle: audience.eventTitle,
        recipient: counterpart,
        actor,
        counterpartName: actor?.displayName || actor?.email || 'Your match',
        meetingStatus: 'cancelled',
        meeting: match.meeting
      });
    } else {
      throw new AppError('Choose a valid meeting action', 422, 'networking_meeting_action_invalid');
    }

    const refreshedAudienceMap = await loadAudienceMapForUsers({
      eventId: req.params.eventId,
      userIds: match.participantUserIds || []
    });

    sendSuccess(res, {
      match: serializeMatchForUser(match.toObject(), req.body.userId, refreshedAudienceMap)
    });
  })
);

router.get(
  '/internal/networking/:eventId/manage',
  asyncHandler(async (req, res) => {
    assertInternalEventService(req);
    sendSuccess(res, await buildManageResponse(req.params.eventId));
  })
);

router.post(
  '/internal/networking/:eventId/generate',
  asyncHandler(async (req, res) => {
    assertInternalEventService(req);

    const optedInAudience = await EventAudience.find({
      eventId: req.params.eventId,
      'networking.optedIn': true
    }).lean();

    const optedInUserIds = new Set(optedInAudience.map((audience) => audience.userId));
    const existingMatches = await NetworkingMatch.find({
      eventId: req.params.eventId
    }).lean();

    const staleMatchIds = existingMatches
      .filter((match) => (match.participantUserIds || []).some((userId) => !optedInUserIds.has(userId)))
      .map((match) => match._id);

    if (staleMatchIds.length) {
      await NetworkingMatch.deleteMany({
        _id: { $in: staleMatchIds }
      });
    }

    let reusableMatches = existingMatches.filter(
      (match) => !staleMatchIds.some((matchId) => String(matchId) === String(match._id))
    );

    if (req.body.forceRegenerate) {
      await NetworkingMatch.deleteMany({ eventId: req.params.eventId });
      reusableMatches = [];
    }

    if (optedInAudience.length < 2) {
      return sendSuccess(res, {
        createdMatches: 0,
        matchedAttendees: 0,
        recentMatches: [],
        stats: await buildManageResponse(req.params.eventId)
      });
    }

    const profileResponses = await Promise.allSettled(
      optedInAudience.map((audience) =>
        req.clients.userService.get(`/api/users/profile/${audience.userId}`).then((response) => ({
          audience,
          profile: response.data.data
        }))
      )
    );

    const attendees = profileResponses
      .filter((result) => result.status === 'fulfilled')
      .map((result) => {
        const { audience, profile } = result.value;
        return {
          userId: audience.userId,
          displayName: profile.displayName || audience.attendeeName || audience.email,
          email: audience.email,
          avatarUrl: profile.avatarUrl || '',
          location: profile.location || '',
          role: profile.role || 'attendee',
          interests: profile.interests || [],
          networkingProfile: serializeNetworkingProfile(audience.networking || {})
        };
      })
      .filter((attendee) => attendee.userId && attendee.email);

    const generatedMatches = generateNetworkingMatches({
      attendees,
      existingMatches: reusableMatches,
      maxMatchesPerAttendee: Number(req.body.matchesPerAttendee || 2)
    });
    const enrichedMatches = await enrichMatchesWithAiIntros({
      matches: generatedMatches,
      config: req.config,
      eventTitle: req.body.eventTitle,
      logger: req.logger
    });

    if (!enrichedMatches.length) {
      return sendSuccess(res, {
        createdMatches: 0,
        matchedAttendees: new Set(reusableMatches.flatMap((match) => match.participantUserIds || [])).size,
        recentMatches: reusableMatches.slice(0, 10),
        stats: await buildManageResponse(req.params.eventId)
      });
    }

    const now = new Date();
    const createdMatches = await NetworkingMatch.insertMany(
      enrichedMatches.map((match) => ({
        eventId: req.params.eventId,
        organizerId: req.body.organizerId,
        pairKey: match.pairKey,
        participantUserIds: match.participantUserIds,
        participants: [match.firstAttendee, match.secondAttendee],
        sharedInterests: match.sharedInterests,
        sharedIntentTags: match.sharedIntentTags || [],
        score: match.score,
        summary: match.summary,
        introMessages: match.introMessages || {},
        participantStatuses: buildParticipantStatuses(match.participantUserIds),
        introEmailSentAt: now,
        generatedAt: now
      }))
    );

    await EventAudience.updateMany(
      {
        eventId: req.params.eventId,
        userId: {
          $in: [...new Set(createdMatches.flatMap((match) => match.participantUserIds || []))]
        }
      },
      {
        $set: {
          'networking.lastMatchedAt': now
        }
      }
    );

    for (const match of createdMatches) {
      for (const participant of match.participants || []) {
        const counterpart = (match.participants || []).find(
          (candidate) => candidate.userId !== participant.userId
        );
        if (!counterpart) {
          continue;
        }

        await req.services.createNotification({
          userId: participant.userId,
          eventId: req.params.eventId,
          email: participant.email,
          type: 'networking.match.created',
          title: `New networking intro for ${req.body.eventTitle}`,
          body: `Meet ${counterpart.displayName} before the event. ${match.introMessages?.get?.(participant.userId) || match.summary}`,
          metadata: {
            counterpartUserId: counterpart.userId,
            sharedInterests: match.sharedInterests,
            ctaUrl: buildMessageUrl(req.config.appOrigin, counterpart.userId),
            ctaLabel: 'Send message'
          }
        });

        if (participant.email) {
          await req.services.queue.add('send-email', {
            to: participant.email,
            subject: `Your networking intro for ${req.body.eventTitle}`,
            html: buildNetworkingEmailHtml({
              attendeeName: participant.displayName,
              counterpart,
              eventTitle: req.body.eventTitle,
              summary: match.summary,
              introMessage: match.introMessages?.get?.(participant.userId),
              sharedInterests: match.sharedInterests,
              appOrigin: req.config.appOrigin
            })
          });
        }
      }
    }

    sendSuccess(res, {
      createdMatches: createdMatches.length,
      matchedAttendees: new Set(createdMatches.flatMap((match) => match.participantUserIds || [])).size,
      recentMatches: createdMatches.slice(0, 10),
      stats: await buildManageResponse(req.params.eventId)
    });
  })
);

module.exports = router;
