import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';
import ModalShell from './ModalShell';

const MetricCard = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

const NetworkingManagerModal = ({ event, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState({
    enabled: false,
    matchesPerAttendee: 2
  });
  const [stats, setStats] = useState(null);

  const refreshData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/events/${event._id}/networking/manage`);
      setSettings(response.data.data.settings || {
        enabled: false,
        matchesPerAttendee: 2
      });
      setStats(response.data.data.stats || null);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Unable to load networking settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [event._id]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      await api.patch(`/api/events/${event._id}/networking`, settings);
      setStatus({
        tone: 'success',
        message: settings.enabled
          ? 'Networking is now ready for attendee opt-ins.'
          : 'Networking is paused for this event.'
      });
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save networking settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setStatus(null);

    try {
      const response = await api.post(`/api/events/${event._id}/networking/generate`, {});
      const createdMatches = response.data.data.createdMatches || 0;
      setStatus({
        tone: 'success',
        message: createdMatches
          ? `Generated ${createdMatches} new attendee introductions.`
          : 'No new matches were created. More opt-ins or stronger overlap may be needed.'
      });
      await refreshData();
    } catch (generateError) {
      setError(generateError.response?.data?.message || 'Unable to generate networking matches.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="networking-manager-title"
      panelClassName="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-ink/10 bg-white px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-reef">Attendee Networking</p>
            <h2 id="networking-manager-title" className="mt-1 font-display text-3xl text-ink">{event.title}</h2>
            <p className="mt-2 text-sm text-ink/55">
              Opt attendees in, generate shared-interest introductions, and drive pre-event conversations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close attendee networking manager"
            className="rounded-full p-2 text-ink/50 transition hover:bg-sand hover:text-ink"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-reef border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard label="Audience" value={stats?.audienceCount || 0} />
                <MetricCard label="Opted In" value={stats?.optedInCount || 0} accent="text-reef" />
                <MetricCard label="Pairs" value={stats?.createdMatches || 0} accent="text-dusk" />
                <MetricCard label="Matched People" value={stats?.matchedAttendees || 0} accent="text-ember" />
                <MetricCard label="Emails Sent" value={stats?.introEmailsSent || 0} />
              </section>

              {error && (
                <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
              )}

              {status && (
                <p className={`rounded-2xl px-4 py-3 text-sm ${
                  status.tone === 'success' ? 'bg-reef/10 text-reef' : 'bg-ember/10 text-ember'
                }`}>
                  {status.message}
                </p>
              )}

              <section className="rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Settings</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Networking controls</h3>
                    <p className="mt-2 text-sm text-ink/55">
                      Turn the program on for this event and control how many intros each attendee can receive.
                    </p>
                  </div>
                  {stats?.lastGeneratedAt && (
                    <p className="text-xs text-ink/45">
                      Last generated {formatDate(stats.lastGeneratedAt)}
                    </p>
                  )}
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-[1fr,220px]">
                  <label className="rounded-[24px] border border-ink/10 bg-sand/50 px-4 py-4 text-sm text-ink/70">
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={(eventInput) =>
                          setSettings((current) => ({
                            ...current,
                            enabled: eventInput.target.checked
                          }))
                        }
                      />
                      Enable pre-event networking
                    </span>
                    <span className="mt-2 block text-xs text-ink/45">
                      Attendees can opt in from their tickets page once this is enabled.
                    </span>
                  </label>

                  <div>
                    <label className="text-xs uppercase tracking-[0.18em] text-ink/45">Matches per attendee</label>
                    <select
                      value={settings.matchesPerAttendee}
                      onChange={(eventInput) =>
                        setSettings((current) => ({
                          ...current,
                          matchesPerAttendee: Number(eventInput.target.value)
                        }))
                      }
                      className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm focus:border-reef"
                    >
                      {[1, 2, 3, 4, 5].map((count) => (
                        <option key={count} value={count}>
                          {count} match{count === 1 ? '' : 'es'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-sand disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save settings'}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!settings.enabled || generating}
                    className="rounded-full border border-reef/25 bg-reef/5 px-5 py-2.5 text-sm font-semibold text-reef disabled:opacity-60"
                  >
                    {generating ? 'Generating...' : 'Generate introductions'}
                  </button>
                </div>
              </section>

              <section className="rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Recent matches</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Who got introduced</h3>
                  </div>
                  <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                    {stats?.recentMatches?.length || 0} showing
                  </span>
                </div>

                {!stats?.recentMatches?.length ? (
                  <div className="mt-5 rounded-[24px] bg-sand/50 px-5 py-10 text-center">
                    <p className="text-sm text-ink/50">No networking matches yet.</p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {stats.recentMatches.map((match) => (
                      <article key={match.matchId} className="rounded-[24px] border border-ink/10 bg-sand/55 p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-reef/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-reef">
                            Score {match.score}
                          </span>
                          {match.introEmailSentAt && (
                            <span className="rounded-full bg-dusk/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-dusk">
                              Intro sent
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-sm text-ink/65">
                          {(match.participants || []).map((participant) => (
                            <span key={participant.userId} className="rounded-full border border-ink/10 bg-white px-3 py-1.5">
                              {participant.displayName || participant.email}
                            </span>
                          ))}
                        </div>
                        {match.sharedInterests?.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {match.sharedInterests.map((interest) => (
                              <span
                                key={interest}
                                className="rounded-full border border-reef/15 bg-reef/5 px-3 py-1 text-xs font-medium capitalize text-reef"
                              >
                                {interest}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="mt-3 text-sm text-ink/60">{match.summary}</p>
                      </article>
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

export default NetworkingManagerModal;
