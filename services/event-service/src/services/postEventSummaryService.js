const normalizeText = (value, fallback = '') =>
  String(value || fallback)
    .trim();

const normalizeStringList = (values = [], limit = 8) =>
  (Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .slice(0, limit);

const buildSummarySourceMetrics = (liveContext = {}) => {
  const reactions = Array.isArray(liveContext.reactions) ? liveContext.reactions : [];
  const engagement = liveContext.engagement || {};

  return {
    pollCount: Array.isArray(liveContext.polls) ? liveContext.polls.length : 0,
    questionCount: Array.isArray(liveContext.questions) ? liveContext.questions.length : 0,
    announcementCount: Array.isArray(liveContext.announcements) ? liveContext.announcements.length : 0,
    reactionCount: reactions.reduce(
      (total, reaction) => total + Number(reaction?.count || 0),
      0
    ),
    totalInteractions: Number(engagement?.totals?.totalInteractions || 0),
    peakInteractions: Number(engagement?.peakBucket?.totalInteractions || 0)
  };
};

const buildStoredPostEventSummary = ({
  summary = {},
  liveContext = {},
  generatedByUserId = '',
  generatedAt = new Date()
}) => ({
  generatedAt: new Date(generatedAt),
  generatedByUserId: normalizeText(generatedByUserId),
  executiveSummary: normalizeText(summary.executiveSummary),
  keyTakeaways: normalizeStringList(summary.keyTakeaways, 8),
  flashcards: (Array.isArray(summary.flashcards) ? summary.flashcards : [])
    .map((flashcard) => ({
      front: normalizeText(flashcard?.front),
      back: normalizeText(flashcard?.back)
    }))
    .filter((flashcard) => flashcard.front && flashcard.back)
    .slice(0, 12),
  followUpActions: (Array.isArray(summary.followUpActions) ? summary.followUpActions : [])
    .map((action) => ({
      owner: ['organizer', 'attendee', 'speaker'].includes(action?.owner)
        ? action.owner
        : 'organizer',
      action: normalizeText(action?.action),
      priority: ['high', 'medium', 'low'].includes(action?.priority)
        ? action.priority
        : 'medium'
    }))
    .filter((action) => action.action)
    .slice(0, 8),
  audienceSignals: (Array.isArray(summary.audienceSignals) ? summary.audienceSignals : [])
    .map((signal) => ({
      signal: normalizeText(signal?.signal),
      evidence: normalizeText(signal?.evidence)
    }))
    .filter((signal) => signal.signal && signal.evidence)
    .slice(0, 8),
  sourceMetrics: buildSummarySourceMetrics(liveContext)
});

const serializePostEventSummary = (value) => {
  if (!value) {
    return null;
  }

  const raw = typeof value.toObject === 'function' ? value.toObject() : { ...value };

  return {
    generatedAt: raw.generatedAt || null,
    generatedByUserId: raw.generatedByUserId || '',
    executiveSummary: normalizeText(raw.executiveSummary),
    keyTakeaways: normalizeStringList(raw.keyTakeaways, 8),
    flashcards: (Array.isArray(raw.flashcards) ? raw.flashcards : []).map((flashcard) => ({
      front: normalizeText(flashcard?.front),
      back: normalizeText(flashcard?.back)
    })),
    followUpActions: (Array.isArray(raw.followUpActions) ? raw.followUpActions : []).map((action) => ({
      owner: action?.owner || 'organizer',
      action: normalizeText(action?.action),
      priority: action?.priority || 'medium'
    })),
    audienceSignals: (Array.isArray(raw.audienceSignals) ? raw.audienceSignals : []).map((signal) => ({
      signal: normalizeText(signal?.signal),
      evidence: normalizeText(signal?.evidence)
    })),
    sourceMetrics: {
      pollCount: Number(raw?.sourceMetrics?.pollCount || 0),
      questionCount: Number(raw?.sourceMetrics?.questionCount || 0),
      announcementCount: Number(raw?.sourceMetrics?.announcementCount || 0),
      reactionCount: Number(raw?.sourceMetrics?.reactionCount || 0),
      totalInteractions: Number(raw?.sourceMetrics?.totalInteractions || 0),
      peakInteractions: Number(raw?.sourceMetrics?.peakInteractions || 0)
    }
  };
};

module.exports = {
  buildStoredPostEventSummary,
  buildSummarySourceMetrics,
  serializePostEventSummary
};
