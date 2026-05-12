import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { api } from '../lib/api';
import { downloadAgendaCalendar } from '../lib/downloads';
import { formatDate } from '../lib/formatters';

const formatDuration = (minutes = 0) => {
  if (!minutes) {
    return '0h';
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) {
    return `${remainder}m`;
  }

  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const sortSessions = (sessions = []) =>
  [...sessions].sort((left, right) => new Date(left.startsAt || 0) - new Date(right.startsAt || 0));

const Metric = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[20px] border border-ink/10 bg-white px-4 py-3">
    <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">{label}</p>
    <p className={`mt-2 text-lg font-semibold ${accent}`}>{value}</p>
  </div>
);

const PersonalAgendaPanel = ({
  eventId,
  eventTitle,
  fallbackSessions = [],
  headline = null,
  description = null
}) => {
  const { user } = useSelector((state) => state.auth);
  const [loading, setLoading] = useState(Boolean(user));
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState(null);
  const [agendaData, setAgendaData] = useState(null);

  useEffect(() => {
    let active = true;

    if (!user) {
      setAgendaData(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const loadAgenda = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get(`/api/bookings/event/${eventId}/agenda`);
        if (active) {
          setAgendaData(response.data.data);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.message || 'Unable to load your agenda right now.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadAgenda();
    return () => {
      active = false;
    };
  }, [eventId, user]);

  const scheduleSessions = useMemo(() => {
    if (agendaData?.sessions?.length) {
      return agendaData.sessions;
    }

    return sortSessions(fallbackSessions);
  }, [agendaData?.sessions, fallbackSessions]);

  const savedSessions = agendaData?.savedSessions || [];
  const summary = agendaData?.summary || {
    savedCount: 0,
    totalMinutes: 0,
    roomCount: 0,
    conflictCount: 0,
    staleSessions: 0
  };
  const canPersonalize = Boolean(agendaData?.canPersonalize);

  const handleToggleSession = async (session) => {
    if (!canPersonalize || !session?.sessionKey) {
      return;
    }

    setSavingKey(session.sessionKey);
    setError(null);

    try {
      const response = await api.post(`/api/bookings/event/${eventId}/agenda`, {
        sessionKey: session.sessionKey,
        saved: !session.saved
      });
      setAgendaData(response.data.data);
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to update your agenda right now.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleExportAgenda = () => {
    downloadAgendaCalendar({
      eventTitle: agendaData?.eventTitle || eventTitle,
      venueName: agendaData?.venueName || '',
      sessions: savedSessions.filter((session) => session.isCurrentSchedule !== false)
    });
  };

  return (
    <div className="space-y-4">
      {(headline || description) && (
        <div>
          {headline && <h3 className="font-display text-2xl text-ink">{headline}</h3>}
          {description && <p className="mt-1 text-sm text-ink/55">{description}</p>}
        </div>
      )}

      {loading && (
        <div className="rounded-[24px] bg-sand/60 px-4 py-4 text-sm text-ink/55">
          Loading your agenda...
        </div>
      )}

      {error && (
        <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
      )}

      {!loading && user && agendaData && !canPersonalize && (
        <div className="rounded-[24px] border border-dusk/15 bg-dusk/5 px-4 py-4">
          <p className="text-sm text-ink/70">
            Confirm a ticket for <span className="font-semibold text-ink">{agendaData.eventTitle || eventTitle}</span>{' '}
            to save sessions into a personal run of show.
          </p>
        </div>
      )}

      {!loading && !user && (
        <div className="rounded-[24px] border border-ink/10 bg-sand/50 px-4 py-4 text-sm text-ink/65">
          <Link to="/auth" className="font-semibold text-reef hover:underline">Sign in</Link> and confirm a ticket to
          build your agenda, track conflicts, and export saved sessions to calendar.
        </div>
      )}

      {!loading && canPersonalize && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Saved Sessions" value={summary.savedCount || 0} accent="text-reef" />
            <Metric label="Time Planned" value={formatDuration(summary.totalMinutes || 0)} accent="text-dusk" />
            <Metric label="Rooms" value={summary.roomCount || 0} />
            <Metric label="Conflicts" value={summary.conflictCount || 0} accent="text-ember" />
          </section>

          {savedSessions.length > 0 ? (
            <section className="rounded-[24px] border border-ink/10 bg-white/80 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-ink/45">My run of show</p>
                  <p className="mt-1 text-sm text-ink/60">
                    Your saved sessions for this event, in time order.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportAgenda}
                  className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white"
                >
                  Export calendar
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {savedSessions.map((session) => (
                  <article
                    key={`saved-${session.sessionKey}`}
                    className={`rounded-[20px] px-4 py-4 ${
                      session.isCurrentSchedule === false
                        ? 'border border-ember/15 bg-ember/5'
                        : 'border border-reef/10 bg-reef/5'
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-ink">{session.title}</p>
                          {session.hasConflict && (
                            <span className="rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
                              Time conflict
                            </span>
                          )}
                          {session.isCurrentSchedule === false && (
                            <span className="rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
                              Schedule changed
                            </span>
                          )}
                        </div>
                        {session.description && (
                          <p className="mt-2 text-sm text-ink/65">{session.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-ink/45">
                          <span>{formatDate(session.startsAt)}</span>
                          {session.roomLabel && <span>| {session.roomLabel}</span>}
                          {session.speakerNames?.length > 0 && <span>| {session.speakerNames.join(', ')}</span>}
                        </div>
                      </div>

                      {session.isCurrentSchedule !== false && (
                        <button
                          type="button"
                          onClick={() => handleToggleSession(session)}
                          disabled={savingKey === session.sessionKey}
                          className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sand disabled:opacity-60"
                        >
                          {savingKey === session.sessionKey ? 'Updating...' : 'Remove'}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-[24px] border border-ink/10 bg-sand/50 px-4 py-4 text-sm text-ink/60">
              Save sessions from the full schedule below to build your personal agenda.
            </div>
          )}
        </>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Schedule</p>
            <p className="mt-1 text-sm text-ink/60">
              {canPersonalize
                ? 'Pin the sessions you want to attend and keep an eye on overlaps.'
                : 'Browse the event schedule and plan your day.'}
            </p>
          </div>
          {canPersonalize && summary.staleSessions > 0 && (
            <span className="rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
              {summary.staleSessions} stale
            </span>
          )}
        </div>

        {!scheduleSessions.length ? (
          <div className="rounded-[24px] bg-sand/50 px-4 py-5 text-sm text-ink/55">
            No sessions scheduled yet.
          </div>
        ) : (
          scheduleSessions.map((session, index) => (
            <article key={session.sessionKey || `${session.title}-${index}`} className="rounded-[22px] bg-sand p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{session.title}</p>
                    {session.saved && (
                      <span className="rounded-full bg-reef/10 px-3 py-1 text-xs font-semibold text-reef">
                        Saved
                      </span>
                    )}
                  </div>
                  {session.description && <p className="mt-1.5 text-sm text-ink/70">{session.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.15em] text-ink/45">
                    <span>{formatDate(session.startsAt)}</span>
                    {session.roomLabel && <span>| {session.roomLabel}</span>}
                    {session.speakerNames?.length > 0 && <span>| {session.speakerNames.join(', ')}</span>}
                  </div>
                </div>

                {canPersonalize && session.sessionKey && (
                  <button
                    type="button"
                    onClick={() => handleToggleSession(session)}
                    disabled={savingKey === session.sessionKey}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                      session.saved
                        ? 'border border-reef/20 bg-white text-reef'
                        : 'bg-reef text-white'
                    }`}
                  >
                    {savingKey === session.sessionKey
                      ? 'Saving...'
                      : session.saved
                        ? 'Saved to agenda'
                        : 'Save session'}
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
};

export default PersonalAgendaPanel;
