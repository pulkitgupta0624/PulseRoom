const EARLY_BOOKING_WINDOW_DAYS = 14;
const POWER_ATTENDEE_ATTENDANCE_COUNT = 5;
const REVIEW_VOICE_COUNT = 3;
const TOP_QUESTION_UPVOTES = 5;
const EARLY_ACCESS_WINDOW_HOURS = 24;

const POINT_RULES = Object.freeze({
  BOOKING_CONFIRMED: {
    key: 'booking-confirmed',
    points: 50,
    title: 'Booked an event',
    description: 'Confirmed a ticket for an upcoming PulseRoom event.'
  },
  EARLY_BOOKING: {
    key: 'early-booking',
    points: 20,
    title: 'Booked early',
    description: `Reserved a seat at least ${EARLY_BOOKING_WINDOW_DAYS} days before the event.`
  },
  EVENT_ATTENDED: {
    key: 'event-attended',
    points: 100,
    title: 'Checked in',
    description: 'Showed up and attended an event.'
  },
  REVIEW_SUBMITTED: {
    key: 'review-submitted',
    points: 30,
    title: 'Left a review',
    description: 'Shared useful feedback after an event.'
  },
  NETWORKING_OPT_IN: {
    key: 'networking-opt-in',
    points: 15,
    title: 'Joined networking',
    description: 'Opted in to attendee matching for an event.'
  },
  TOP_QUESTION: {
    key: 'top-question',
    points: 40,
    title: 'Top-voted question',
    description: `Your live Q&A question reached ${TOP_QUESTION_UPVOTES}+ upvotes.`
  }
});

const BADGE_DEFINITIONS = Object.freeze({
  'first-booking': {
    key: 'first-booking',
    name: 'First Booking',
    description: 'Confirmed your first PulseRoom booking.',
    perkUnlocks: []
  },
  'early-bird': {
    key: 'early-bird',
    name: 'Early Bird',
    description: `Booked an event at least ${EARLY_BOOKING_WINDOW_DAYS} days before it started.`,
    perkUnlocks: []
  },
  'networking-starter': {
    key: 'networking-starter',
    name: 'Networking Starter',
    description: 'Opted into attendee networking for the first time.',
    perkUnlocks: ['priority-networking']
  },
  'review-voice': {
    key: 'review-voice',
    name: 'Review Voice',
    description: `Submitted ${REVIEW_VOICE_COUNT} event reviews.`,
    perkUnlocks: ['trusted-reviewer']
  },
  'top-contributor': {
    key: 'top-contributor',
    name: 'Top Contributor',
    description: `Earned ${TOP_QUESTION_UPVOTES}+ upvotes on a live question.`,
    perkUnlocks: ['qa-spotlight']
  },
  'power-attendee': {
    key: 'power-attendee',
    name: 'Power Attendee',
    description: `Checked in at ${POWER_ATTENDEE_ATTENDANCE_COUNT} events.`,
    perkUnlocks: ['early-access']
  }
});

const PERK_DEFINITIONS = Object.freeze({
  'early-access': {
    key: 'early-access',
    name: 'Early Access',
    description: `Unlock ticket tiers up to ${EARLY_ACCESS_WINDOW_HOURS} hours before public sale.`,
    windowHours: EARLY_ACCESS_WINDOW_HOURS
  },
  'priority-networking': {
    key: 'priority-networking',
    name: 'Priority Networking',
    description: 'Flagged for richer matchmaking perks as networking expands.'
  },
  'trusted-reviewer': {
    key: 'trusted-reviewer',
    name: 'Trusted Reviewer',
    description: 'Your profile highlights that you consistently leave event feedback.'
  },
  'qa-spotlight': {
    key: 'qa-spotlight',
    name: 'Q&A Spotlight',
    description: 'Your top-contributor badge is showcased on your profile.'
  }
});

const LEVELS = Object.freeze([
  { label: 'Starter', minPoints: 0 },
  { label: 'Explorer', minPoints: 120 },
  { label: 'Connector', minPoints: 260 },
  { label: 'Headliner', minPoints: 520 },
  { label: 'Legend', minPoints: 900 }
]);

const DEFAULT_STATS = Object.freeze({
  confirmedBookings: 0,
  earlyBookings: 0,
  attendedEvents: 0,
  reviewsSubmitted: 0,
  networkingOptIns: 0,
  questionsAsked: 0,
  topQuestions: 0
});

const normalizeStats = (stats = {}) => ({
  confirmedBookings: Number(stats.confirmedBookings || 0),
  earlyBookings: Number(stats.earlyBookings || 0),
  attendedEvents: Number(stats.attendedEvents || 0),
  reviewsSubmitted: Number(stats.reviewsSubmitted || 0),
  networkingOptIns: Number(stats.networkingOptIns || 0),
  questionsAsked: Number(stats.questionsAsked || 0),
  topQuestions: Number(stats.topQuestions || 0)
});

