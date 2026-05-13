import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { downloadEventFeedbackCsv } from '../lib/downloads';
import { formatDate } from '../lib/formatters';
import ModalShell from './ModalShell';

const NPS_BUCKET_STYLES = {
  promoter: 'bg-reef/10 text-reef',
  passive: 'bg-dusk/10 text-dusk',
  detractor: 'bg-ember/10 text-ember'
};

const StaticStarRating = ({ rating }) => (
  <div className="flex items-center gap-1" aria-label={`${rating} star rating`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <svg
        key={star}
        className={`h-4 w-4 ${star <= rating ? 'text-amber-500' : 'text-ink/15'}`}
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.148 3.53a1 1 0 00.95.69h3.708c.969 0 1.371 1.24.588 1.81l-3 2.18a1 1 0 00-.364 1.118l1.146 3.53c.3.922-.755 1.688-1.54 1.118l-3-2.18a1 1 0 00-1.176 0l-3 2.18c-.784.57-1.838-.196-1.539-1.118l1.145-3.53a1 1 0 00-.363-1.118l-3-2.18c-.784-.57-.38-1.81.588-1.81h3.708a1 1 0 00.95-.69l1.147-3.53z" />
      </svg>
    ))}
  </div>
);

const MetricTile = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[22px] border border-ink/8 bg-white px-4 py-4">
    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

