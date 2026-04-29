import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';
import ModalShell from './ModalShell';

const formatMinuteLabel = (value) =>
  new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

const HeatmapTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) {
    return null;
  }

  const readableLabel = Number.isNaN(new Date(label).getTime()) ? label : formatMinuteLabel(label);

  return (
    <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3 shadow-lg">
      <p className="text-xs uppercase tracking-[0.18em] text-ink/40">{readableLabel}</p>
      <div className="mt-2 space-y-1 text-sm">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="text-ink/55">{entry.name}</span>
            <span className="font-semibold text-ink">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MetricCard = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

const HeatCell = ({ bucket, maxInteractions }) => {
  const intensity = maxInteractions > 0 ? bucket.totalInteractions / maxInteractions : 0;
  const background = intensity
    ? `rgba(29,124,116,${Math.max(0.12, intensity)})`
    : 'rgba(28,25,23,0.05)';

  return (
    <div className="space-y-1">
      <div
        className="h-12 rounded-xl border border-white/50"
        style={{ background }}
        title={`${formatMinuteLabel(bucket.minuteBucket)} • ${bucket.totalInteractions} total interactions`}
      />
      <p className="text-[10px] text-ink/35">{formatMinuteLabel(bucket.minuteBucket)}</p>
    </div>
  );
};

const EngagementHeatmapModal = ({ event, onClose }) => {
  const [windowMinutes, setWindowMinutes] = useState(180);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  const refreshData = async (nextWindowMinutes = windowMinutes) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/live/${event._id}/engagement-heatmap`, {
        params: {
          windowMinutes: nextWindowMinutes
        }
      });
      setAnalytics(response.data.data);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Unable to load engagement analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData(windowMinutes);
  }, [event._id, windowMinutes]);

  const series = useMemo(
    () =>
      (analytics?.series || []).map((item) => ({
        ...item,
        label: formatMinuteLabel(item.minuteBucket)
      })),
    [analytics]
  );

  const maxInteractions = useMemo(
    () => Math.max(0, ...series.map((item) => item.totalInteractions || 0)),
    [series]
  );

  const heatmapSeries = useMemo(
    () => (series.length > 48 ? series.filter((_, index) => index % 3 === 0) : series),
    [series]
  );

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="engagement-heatmap-title"
      panelClassName="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-ink/10 bg-white px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-dusk">Engagement Heatmap</p>
            <h2 id="engagement-heatmap-title" className="mt-1 font-display text-3xl text-ink">{event.title}</h2>
            <p className="mt-2 text-sm text-ink/55">
              Live minute-by-minute engagement from chat messages, poll votes, reactions, and Q&A activity.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={windowMinutes}
              onChange={(eventInput) => setWindowMinutes(Number(eventInput.target.value))}
              className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-sm text-ink"
            >
              <option value={60}>Last 60 min</option>
              <option value={180}>Last 180 min</option>
              <option value={360}>Last 360 min</option>
            </select>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close engagement heatmap"
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
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-dusk border-t-transparent" />
            </div>
          ) : error ? (
            <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
          ) : (
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard label="Total" value={analytics?.totals?.totalInteractions || 0} />
                <MetricCard label="Chat" value={analytics?.totals?.chatMessages || 0} accent="text-reef" />
                <MetricCard label="Poll Votes" value={analytics?.totals?.pollVotes || 0} accent="text-dusk" />
                <MetricCard label="Reactions" value={analytics?.totals?.reactions || 0} accent="text-ember" />
                <MetricCard label="Questions" value={analytics?.totals?.questions || 0} />
              </section>

              <section className="rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Heat strip</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Where the room spiked</h3>
                    <p className="mt-2 text-sm text-ink/55">
                      Darker cells mean denser attendee interaction during that minute.
                    </p>
                  </div>
                  <div className="space-y-1 text-sm text-ink/60">
                    <p>
                      Peak: {analytics?.peakBucket ? `${formatMinuteLabel(analytics.peakBucket.minuteBucket)} (${analytics.peakBucket.totalInteractions})` : 'No activity yet'}
                    </p>
                    <p>
                      Drop-off: {analytics?.dropoffBucket ? `${formatMinuteLabel(analytics.dropoffBucket.minuteBucket)} (${analytics.dropoffBucket.totalInteractions})` : 'Not enough activity yet'}
                    </p>
                  </div>
                </div>

                {!heatmapSeries.length ? (
                  <div className="mt-5 rounded-[24px] bg-sand/50 px-5 py-10 text-center">
                    <p className="text-sm text-ink/50">No engagement signals yet for this window.</p>
                  </div>
                ) : (
                  <div
                    className="mt-5 grid gap-2"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(36px, 1fr))' }}
                  >
                    {heatmapSeries.map((bucket) => (
                      <HeatCell
                        key={bucket.minuteBucket}
                        bucket={bucket}
                        maxInteractions={maxInteractions}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5">
                  <div className="mb-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Interaction flow</p>
                    <p className="mt-1 text-sm text-ink/55">Total activity per minute across the selected window.</p>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series}>
                        <defs>
                          <linearGradient id="heatmapFlow" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1d7c74" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#1d7c74" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7ddd2" />
                        <XAxis dataKey="label" tick={{ fill: '#6f665d', fontSize: 12 }} />
                        <YAxis tick={{ fill: '#6f665d', fontSize: 12 }} />
                        <Tooltip content={<HeatmapTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="totalInteractions"
                          name="Total"
                          stroke="#1d7c74"
                          strokeWidth={2.5}
                          fill="url(#heatmapFlow)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5">
                  <div className="mb-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Signal mix</p>
                    <p className="mt-1 text-sm text-ink/55">See whether chat, polls, or reactions drove each spike.</p>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={series}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7ddd2" />
                        <XAxis dataKey="label" tick={{ fill: '#6f665d', fontSize: 12 }} />
                        <YAxis tick={{ fill: '#6f665d', fontSize: 12 }} />
                        <Tooltip content={<HeatmapTooltip />} />
                        <Bar dataKey="chatMessages" name="Chat" stackId="engagement" fill="#1d7c74" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="pollVotes" name="Poll Votes" stackId="engagement" fill="#2f4f7f" />
                        <Bar dataKey="reactions" name="Reactions" stackId="engagement" fill="#ff7a59" />
                        <Bar dataKey="questions" name="Questions" stackId="engagement" fill="#b45309" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Top spikes</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Best moments to review</h3>
                  </div>
                  <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                    {analytics?.spikes?.length || 0} spikes
                  </span>
                </div>

                {!analytics?.spikes?.length ? (
                  <div className="mt-5 rounded-[24px] bg-sand/50 px-5 py-10 text-center">
                    <p className="text-sm text-ink/50">No spikes recorded yet.</p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {analytics.spikes.map((spike) => (
                      <div key={spike.minuteBucket} className="rounded-[24px] border border-ink/10 bg-sand/55 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">{formatDate(spike.minuteBucket)}</p>
                            <p className="mt-1 text-xs text-ink/45">
                              Chat {spike.chatMessages} • Polls {spike.pollVotes} • Reactions {spike.reactions} • Questions {spike.questions}
                            </p>
                          </div>
                          <span className="rounded-full bg-reef/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-reef">
                            {spike.totalInteractions} total
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
    </ModalShell>
  );
};

export default EngagementHeatmapModal;
