const REVIEW_UNLOCK_DELAY_HOURS = 48;

const buildReviewWindowOpensAt = (completedAt = new Date()) =>
  new Date(new Date(completedAt).getTime() + REVIEW_UNLOCK_DELAY_HOURS * 60 * 60 * 1000);

const getReviewWindowOpensAt = (event) => {
  if (event?.reviewWindowOpensAt) {
    return event.reviewWindowOpensAt;
  }

  if (event?.status === 'completed' && (event?.endsAt || event?.updatedAt)) {
    return buildReviewWindowOpensAt(event.endsAt || event.updatedAt);
  }

  return null;
};

const hasReviewWindowOpened = (event, now = new Date()) => {
  const opensAt = getReviewWindowOpensAt(event);
  if (!opensAt) {
    return false;
  }

  return new Date(opensAt).getTime() <= new Date(now).getTime();
};

const buildReviewSummary = (aggregate = {}) => ({
  averageRating: Number(Number(aggregate.averageRating || 0).toFixed(1)),
  totalRatings: Number(aggregate.totalRatings || 0),
  distribution: {
    1: Number(aggregate.oneStar || 0),
    2: Number(aggregate.twoStar || 0),
    3: Number(aggregate.threeStar || 0),
    4: Number(aggregate.fourStar || 0),
    5: Number(aggregate.fiveStar || 0)
  }
});

const serializeReview = (review) => {
  const raw = typeof review?.toObject === 'function' ? review.toObject() : review;
  if (!raw) {
    return null;
  }

  return {
    ...raw,
    reviewText: raw.reviewText || '',
    organizerReply: raw.organizerReply
      ? {
          ...raw.organizerReply,
          body: raw.organizerReply.body || ''
        }
      : null
  };
};

module.exports = {
  REVIEW_UNLOCK_DELAY_HOURS,
  buildReviewSummary,
  buildReviewWindowOpensAt,
  getReviewWindowOpensAt,
  hasReviewWindowOpened,
  serializeReview
};