const EventFeedbackInsightsModal = ({ event, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const loadInsights = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/events/${event._id}/feedback/manage`);
      setData(response.data.data);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Unable to load post-event feedback insights.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInsights();
  }, [event._id]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);

    try {
      await downloadEventFeedbackCsv(event._id, `${event.title || 'event'}-feedback.csv`);
    } catch (downloadError) {
      setError(downloadError.response?.data?.message || 'Unable to export feedback CSV right now.');
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary || {};
  const sessionInsights = data?.sessions || {
    all: [],
    topRated: [],
    needsAttention: []
  };
  const responses = data?.responses || [];

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="event-feedback-insights-title"
      panelClassName="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-ink/10 bg-white px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-dusk">Feedback + NPS</p>
          <h2 id="event-feedback-insights-title" className="mt-1 font-display text-3xl text-ink">
            {event.title}
          </h2>
          <p className="mt-2 text-sm text-ink/55">
            Post-event survey signals, session sentiment, and the notes attendees actually left behind.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            className="rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink disabled:opacity-60"
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback insights"
            className="rounded-full p-2 text-ink/50 transition hover:bg-sand hover:text-ink"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-dusk border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            {error && (
              <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
            )}

            <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <MetricTile label="Responses" value={summary.responsesCount || 0} />
              <MetricTile label="Response Rate" value={`${summary.responseRate || 0}%`} accent="text-dusk" />
              <MetricTile label="NPS" value={summary.npsScore || 0} accent="text-reef" />
              <MetricTile label="Avg Rating" value={summary.averageOverallRating || 0} accent="text-amber-500" />
              <MetricTile label="Attend Again" value={`${summary.wouldAttendAgainRate || 0}%`} accent="text-reef" />
              <MetricTile label="Session Ratings" value={summary.totalSessionRatings || 0} accent="text-ink" />
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
              <div className="space-y-6">
                <article className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">NPS Mix</p>
                      <h3 className="mt-1 font-display text-2xl text-ink">Promoters vs. detractors</h3>
                    </div>
                    <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                      Avg NPS score {summary.averageNpsScore || 0}/10
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[22px] bg-reef/5 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-reef">Promoters</p>
                      <p className="mt-2 font-display text-3xl text-reef">{summary.promotersCount || 0}</p>
                    </div>
                    <div className="rounded-[22px] bg-dusk/5 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-dusk">Passives</p>
                      <p className="mt-2 font-display text-3xl text-dusk">{summary.passivesCount || 0}</p>
                    </div>
                    <div className="rounded-[22px] bg-ember/5 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ember">Detractors</p>
                      <p className="mt-2 font-display text-3xl text-ember">{summary.detractorsCount || 0}</p>
                    </div>
                  </div>
                </article>

                <article className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Top Sessions</p>
                      <h3 className="mt-1 font-display text-2xl text-ink">Best-loved programming</h3>
                    </div>
                    <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                      Avg {summary.averageSessionRating || 0}/5
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {sessionInsights.topRated?.length ? sessionInsights.topRated.map((entry) => (
                      <div key={entry.sessionKey} className="rounded-2xl border border-ink/8 bg-sand/45 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">{entry.title}</p>
                            <p className="mt-1 text-xs text-ink/45">
                              {[entry.roomLabel, formatDate(entry.startsAt)].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-display text-2xl text-reef">{entry.averageRating}</p>
                            <p className="text-xs text-ink/45">{entry.responseCount} ratings</p>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p className="rounded-2xl bg-sand/45 px-4 py-4 text-sm text-ink/55">
                        No session-specific ratings yet.
                      </p>
                    )}
                  </div>
                </article>
              </div>

              <div className="space-y-6">
                <article className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Needs Attention</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Lowest-rated sessions</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {sessionInsights.needsAttention?.length ? sessionInsights.needsAttention.map((entry) => (
                      <div key={entry.sessionKey} className="rounded-2xl border border-ink/8 bg-sand/45 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">{entry.title}</p>
                            <p className="mt-1 text-xs text-ink/45">
                              {[entry.roomLabel, formatDate(entry.startsAt)].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-display text-2xl text-ember">{entry.averageRating}</p>
                            <p className="text-xs text-ink/45">{entry.responseCount} ratings</p>
                          </div>
                        </div>
                        {entry.comments?.[0] && (
                          <p className="mt-3 text-sm text-ink/65">"{entry.comments[0]}"</p>
                        )}
                      </div>
                    )) : (
                      <p className="rounded-2xl bg-sand/45 px-4 py-4 text-sm text-ink/55">
                        No session concerns have been captured yet.
                      </p>
                    )}
                  </div>
                </article>

                <article className="rounded-[28px] border border-ink/10 bg-white/85 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Recent Voices</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">What attendees actually said</h3>
                  </div>
                  {!responses.length ? (
                    <div className="mt-4 rounded-[24px] bg-sand/45 px-5 py-10 text-center">
                      <p className="text-sm text-ink/55">
                        Feedback requests are live, but no attendee responses have landed yet.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {responses.map((response) => (
                        <article key={response._id} className="rounded-[24px] border border-ink/8 bg-sand/45 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-ink">{response.attendeeName}</h4>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                              NPS_BUCKET_STYLES[response.npsBucket] || NPS_BUCKET_STYLES.passive
                            }`}>
                              {response.npsBucket}
                            </span>
                            <span className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-[11px] text-ink/50">
                              NPS {response.npsScore}/10
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-ink/60">
                            <StaticStarRating rating={response.overallRating} />
                            <span>{response.attendAgain ? 'Would attend again' : 'Not ready to return yet'}</span>
                            <span>{formatDate(response.updatedAt || response.createdAt)}</span>
                          </div>

                          {response.highlightText && (
                            <div className="mt-4 rounded-2xl bg-white px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-reef">What landed</p>
                              <p className="mt-2 text-sm text-ink/70">{response.highlightText}</p>
                            </div>
                          )}

                          {response.improvementText && (
                            <div className="mt-3 rounded-2xl bg-white px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-ember">What to improve</p>
                              <p className="mt-2 text-sm text-ink/70">{response.improvementText}</p>
                            </div>
                          )}

                          {response.sessionFeedback?.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {response.sessionFeedback.map((entry) => (
                                <span
                                  key={`${response._id}-${entry.sessionKey}`}
                                  className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs text-ink/55"
                                >
                                  {entry.title} · {entry.rating}/5
                                </span>
                              ))}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </article>
              </div>
            </section>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

export default EventFeedbackInsightsModal;
