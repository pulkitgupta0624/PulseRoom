const UserGamification = require('../models/UserGamification');
const GamificationAction = require('../models/GamificationAction');
const {
  BADGE_DEFINITIONS,
  DEFAULT_STATS,
  POINT_RULES,
  TOP_QUESTION_UPVOTES,
  buildEligibleBadgeKeys,
  buildEntitlements,
  buildLevelSummary,
  buildNextGoals,
  buildUnlockedPerks,
  hasBadge,
  isEarlyBooking,
  normalizeStats
} = require('./catalog');

const MAX_RECENT_ACTIVITY_ITEMS = 12;

const isDuplicateKeyError = (error) =>
  error?.code === 11000;

const ensureProfile = async (userId) =>
  UserGamification.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        stats: { ...DEFAULT_STATS }
      }
    },
    {
      upsert: true,
      new: true
    }
  );

const buildRecentActivityItem = ({
  type = 'points',
  title,
  description = '',
  points = 0,
  occurredAt = new Date(),
  actionKey = '',
  badgeKey = '',
  metadata = {}
}) => ({
  type,
  title,
  description,
  points: Number(points || 0),
  occurredAt: new Date(occurredAt),
  actionKey,
  badgeKey,
  metadata
});

const buildRecordActionUpdate = ({
  userId,
  points = 0,
  occurredAt = new Date(),
  statsIncrements = {},
  title = '',
  description = '',
  metadata = {},
  ruleKey = '',
  actionType = '',
  recordInFeed = true
}) => {
  const inc = {};
  if (Number(points || 0) !== 0) {
    inc.totalPoints = Number(points || 0);
    inc.lifetimePoints = Number(points || 0);
  }

  for (const [key, value] of Object.entries(statsIncrements || {})) {
    if (Number(value || 0) !== 0) {
      inc[`stats.${key}`] = Number(value || 0);
    }
  }

  const update = {
    // Only set the root identifier on insert. Setting `stats` here would
    // conflict with `$inc` on `stats.*` for first-time users.
    $setOnInsert: {
      userId
    },
    $set: {
      lastActiveAt: new Date(occurredAt)
    }
  };

  if (Object.keys(inc).length) {
    update.$inc = inc;
  }

  if (recordInFeed && title) {
    update.$push = {
      recentActivity: {
        $each: [
          buildRecentActivityItem({
            type: points ? 'points' : 'milestone',
            title,
            description,
            points,
            occurredAt,
            actionKey: ruleKey || actionType,
            metadata
          })
        ],
        $position: 0,
        $slice: MAX_RECENT_ACTIVITY_ITEMS
      }
    };
  }

  return update;
};

