const { Roles } = require('@pulseroom/common');

const STAFF_BADGES = Object.freeze({
  [Roles.ADMIN]: 'Admin',
  [Roles.MODERATOR]: 'Moderator',
  [Roles.ORGANIZER]: 'Organizer'
});

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const getSpeakerProfile = (eventMeta, user = {}) => {
  const normalizedUserEmail = normalizeEmail(user.email);

  return (
    (eventMeta?.speakers || []).find((speaker) => {
      if (speaker.userId && speaker.userId === user.sub) {
        return true;
      }

      return Boolean(
        normalizedUserEmail &&
        speaker.email &&
        normalizeEmail(speaker.email) === normalizedUserEmail
      );
    }) || null
  );
};

const buildAuthorProfile = ({ user, eventMeta }) => {
  const speakerProfile = getSpeakerProfile(eventMeta, user);
  const isSpeakerUser = user.role === Roles.SPEAKER;
  const staffBadge = STAFF_BADGES[user.role] || null;
  const badge = speakerProfile || isSpeakerUser ? 'Speaker' : staffBadge;

  return {
    userId: user.sub,
    name: speakerProfile?.name || user.email?.split('@')?.[0] || 'Guest',
    role: user.role,
    badge,
    isSpeaker: Boolean(speakerProfile || isSpeakerUser),
    speakerTitle: speakerProfile?.title || '',
    speakerCompany: speakerProfile?.company || ''
  };
};

const getVisibleReplies = (replies = []) =>
  replies.filter((reply) => !reply.hidden);

const sortByCreatedAt = (left, right) =>
  new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

const buildReplyTree = (replies = [], parentReplyId = null) =>
  getVisibleReplies(replies)
    .filter((reply) => (reply.parentReplyId || null) === parentReplyId)
    .sort(sortByCreatedAt)
    .map((reply) => ({
      ...reply,
      author: reply.author || {
        userId: '',
        name: 'Attendee',
        role: Roles.ATTENDEE,
        badge: null,
        isSpeaker: false,
        speakerTitle: '',
        speakerCompany: ''
      },
      replies: buildReplyTree(replies, reply.replyId)
    }));

const serializeQuestionThread = (question) => {
  const raw = typeof question?.toObject === 'function' ? question.toObject() : question;
  const replies = raw?.replies || [];
  const fallbackBadge = raw?.createdByRole === Roles.SPEAKER ? 'Speaker' : STAFF_BADGES[raw?.createdByRole] || null;

  return {
    ...raw,
    author: raw?.author || {
      userId: raw?.userId || '',
      name: 'Attendee',
      role: raw?.createdByRole || Roles.ATTENDEE,
      badge: fallbackBadge,
      isSpeaker: fallbackBadge === 'Speaker',
      speakerTitle: '',
      speakerCompany: ''
    },
    pinned: Boolean(raw?.pinnedAt),
    replyCount: getVisibleReplies(replies).length,
    replies: buildReplyTree(replies)
  };
};

const compareQuestionsForFeed = (left, right) => {
  const leftPinned = left?.pinnedAt ? new Date(left.pinnedAt).getTime() : 0;
  const rightPinned = right?.pinnedAt ? new Date(right.pinnedAt).getTime() : 0;
  if (leftPinned !== rightPinned) {
    return rightPinned - leftPinned;
  }

  if (Boolean(left.answered) !== Boolean(right.answered)) {
    return Number(left.answered) - Number(right.answered);
  }

  if (Number(left.upvotes || 0) !== Number(right.upvotes || 0)) {
    return Number(right.upvotes || 0) - Number(left.upvotes || 0);
  }

  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
};

const serializeQuestionFeed = (questions = []) =>
  questions
    .map(serializeQuestionThread)
    .sort(compareQuestionsForFeed);

const shouldAutoResolveQuestion = (authorProfile) =>
  ['Speaker', 'Organizer', 'Moderator', 'Admin'].includes(authorProfile?.badge);

module.exports = {
  buildAuthorProfile,
  getSpeakerProfile,
  serializeQuestionFeed,
  serializeQuestionThread,
  shouldAutoResolveQuestion
};
