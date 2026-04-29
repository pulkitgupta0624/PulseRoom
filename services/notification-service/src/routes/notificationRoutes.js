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
  generateNetworkingMatches
} = require('../services/networkingService');

const router = express.Router();

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
  sharedInterests,
  appOrigin
}) => `
  <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">
    <p>Hi ${attendeeName || 'there'},</p>
    <p>We found a strong pre-event networking match for <strong>${eventTitle}</strong>.</p>
    <p><strong>${counterpart.displayName}</strong>${counterpart.location ? ` is based in ${counterpart.location}.` : '.'}</p>
    <p>${summary}</p>
    ${sharedInterests?.length ? `<p>Shared interests: <strong>${sharedInterests.slice(0, 4).join(', ')}</strong></p>` : ''}
    <p>
      <a href="${buildMessageUrl(appOrigin, counterpart.userId)}" style="display:inline-block;padding:12px 18px;border-radius:9999px;background:#111827;color:#f9fafb;text-decoration:none;font-weight:700;">
        Start the conversation
      </a>
    </p>
  </div>
`;

const serializeMatchForUser = (match, userId) => {
  const participants = match.participants || [];
  const counterpart = participants.find((participant) => participant.userId !== userId);

  return {
    matchId: match._id.toString(),
    eventId: match.eventId,
    counterpart,
    sharedInterests: match.sharedInterests || [],
    score: Number(match.score || 0),
    summary: match.summary || '',
    introEmailSentAt: match.introEmailSentAt || null,
    createdAt: match.createdAt
  };
};

const buildManageResponse = async (eventId) => {
  const [audienceCount, optedInCount, matches] = await Promise.all([
    EventAudience.countDocuments({ eventId }),
    EventAudience.countDocuments({
      eventId,
      'networking.optedIn': true
    }),
    NetworkingMatch.find({ eventId })
      .sort({ score: -1, createdAt: -1 })
      .lean()
  ]);

  const matchedAttendeeIds = new Set();
  for (const match of matches) {
    for (const participantUserId of match.participantUserIds || []) {
      matchedAttendeeIds.add(participantUserId);
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
    createdMatches: matches.length,
    matchedAttendees: matchedAttendeeIds.size,
    introEmailsSent: matches.filter((match) => match.introEmailSentAt).length * 2,
    lastGeneratedAt,
    recentMatches: matches.slice(0, 10).map((match) => ({
      matchId: match._id.toString(),
      sharedInterests: match.sharedInterests || [],
      score: Number(match.score || 0),
      summary: match.summary || '',
      introEmailSentAt: match.introEmailSentAt || null,
      participants: match.participants || []
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
      optedIn: Boolean(audience.networking?.optedIn),
      optedInAt: audience.networking?.optedInAt || null,
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

    audience.networking = {
      ...(audience.networking || {}),
      optedIn: Boolean(req.body.optedIn),
      optedInAt: req.body.optedIn ? new Date() : null
    };
    await audience.save();

    const matches = await NetworkingMatch.find({
      eventId: req.params.eventId,
      participantUserIds: req.body.userId
    })
      .sort({ score: -1, createdAt: -1 })
      .lean();

    sendSuccess(res, {
      eventId: req.params.eventId,
      optedIn: Boolean(audience.networking?.optedIn),
      optedInAt: audience.networking?.optedInAt || null,
      matches: matches.map((match) => serializeMatchForUser(match, req.body.userId))
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
          interests: profile.interests || []
        };
      })
      .filter((attendee) => attendee.userId && attendee.email);

    const generatedMatches = generateNetworkingMatches({
      attendees,
      existingMatches: reusableMatches,
      maxMatchesPerAttendee: Number(req.body.matchesPerAttendee || 2)
    });

    if (!generatedMatches.length) {
      return sendSuccess(res, {
        createdMatches: 0,
        matchedAttendees: new Set(reusableMatches.flatMap((match) => match.participantUserIds || [])).size,
        recentMatches: reusableMatches.slice(0, 10),
        stats: await buildManageResponse(req.params.eventId)
      });
    }

    const now = new Date();
    const createdMatches = await NetworkingMatch.insertMany(
      generatedMatches.map((match) => ({
        eventId: req.params.eventId,
        organizerId: req.body.organizerId,
        pairKey: match.pairKey,
        participantUserIds: match.participantUserIds,
        participants: [match.firstAttendee, match.secondAttendee],
        sharedInterests: match.sharedInterests,
        score: match.score,
        summary: match.summary,
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
          body: `Meet ${counterpart.displayName} before the event. ${match.summary}`,
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
