const normalizeString = (value, fallback = '') => String(value || fallback).trim();

const normalizeOptionalDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeIntegerInRange = (value, { min, max, fallback = null }) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    return fallback;
  }

  return normalized;
};

const slugSegment = (value, fallback = 'session') =>
  normalizeString(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;

const buildEventSessionKey = (session = {}, index = 0) => {
  const explicitKey = normalizeString(session.sessionId || session.sessionKey);
  if (explicitKey) {
    return explicitKey;
  }

  const startTime = session.startsAt ? new Date(session.startsAt).getTime() : NaN;
  const startSegment = Number.isFinite(startTime) && startTime > 0 ? startTime : `slot-${index + 1}`;

  return [
    slugSegment(session.title, `session-${index + 1}`),
    startSegment,
    slugSegment(session.roomLabel, 'room')
  ].join('--');
};

const buildSurveySessionCatalog = (sessions = []) =>
  (Array.isArray(sessions) ? sessions : []).reduce((accumulator, session, index) => {
    const normalized = {
      sessionKey: buildEventSessionKey(session, index),
      title: normalizeString(session.title, `Session ${index + 1}`),
      startsAt: normalizeOptionalDate(session.startsAt),
      roomLabel: normalizeString(session.roomLabel),
      speakerNames: Array.isArray(session.speakerNames)
        ? session.speakerNames.map((name) => normalizeString(name)).filter(Boolean)
        : []
    };

    if (!accumulator.has(normalized.sessionKey)) {
      accumulator.set(normalized.sessionKey, normalized);
    }

    return accumulator;
  }, new Map());

const normalizeSessionFeedbackEntries = ({ eventSessions = [], sessionFeedback = [] }) => {
  const sessionCatalog = buildSurveySessionCatalog(eventSessions);
  const normalizedEntries = [];
  const seen = new Set();

  for (const entry of Array.isArray(sessionFeedback) ? sessionFeedback : []) {
    const sessionKey = normalizeString(entry?.sessionKey);
    if (!sessionKey || seen.has(sessionKey) || !sessionCatalog.has(sessionKey)) {
      continue;
    }

    const sessionMeta = sessionCatalog.get(sessionKey);
    const rating = normalizeIntegerInRange(entry?.rating, {
      min: 1,
      max: 5
    });
    if (!rating) {
      continue;
    }

    seen.add(sessionKey);
    normalizedEntries.push({
      sessionKey,
      title: sessionMeta.title,
      startsAt: sessionMeta.startsAt,
      roomLabel: sessionMeta.roomLabel,
      rating,
      comment: normalizeString(entry?.comment).slice(0, 600)
    });
  }

  return normalizedEntries;
};

const classifyNpsScore = (score) => {
  const normalized = normalizeIntegerInRange(score, {
    min: 0,
    max: 10,
    fallback: 0
  });
  if (normalized >= 9) {
    return 'promoter';
  }
  if (normalized >= 7) {
    return 'passive';
  }
  return 'detractor';
};

const serializeEventFeedback = (feedback) => {
  const raw = typeof feedback?.toObject === 'function' ? feedback.toObject() : feedback;
  if (!raw) {
    return null;
  }

  return {
    ...raw,
    attendeeName: normalizeString(raw.attendeeName, 'Attendee'),
    attendeeEmail: normalizeString(raw.attendeeEmail),
    overallRating: normalizeIntegerInRange(raw.overallRating, {
      min: 1,
      max: 5,
      fallback: 0
    }),
    npsScore: normalizeIntegerInRange(raw.npsScore, {
      min: 0,
      max: 10,
      fallback: 0
    }),
    npsBucket: classifyNpsScore(raw.npsScore),
    attendAgain: Boolean(raw.attendAgain),
    highlightText: normalizeString(raw.highlightText),
    improvementText: normalizeString(raw.improvementText),
    sessionFeedback: (Array.isArray(raw.sessionFeedback) ? raw.sessionFeedback : []).map((entry) => ({
      sessionKey: normalizeString(entry.sessionKey),
      title: normalizeString(entry.title),
      startsAt: normalizeOptionalDate(entry.startsAt),
      roomLabel: normalizeString(entry.roomLabel),
      rating: normalizeIntegerInRange(entry.rating, {
        min: 1,
        max: 5,
        fallback: 0
      }),
      comment: normalizeString(entry.comment)
    }))
  };
};

const buildFeedbackInsights = ({ responses = [], attendeeTarget = 0 } = {}) => {
  const serializedResponses = (Array.isArray(responses) ? responses : [])
    .map(serializeEventFeedback)
    .filter(Boolean);
  const responsesCount = serializedResponses.length;
  const attendeeTargetCount = Math.max(0, Number(attendeeTarget || 0));
  const responseRate = attendeeTargetCount > 0
    ? Number(((responsesCount / attendeeTargetCount) * 100).toFixed(1))
    : 0;

  const npsBuckets = {
    promoter: 0,
    passive: 0,
    detractor: 0
  };
  let totalNpsScore = 0;
  let totalOverallRating = 0;
  let wouldAttendAgainCount = 0;
  let totalSessionRatings = 0;
  let totalSessionRatingValue = 0;
  const sessionMap = new Map();

  serializedResponses.forEach((response) => {
    totalNpsScore += Number(response.npsScore || 0);
    totalOverallRating += Number(response.overallRating || 0);
    if (response.attendAgain) {
      wouldAttendAgainCount += 1;
    }

    const bucket = response.npsBucket || 'detractor';
    npsBuckets[bucket] += 1;

    response.sessionFeedback.forEach((entry) => {
      totalSessionRatings += 1;
      totalSessionRatingValue += Number(entry.rating || 0);

      const current = sessionMap.get(entry.sessionKey) || {
        sessionKey: entry.sessionKey,
        title: entry.title,
        startsAt: entry.startsAt,
        roomLabel: entry.roomLabel,
        responseCount: 0,
        totalRating: 0,
        comments: []
      };

      current.responseCount += 1;
      current.totalRating += Number(entry.rating || 0);
      if (entry.comment) {
        current.comments.push(entry.comment);
      }

      sessionMap.set(entry.sessionKey, current);
    });
  });

  const sessionInsights = [...sessionMap.values()]
    .map((entry) => ({
      sessionKey: entry.sessionKey,
      title: entry.title,
      startsAt: entry.startsAt,
      roomLabel: entry.roomLabel,
      responseCount: entry.responseCount,
      averageRating: Number((entry.totalRating / Math.max(1, entry.responseCount)).toFixed(1)),
      comments: entry.comments.slice(0, 3)
    }))
    .sort((left, right) => {
      if (right.responseCount !== left.responseCount) {
        return right.responseCount - left.responseCount;
      }

      return right.averageRating - left.averageRating;
    });

  const topRatedSessions = [...sessionInsights]
    .filter((entry) => entry.responseCount > 0)
    .sort((left, right) => {
      if (right.averageRating !== left.averageRating) {
        return right.averageRating - left.averageRating;
      }

      return right.responseCount - left.responseCount;
    })
    .slice(0, 5);

  const needsAttentionSessions = [...sessionInsights]
    .filter((entry) => entry.responseCount > 0)
    .sort((left, right) => {
      if (left.averageRating !== right.averageRating) {
        return left.averageRating - right.averageRating;
      }

      return right.responseCount - left.responseCount;
    })
    .slice(0, 5);

  return {
    summary: {
      responsesCount,
      attendeeTarget: attendeeTargetCount,
      responseRate,
      averageNpsScore: responsesCount
        ? Number((totalNpsScore / responsesCount).toFixed(1))
        : 0,
      npsScore: responsesCount
        ? Math.round(((npsBuckets.promoter - npsBuckets.detractor) / responsesCount) * 100)
        : 0,
      promotersCount: npsBuckets.promoter,
      passivesCount: npsBuckets.passive,
      detractorsCount: npsBuckets.detractor,
      averageOverallRating: responsesCount
        ? Number((totalOverallRating / responsesCount).toFixed(1))
        : 0,
      wouldAttendAgainRate: responsesCount
        ? Number(((wouldAttendAgainCount / responsesCount) * 100).toFixed(1))
        : 0,
      totalSessionRatings,
      averageSessionRating: totalSessionRatings
        ? Number((totalSessionRatingValue / totalSessionRatings).toFixed(1))
        : 0
    },
    sessions: {
      all: sessionInsights,
      topRated: topRatedSessions,
      needsAttention: needsAttentionSessions
    },
    responses: serializedResponses
  };
};

module.exports = {
  buildEventSessionKey,
  buildFeedbackInsights,
  buildSurveySessionCatalog,
  classifyNpsScore,
  normalizeSessionFeedbackEntries,
  serializeEventFeedback
};
