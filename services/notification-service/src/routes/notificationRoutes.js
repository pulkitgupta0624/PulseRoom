const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  sendSuccess
} = require('@pulseroom/common');
const Notification = require('../models/Notification');
const EventAudience = require('../models/EventAudience');
const NetworkingMatch = require('../models/NetworkingMatch');
const {
  enrichMatchesWithAiIntros,
  generateNetworkingMatches
} = require('../services/networkingService');

const router = express.Router();
const NETWORKING_DECISIONS = new Set(['pending', 'accepted', 'skipped']);

const assertInternalEventService = (req) => {
  if (req.headers['x-service-name'] !== 'event-service') {
    throw new AppError('Forbidden', 403, 'forbidden');
  }
};

const buildMessageUrl = (appOrigin, userId) =>
  `${String(appOrigin || '').replace(/\/$/, '')}/messages/${userId}`;

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

const sanitizeNetworkingText = (value, maxLength = 240) =>
  String(value || '').trim().slice(0, maxLength);

const normalizeNetworkingList = (values = []) =>
  [...new Set((Array.isArray(values) ? values : [])
    .map((value) => sanitizeNetworkingText(value, 40).toLowerCase())
    .filter(Boolean))]
    .slice(0, 8);

const serializeNetworkingProfile = (networking = {}) => ({
  meetingGoal: sanitizeNetworkingText(networking.meetingGoal, 80),
  canHelpWith: Array.isArray(networking.canHelpWith) ? networking.canHelpWith : [],
  lookingFor: Array.isArray(networking.lookingFor) ? networking.lookingFor : [],
  availabilityNote: sanitizeNetworkingText(networking.availabilityNote, 240)
});

const hasNetworkingProfile = (networking = {}) => {
  const profile = serializeNetworkingProfile(networking);
  return Boolean(
    profile.meetingGoal ||
    profile.canHelpWith.length ||
    profile.lookingFor.length ||
    profile.availabilityNote
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

  return nextNetworking;
};

const serializeMatchForUser = (match, userId) => {
  const participants = match.participants || [];
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
    sendSuccess(res, notification);
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

    sendSuccess(res, {
      eventId: req.params.eventId,
      eventTitle: audience.eventTitle,
      attendeeName: audience.attendeeName,
      ...serializeAudienceNetworking(audience),
      matches: matches.map((match) => serializeMatchForUser(match, req.body.userId))
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

    if (audience.networking?.optedIn) {
      matches = await NetworkingMatch.find({
        eventId: req.params.eventId,
        participantUserIds: req.body.userId
      })
        .sort({ score: -1, createdAt: -1 })
        .lean();
    } else if (previousOptInState) {
      await NetworkingMatch.deleteMany({
        eventId: req.params.eventId,
        participantUserIds: req.body.userId
      });
    }

    sendSuccess(res, {
      eventId: req.params.eventId,
      ...serializeAudienceNetworking(audience),
      matches: matches.map((match) => serializeMatchForUser(match, req.body.userId))
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

    sendSuccess(res, {
      match: serializeMatchForUser(match.toObject(), req.body.userId)
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
