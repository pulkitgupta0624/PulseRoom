import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../lib/api';
import {
  fetchNotifications,
  markNotificationRead
} from '../features/notifications/notificationsSlice';
import { downloadAgendaCalendar } from '../lib/downloads';
import { formatDate } from '../lib/formatters';

const PROMOTION_NOTIFICATION_TYPE = 'agenda.session_waitlist_promoted';

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

const STATUS_META = {
  registered: {
    label: 'Seat reserved',
    className: 'bg-reef/10 text-reef'
  },
  waitlisted: {
    label: 'Waitlisted',
    className: 'bg-dusk/10 text-dusk'
  },
  saved: {
    label: 'Saved',
    className: 'bg-sand text-ink/60'
  }
};

const hasCapacityConfigured = (session) =>
  session?.hasCapacity === true ||
  Number.isInteger(Number(session?.capacity)) && Number(session?.capacity) > 0;

const Metric = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[20px] border border-ink/10 bg-white px-4 py-3">
    <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">{label}</p>
    <p className={`mt-2 text-lg font-semibold ${accent}`}>{value}</p>
  </div>
);

const StatusPill = ({ status }) => {
  const meta = STATUS_META[status];
  if (!meta) {
    return null;
  }

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
};

const getCapacityCopy = (session) => {
  if (!hasCapacityConfigured(session)) {
    return 'Open registration';
  }

  if (session.isFull) {
    const waitlistCopy = session.waitlistedCount
      ? ` / ${session.waitlistedCount} waiting`
      : '';
    return `${session.registeredCount}/${session.capacity} reserved${waitlistCopy}`;
  }

  if (session.remainingSeats === null || session.remainingSeats === undefined) {
    return `${session.capacity} seats`;
  }

  return `${session.remainingSeats} of ${session.capacity} seats left`;
};

const getRegistrationAction = (session) => {
  if (!session) {
    return null;
  }

  if (session.isRegistered) {
    return {
      action: 'cancel-registration',
      label: 'Cancel seat',
      className: 'border border-reef/20 bg-white text-reef'
    };
  }

  if (session.isWaitlisted) {
    return {
      action: 'leave-waitlist',
      label: 'Leave waitlist',
      className: 'border border-dusk/20 bg-white text-dusk'
    };
  }

  if (session.isFull && session.hasCapacity) {
    return {
      action: 'join-waitlist',
      label: 'Join waitlist',
      className: 'bg-dusk text-white'
    };
  }

  return {
    action: 'register',
    label: session.hasCapacity ? 'Reserve seat' : 'Register session',
    className: 'bg-reef text-white'
  };
};

const getBookmarkAction = (session) => {
  if (!session) {
    return null;
  }

  if (session.isRegistered || session.isWaitlisted) {
    return null;
  }

  if (session.saved) {
    return {
      action: 'remove',
      label: 'Remove bookmark'
    };
  }

  return {
    action: 'save',
    label: 'Save session'
  };
};

const buildSessionPromotionMap = (notifications = [], eventId) =>
  (Array.isArray(notifications) ? notifications : []).reduce((accumulator, item) => {
    if (
      item?.type !== PROMOTION_NOTIFICATION_TYPE ||
      String(item?.eventId || '') !== String(eventId || '') ||
      item?.readAt
    ) {
      return accumulator;
    }

    const sessionKey = String(item?.metadata?.sessionKey || '').trim();
    if (sessionKey && !accumulator.has(sessionKey)) {
      accumulator.set(sessionKey, item);
    }

    return accumulator;
  }, new Map());