const recordAction = async ({
  userId,
  actionType,
  ruleKey = '',
  dedupeKey,
  points = 0,
  occurredAt = new Date(),
  statsIncrements = {},
  title = '',
  description = '',
  metadata = {},
  recordInFeed = true
}) => {
  try {
    await GamificationAction.create({
      userId,
      actionType,
      ruleKey,
      dedupeKey,
      points: Number(points || 0),
      occurredAt: new Date(occurredAt),
      metadata
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return null;
    }

    throw error;
  }

  return UserGamification.findOneAndUpdate(
    { userId },
    buildRecordActionUpdate({
      userId,
      points,
      occurredAt,
      statsIncrements,
      title,
      description,
      metadata,
      ruleKey,
      actionType,
      recordInFeed
    }),
    {
      upsert: true,
      new: true
    }
  );
};

const awardBadge = async ({ userId, badgeKey, occurredAt = new Date() }) => {
  const badgeDefinition = BADGE_DEFINITIONS[badgeKey];
  if (!badgeDefinition) {
    return false;
  }

  await ensureProfile(userId);

  const updateResult = await UserGamification.updateOne(
    {
      userId,
      'badges.key': { $ne: badgeKey }
    },
    {
      $push: {
        badges: {
          ...badgeDefinition,
          awardedAt: new Date(occurredAt)
        },
        recentActivity: {
          $each: [
            buildRecentActivityItem({
              type: 'badge',
              title: `Unlocked ${badgeDefinition.name}`,
              description: badgeDefinition.description,
              badgeKey,
              occurredAt,
              metadata: {
                perkUnlocks: badgeDefinition.perkUnlocks || []
              }
            })
          ],
          $position: 0,
          $slice: MAX_RECENT_ACTIVITY_ITEMS
        }
      },
      $set: {
        lastActiveAt: new Date(occurredAt)
      }
    }
  );

  return Boolean(updateResult.modifiedCount);
};

const awardEligibleBadges = async (userId, occurredAt = new Date()) => {
  const profile = await ensureProfile(userId);
  const normalizedStats = normalizeStats(profile.stats);
  const eligibleBadgeKeys = buildEligibleBadgeKeys(normalizedStats);

  for (const badgeKey of eligibleBadgeKeys) {
    if (!hasBadge(profile.badges, badgeKey)) {
      await awardBadge({
        userId,
        badgeKey,
        occurredAt
      });
    }
  }

  return UserGamification.findOne({ userId }).lean();
};

const serializeProfile = (profile, { includeActivity = true } = {}) => {
  const raw = typeof profile?.toObject === 'function' ? profile.toObject() : profile;
  const badges = [...(raw?.badges || [])].sort(
    (left, right) =>
      new Date(right.awardedAt || 0).getTime() - new Date(left.awardedAt || 0).getTime()
  );
  const stats = normalizeStats(raw?.stats);
  const recentActivity = includeActivity
    ? [...(raw?.recentActivity || [])]
        .sort(
          (left, right) =>
            new Date(right.occurredAt || 0).getTime() - new Date(left.occurredAt || 0).getTime()
        )
        .slice(0, 8)
    : [];

  return {
    userId: raw?.userId || '',
    totalPoints: Number(raw?.totalPoints || 0),
    lifetimePoints: Number(raw?.lifetimePoints || 0),
    level: buildLevelSummary(raw?.totalPoints || 0),
    stats,
    badges,
    perks: buildUnlockedPerks(badges),
    entitlements: buildEntitlements(badges),
    nextGoals: buildNextGoals(stats, badges),
    recentActivity,
    createdAt: raw?.createdAt || null,
    updatedAt: raw?.updatedAt || null,
    lastActiveAt: raw?.lastActiveAt || null
  };
};

const getSummary = async (userId) => {
  const profile = await ensureProfile(userId);
  return serializeProfile(profile);
};

const getPublicSummary = async (userId) => {
  const profile = await ensureProfile(userId);
  const serialized = serializeProfile(profile, { includeActivity: false });
  return {
    userId: serialized.userId,
    totalPoints: serialized.totalPoints,
    level: serialized.level,
    badges: serialized.badges,
    perks: serialized.perks,
    stats: {
      attendedEvents: serialized.stats.attendedEvents,
      topQuestions: serialized.stats.topQuestions,
      reviewsSubmitted: serialized.stats.reviewsSubmitted
    }
  };
};

const getEntitlements = async (userId) => {
  const profile = await ensureProfile(userId);
  const serialized = serializeProfile(profile, { includeActivity: false });
  return {
    userId,
    totalPoints: serialized.totalPoints,
    level: serialized.level,
    perks: serialized.entitlements.perks
  };
};

const handleUserRegistered = async ({ payload }) => {
  if (!payload?.userId) {
    return null;
  }

  return ensureProfile(payload.userId);
};

const handleBookingConfirmed = async ({ payload, timestamp }) => {
  if (!payload?.userId || !payload?.bookingId) {
    return null;
  }

  const occurredAt = payload.confirmedAt || timestamp || new Date();
  await recordAction({
    userId: payload.userId,
    actionType: 'booking.confirmed',
    ruleKey: POINT_RULES.BOOKING_CONFIRMED.key,
    dedupeKey: `booking-confirmed:${payload.bookingId}`,
    points: POINT_RULES.BOOKING_CONFIRMED.points,
    occurredAt,
    statsIncrements: {
      confirmedBookings: 1
    },
    title: POINT_RULES.BOOKING_CONFIRMED.title,
    description: POINT_RULES.BOOKING_CONFIRMED.description,
    metadata: {
      bookingId: payload.bookingId,
      eventId: payload.eventId,
      eventTitle: payload.eventTitle
    }
  });

  if (
    isEarlyBooking({
      eventStartsAt: payload.eventStartsAt,
      occurredAt
    })
  ) {
    await recordAction({
      userId: payload.userId,
      actionType: 'booking.early',
      ruleKey: POINT_RULES.EARLY_BOOKING.key,
      dedupeKey: `booking-early:${payload.bookingId}`,
      points: POINT_RULES.EARLY_BOOKING.points,
      occurredAt,
      statsIncrements: {
        earlyBookings: 1
      },
      title: POINT_RULES.EARLY_BOOKING.title,
      description: POINT_RULES.EARLY_BOOKING.description,
      metadata: {
        bookingId: payload.bookingId,
        eventId: payload.eventId,
        eventTitle: payload.eventTitle
      }
    });
  }

  return awardEligibleBadges(payload.userId, occurredAt);
};

const handleBookingCheckedIn = async ({ payload, timestamp }) => {
  if (!payload?.userId || !payload?.bookingId) {
    return null;
  }

  const occurredAt = payload.checkedInAt || timestamp || new Date();
  await recordAction({
    userId: payload.userId,
    actionType: 'booking.checked_in',
    ruleKey: POINT_RULES.EVENT_ATTENDED.key,
    dedupeKey: `booking-check-in:${payload.bookingId}`,
    points: POINT_RULES.EVENT_ATTENDED.points,
    occurredAt,
    statsIncrements: {
      attendedEvents: 1
    },
    title: POINT_RULES.EVENT_ATTENDED.title,
    description: POINT_RULES.EVENT_ATTENDED.description,
    metadata: {
      bookingId: payload.bookingId,
      eventId: payload.eventId,
      eventTitle: payload.eventTitle
    }
  });

  return awardEligibleBadges(payload.userId, occurredAt);
};

const handleReviewSubmitted = async ({ payload, timestamp }) => {
  if (!payload?.userId || !payload?.reviewId) {
    return null;
  }

  const occurredAt = payload.createdAt || timestamp || new Date();
  await recordAction({
    userId: payload.userId,
    actionType: 'event.review_submitted',
    ruleKey: POINT_RULES.REVIEW_SUBMITTED.key,
    dedupeKey: `review-submitted:${payload.reviewId}`,
    points: POINT_RULES.REVIEW_SUBMITTED.points,
    occurredAt,
    statsIncrements: {
      reviewsSubmitted: 1
    },
    title: POINT_RULES.REVIEW_SUBMITTED.title,
    description: POINT_RULES.REVIEW_SUBMITTED.description,
    metadata: {
      reviewId: payload.reviewId,
      eventId: payload.eventId
    }
  });

  return awardEligibleBadges(payload.userId, occurredAt);
};

const handleNetworkingOptIn = async ({ payload, timestamp }) => {
  if (!payload?.userId || !payload?.eventId) {
    return null;
  }

  const occurredAt = payload.optedInAt || timestamp || new Date();
  await recordAction({
    userId: payload.userId,
    actionType: 'networking.opted_in',
    ruleKey: POINT_RULES.NETWORKING_OPT_IN.key,
    dedupeKey: `networking-opt-in:${payload.eventId}:${payload.userId}`,
    points: POINT_RULES.NETWORKING_OPT_IN.points,
    occurredAt,
    statsIncrements: {
      networkingOptIns: 1
    },
    title: POINT_RULES.NETWORKING_OPT_IN.title,
    description: POINT_RULES.NETWORKING_OPT_IN.description,
    metadata: {
      eventId: payload.eventId,
      eventTitle: payload.eventTitle || ''
    }
  });

  return awardEligibleBadges(payload.userId, occurredAt);
};

const handleQuestionPosted = async ({ payload, timestamp }) => {
  if (!payload?.userId || !payload?.questionId) {
    return null;
  }

  await recordAction({
    userId: payload.userId,
    actionType: 'question.posted',
    ruleKey: 'question-posted',
    dedupeKey: `question-posted:${payload.questionId}`,
    occurredAt: timestamp || new Date(),
    statsIncrements: {
      questionsAsked: 1
    },
    title: '',
    description: '',
    metadata: {
      questionId: payload.questionId,
      eventId: payload.eventId
    },
    recordInFeed: false
  });

  return ensureProfile(payload.userId);
};

const handleQuestionUpvoted = async ({ payload, timestamp }) => {
  if (
    !payload?.authorUserId ||
    !payload?.questionId ||
    Number(payload.upvotes || 0) < TOP_QUESTION_UPVOTES
  ) {
    return null;
  }

  const occurredAt = timestamp || new Date();
  await recordAction({
    userId: payload.authorUserId,
    actionType: 'question.top_voted',
    ruleKey: POINT_RULES.TOP_QUESTION.key,
    dedupeKey: `question-top-voted:${payload.questionId}`,
    points: POINT_RULES.TOP_QUESTION.points,
    occurredAt,
    statsIncrements: {
      topQuestions: 1
    },
    title: POINT_RULES.TOP_QUESTION.title,
    description: POINT_RULES.TOP_QUESTION.description,
    metadata: {
      questionId: payload.questionId,
      eventId: payload.eventId,
      upvotes: Number(payload.upvotes || 0)
    }
  });

  return awardEligibleBadges(payload.authorUserId, occurredAt);
};

module.exports = {
  awardEligibleBadges,
  getEntitlements,
  getPublicSummary,
  getSummary,
  handleBookingCheckedIn,
  handleBookingConfirmed,
  handleNetworkingOptIn,
  handleQuestionPosted,
  handleQuestionUpvoted,
  handleReviewSubmitted,
  handleUserRegistered,
  buildRecordActionUpdate
};