const buildLevelSummary = (totalPoints = 0) => {
  const safePoints = Number(totalPoints || 0);
  let currentLevel = LEVELS[0];
  let nextLevel = null;

  for (const level of LEVELS) {
    if (safePoints >= level.minPoints) {
      currentLevel = level;
      continue;
    }

    nextLevel = level;
    break;
  }

  const progressPercent = nextLevel
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            ((safePoints - currentLevel.minPoints) /
              (nextLevel.minPoints - currentLevel.minPoints)) *
              100
          )
        )
      )
    : 100;

  return {
    label: currentLevel.label,
    currentThreshold: currentLevel.minPoints,
    nextThreshold: nextLevel?.minPoints || null,
    progressPercent,
    pointsToNextLevel: nextLevel ? Math.max(0, nextLevel.minPoints - safePoints) : 0
  };
};

const buildUnlockedPerks = (badges = []) => {
  const perkMap = new Map();

  for (const badge of badges) {
    const badgeDefinition = BADGE_DEFINITIONS[badge.key];
    const perkKeys = badge?.perkUnlocks?.length
      ? badge.perkUnlocks
      : badgeDefinition?.perkUnlocks || [];

    for (const perkKey of perkKeys) {
      const perkDefinition = PERK_DEFINITIONS[perkKey];
      if (!perkDefinition || perkMap.has(perkKey)) {
        continue;
      }

      perkMap.set(perkKey, {
        ...perkDefinition,
        unlockedAt: badge.awardedAt || null,
        sourceBadgeKey: badge.key
      });
    }
  }

  return [...perkMap.values()].sort(
    (left, right) =>
      new Date(right.unlockedAt || 0).getTime() - new Date(left.unlockedAt || 0).getTime()
  );
};

const buildEntitlements = (badges = []) => {
  const unlockedPerks = buildUnlockedPerks(badges);
  const perkMap = new Map(unlockedPerks.map((perk) => [perk.key, perk]));
  const earlyAccess = perkMap.get('early-access');

  return {
    perks: {
      earlyAccess: {
        unlocked: Boolean(earlyAccess),
        windowHours: EARLY_ACCESS_WINDOW_HOURS,
        unlockedAt: earlyAccess?.unlockedAt || null,
        sourceBadgeKey: earlyAccess?.sourceBadgeKey || null
      }
    }
  };
};

const hasBadge = (badges = [], badgeKey) =>
  badges.some((badge) => badge.key === badgeKey);

const buildEligibleBadgeKeys = (stats = {}) => {
  const normalized = normalizeStats(stats);
  const eligible = [];

  if (normalized.confirmedBookings >= 1) {
    eligible.push('first-booking');
  }
  if (normalized.earlyBookings >= 1) {
    eligible.push('early-bird');
  }
  if (normalized.networkingOptIns >= 1) {
    eligible.push('networking-starter');
  }
  if (normalized.reviewsSubmitted >= REVIEW_VOICE_COUNT) {
    eligible.push('review-voice');
  }
  if (normalized.topQuestions >= 1) {
    eligible.push('top-contributor');
  }
  if (normalized.attendedEvents >= POWER_ATTENDEE_ATTENDANCE_COUNT) {
    eligible.push('power-attendee');
  }

  return eligible;
};

const buildNextGoals = (stats = {}, badges = []) => {
  const normalized = normalizeStats(stats);
  const goals = [
    {
      badgeKey: 'power-attendee',
      name: BADGE_DEFINITIONS['power-attendee'].name,
      description: BADGE_DEFINITIONS['power-attendee'].description,
      current: normalized.attendedEvents,
      target: POWER_ATTENDEE_ATTENDANCE_COUNT
    },
    {
      badgeKey: 'review-voice',
      name: BADGE_DEFINITIONS['review-voice'].name,
      description: BADGE_DEFINITIONS['review-voice'].description,
      current: normalized.reviewsSubmitted,
      target: REVIEW_VOICE_COUNT
    },
    {
      badgeKey: 'top-contributor',
      name: BADGE_DEFINITIONS['top-contributor'].name,
      description: BADGE_DEFINITIONS['top-contributor'].description,
      current: normalized.topQuestions,
      target: 1
    }
  ];

  return goals
    .map((goal) => ({
      ...goal,
      unlocked: hasBadge(badges, goal.badgeKey),
      remaining: Math.max(0, goal.target - goal.current)
    }))
    .filter((goal) => !goal.unlocked);
};

const isEarlyBooking = ({ eventStartsAt, occurredAt }) => {
  if (!eventStartsAt || !occurredAt) {
    return false;
  }

  const startsAt = new Date(eventStartsAt).getTime();
  const bookedAt = new Date(occurredAt).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(bookedAt) || bookedAt >= startsAt) {
    return false;
  }

  const windowMs = EARLY_BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return startsAt - bookedAt >= windowMs;
};

module.exports = {
  BADGE_DEFINITIONS,
  DEFAULT_STATS,
  EARLY_ACCESS_WINDOW_HOURS,
  EARLY_BOOKING_WINDOW_DAYS,
  PERK_DEFINITIONS,
  POINT_RULES,
  POWER_ATTENDEE_ATTENDANCE_COUNT,
  REVIEW_VOICE_COUNT,
  TOP_QUESTION_UPVOTES,
  buildEligibleBadgeKeys,
  buildEntitlements,
  buildLevelSummary,
  buildNextGoals,
  buildUnlockedPerks,
  hasBadge,
  isEarlyBooking,
  normalizeStats
};