const PersonalAgendaPanel = ({
  eventId,
  eventTitle,
  fallbackSessions = [],
  headline = null,
  description = null
}) => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const notifications = useSelector((state) => state.notifications.list);
  const [loading, setLoading] = useState(Boolean(user));
  const [savingKey, setSavingKey] = useState(null);
  const [dismissingPromotionId, setDismissingPromotionId] = useState(null);
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
    registeredCount: 0,
    waitlistedCount: 0,
    totalMinutes: 0,
    conflictCount: 0,
    staleSessions: 0
  };
  const canPersonalize = Boolean(agendaData?.canPersonalize);
  const promotionBySessionKey = useMemo(
    () => buildSessionPromotionMap(notifications, eventId),
    [eventId, notifications]
  );
  const featuredPromotion = promotionBySessionKey.values().next().value || null;

  const handleSessionAction = async (sessionKey, action) => {
    if (!canPersonalize || !sessionKey || !action) {
      return;
    }

    setSavingKey(sessionKey);
    setError(null);

    try {
      const response = await api.post(`/api/bookings/event/${eventId}/agenda`, {
        sessionKey,
        action
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

  const handleDismissPromotion = async (notificationId) => {
    if (!notificationId) {
      return;
    }

    setDismissingPromotionId(notificationId);
    setError(null);

    try {
      await dispatch(markNotificationRead(notificationId)).unwrap();
    } catch (dismissError) {
      setError(dismissError || 'Unable to dismiss this session update right now.');
    } finally {
      setDismissingPromotionId(null);
    }
  };

  useEffect(() => {
    if (user && canPersonalize) {
      dispatch(fetchNotifications());
    }
  }, [canPersonalize, dispatch, user]);

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
            to reserve session seats, join waitlists, and build a personal run of show.
          </p>
        </div>
      )}

      {!loading && !user && (
        <div className="rounded-[24px] border border-ink/10 bg-sand/50 px-4 py-4 text-sm text-ink/65">
          <Link to="/auth" className="font-semibold text-reef hover:underline">Sign in</Link> and confirm a ticket to
          reserve session seats, track conflicts, and export saved sessions to calendar.
        </div>
      )}

      {!loading && canPersonalize && (
        <>
          {featuredPromotion && (
            <section className="rounded-[24px] border border-reef/20 bg-reef/5 p-4 shadow-bloom">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-reef">Seat unlocked</p>
                  <p className="mt-2 text-sm font-semibold text-ink">{featuredPromotion.title}</p>
                  <p className="mt-1 text-sm text-ink/65">{featuredPromotion.body}</p>
                  {promotionBySessionKey.size > 1 && (
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-ink/45">
                      {promotionBySessionKey.size - 1} more promoted session update
                      {promotionBySessionKey.size > 2 ? 's' : ''} waiting below
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDismissPromotion(featuredPromotion._id)}
                  disabled={dismissingPromotionId === featuredPromotion._id}
                  className="rounded-full border border-reef/20 bg-white px-4 py-2 text-sm font-semibold text-reef transition hover:bg-sand disabled:opacity-60"
                >
                  {dismissingPromotionId === featuredPromotion._id ? 'Saving...' : 'Dismiss'}
                </button>
              </div>
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Saved Sessions" value={summary.savedCount || 0} accent="text-reef" />
            <Metric label="Reserved Seats" value={summary.registeredCount || 0} accent="text-dusk" />
            <Metric label="Waitlist" value={summary.waitlistedCount || 0} accent="text-ember" />
            <Metric label="Time Planned" value={formatDuration(summary.totalMinutes || 0)} />
            <Metric label="Conflicts" value={summary.conflictCount || 0} accent="text-ember" />
          </section>

          {savedSessions.length > 0 ? (
            <section className="rounded-[24px] border border-ink/10 bg-white/80 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-ink/45">My run of show</p>
                  <p className="mt-1 text-sm text-ink/60">
                    Your saved and reserved sessions for this event, in time order.
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
                {savedSessions.map((session) => {
                  const registrationAction = getRegistrationAction(session);
                  const bookmarkAction = getBookmarkAction(session);

                  return (
                    <article
                      key={`saved-${session.sessionKey}`}
                      id={`saved-session-${session.sessionKey}`}
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
                            {session.registrationStatus && (
                              <StatusPill status={session.registrationStatus} />
                            )}
                            {promotionBySessionKey.has(session.sessionKey) && (
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-reef shadow-sm">
                                Promoted from waitlist
                              </span>
                            )}
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
                            <span>| {getCapacityCopy(session)}</span>
                          </div>
                        </div>

                        {session.isCurrentSchedule !== false && (
                          <div className="flex flex-wrap gap-2">
                            {registrationAction && (
                              <button
                                type="button"
                                onClick={() => handleSessionAction(session.sessionKey, registrationAction.action)}
                                disabled={savingKey === session.sessionKey}
                                className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${registrationAction.className}`}
                              >
                                {savingKey === session.sessionKey ? 'Updating...' : registrationAction.label}
                              </button>
                            )}
                            {bookmarkAction && (
                              <button
                                type="button"
                                onClick={() => handleSessionAction(session.sessionKey, bookmarkAction.action)}
                                disabled={savingKey === session.sessionKey}
                                className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sand disabled:opacity-60"
                              >
                                {savingKey === session.sessionKey ? 'Updating...' : bookmarkAction.label}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="rounded-[24px] border border-ink/10 bg-sand/50 px-4 py-4 text-sm text-ink/60">
              Save sessions from the full schedule below, then reserve seats for the ones you do not want to miss.
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
                ? 'Reserve seats, join waitlists when rooms fill up, and keep your agenda tight.'
                : 'Browse the event schedule and see which sessions still have room.'}
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
          scheduleSessions.map((session, index) => {
            const registrationAction = canPersonalize ? getRegistrationAction(session) : null;
            const bookmarkAction = canPersonalize ? getBookmarkAction(session) : null;

            return (
              <article key={session.sessionKey || `${session.title}-${index}`} className="rounded-[22px] bg-sand p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{session.title}</p>
                      {session.registrationStatus && (
                        <StatusPill status={session.registrationStatus} />
                      )}
                      {promotionBySessionKey.has(session.sessionKey) && (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-reef shadow-sm">
                          Promoted from waitlist
                        </span>
                      )}
                      {hasCapacityConfigured(session) && (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          session.isFull ? 'bg-dusk/10 text-dusk' : 'bg-white text-ink/65'
                        }`}>
                          {getCapacityCopy(session)}
                        </span>
                      )}
                    </div>
                    {session.description && <p className="mt-1.5 text-sm text-ink/70">{session.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.15em] text-ink/45">
                      <span>{formatDate(session.startsAt)}</span>
                      {session.roomLabel && <span>| {session.roomLabel}</span>}
                      {session.speakerNames?.length > 0 && <span>| {session.speakerNames.join(', ')}</span>}
                      {!hasCapacityConfigured(session) && (
                        <span>| {getCapacityCopy(session)}</span>
                      )}
                    </div>
                  </div>

                  {canPersonalize && session.sessionKey && (
                    <div className="flex flex-wrap gap-2">
                      {registrationAction && (
                        <button
                          type="button"
                          onClick={() => handleSessionAction(session.sessionKey, registrationAction.action)}
                          disabled={savingKey === session.sessionKey}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${registrationAction.className}`}
                        >
                          {savingKey === session.sessionKey ? 'Updating...' : registrationAction.label}
                        </button>
                      )}
                      {bookmarkAction && (
                        <button
                          type="button"
                          onClick={() => handleSessionAction(session.sessionKey, bookmarkAction.action)}
                          disabled={savingKey === session.sessionKey}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                            session.saved
                              ? 'border border-reef/20 bg-white text-reef'
                              : 'border border-ink/10 bg-white text-ink'
                          }`}
                        >
                          {savingKey === session.sessionKey
                            ? 'Updating...'
                            : bookmarkAction.label}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
};

export default PersonalAgendaPanel;
