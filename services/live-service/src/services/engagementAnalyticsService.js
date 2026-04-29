const EngagementMinute = require('../models/EngagementMinute');

const HEATMAP_FIELDS = ['chatMessages', 'pollVotes', 'reactions', 'questions'];

const getMinuteBucket = (value = new Date()) => {
  const date = new Date(value);
  date.setSeconds(0, 0);
  return date;
};

const incrementEngagementMetric = async ({ eventId, field, amount = 1, at = new Date() }) => {
  if (!eventId || !HEATMAP_FIELDS.includes(field)) {
    return null;
  }

  return EngagementMinute.findOneAndUpdate(
    {
      eventId,
      minuteBucket: getMinuteBucket(at)
    },
    {
      $inc: {
        [field]: amount,
        totalInteractions: amount
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
};

const buildEngagementHeatmap = ({ eventId, documents, windowMinutes = 180, now = new Date() }) => {
  const safeWindowMinutes = Math.max(30, Math.min(720, Number(windowMinutes || 180)));
  const end = getMinuteBucket(now);
  const start = new Date(end.getTime() - (safeWindowMinutes - 1) * 60 * 1000);
  const documentMap = new Map(
    (Array.isArray(documents) ? documents : []).map((document) => [
      new Date(document.minuteBucket).toISOString(),
      document
    ])
  );

  const series = [];
  for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + 60 * 1000)) {
    const isoMinute = cursor.toISOString();
    const source = documentMap.get(isoMinute);

    series.push({
      eventId,
      minuteBucket: isoMinute,
      chatMessages: Number(source?.chatMessages || 0),
      pollVotes: Number(source?.pollVotes || 0),
      reactions: Number(source?.reactions || 0),
      questions: Number(source?.questions || 0),
      totalInteractions: Number(source?.totalInteractions || 0)
    });
  }

  const activeSeries = series.filter((item) => item.totalInteractions > 0);
  const totals = series.reduce(
    (accumulator, item) => ({
      chatMessages: accumulator.chatMessages + item.chatMessages,
      pollVotes: accumulator.pollVotes + item.pollVotes,
      reactions: accumulator.reactions + item.reactions,
      questions: accumulator.questions + item.questions,
      totalInteractions: accumulator.totalInteractions + item.totalInteractions
    }),
    {
      chatMessages: 0,
      pollVotes: 0,
      reactions: 0,
      questions: 0,
      totalInteractions: 0
    }
  );

  const peakBucket = activeSeries.reduce(
    (peak, item) => (!peak || item.totalInteractions > peak.totalInteractions ? item : peak),
    null
  );
  const peakIndex = peakBucket
    ? series.findIndex((item) => item.minuteBucket === peakBucket.minuteBucket)
    : -1;
  const dropoffBucket =
    peakIndex >= 0
      ? series
          .slice(peakIndex + 1)
          .reduce(
            (lowest, item) =>
              !lowest || item.totalInteractions < lowest.totalInteractions ? item : lowest,
            null
          )
      : null;

  return {
    eventId,
    windowMinutes: safeWindowMinutes,
    series,
    totals,
    peakBucket,
    dropoffBucket,
    spikes: activeSeries
      .slice()
      .sort((left, right) => right.totalInteractions - left.totalInteractions)
      .slice(0, 5)
  };
};

module.exports = {
  buildEngagementHeatmap,
  getMinuteBucket,
  incrementEngagementMetric
};
