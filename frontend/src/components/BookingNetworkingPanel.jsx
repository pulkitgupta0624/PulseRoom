import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';

const BookingNetworkingPanel = ({ booking }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get(`/api/events/${booking.eventId}/networking/me`);
        if (active) {
          setData(response.data.data);
        }
      } catch (loadError) {
        if (active) {
          const message = loadError.response?.data?.message;
          if (loadError.response?.status === 404) {
            setData(null);
          } else {
            setError(message || 'Unable to load networking status.');
          }
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadData();
    return () => {
      active = false;
    };
  }, [booking.eventId]);

  const handleToggle = async (optedIn) => {
    setSaving(true);
    setError(null);

    try {
      const response = await api.post(`/api/events/${booking.eventId}/networking/me`, {
        optedIn
      });
      setData(response.data.data);
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to update networking preference.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[24px] border border-ink/10 bg-sand/50 px-4 py-4">
        <p className="text-sm text-ink/45">Loading networking options...</p>
      </div>
    );
  }

  if (!data?.settings?.enabled && !data?.optedIn) {
    return null;
  }

  return (
    <div className="rounded-[24px] border border-reef/15 bg-reef/5 px-4 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-reef">Pre-event networking</p>
          <p className="mt-1 text-sm text-ink/70">
            Opt in to get matched with attendees who share your interests before{' '}
            <span className="font-semibold text-ink">{booking.eventSnapshot?.title}</span>.
          </p>
          {data?.settings?.lastMatchedAt && (
            <p className="mt-2 text-xs text-ink/45">
              Last introductions sent {formatDate(data.settings.lastMatchedAt)}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => handleToggle(!data?.optedIn)}
          disabled={saving}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
            data?.optedIn
              ? 'border border-reef/25 bg-white text-reef'
              : 'bg-reef text-white'
          }`}
        >
          {saving ? 'Saving...' : data?.optedIn ? 'Opt out' : 'Opt in'}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
      )}

      {data?.optedIn && (!data.matches || data.matches.length === 0) && (
        <p className="mt-3 rounded-2xl bg-white/70 px-4 py-3 text-sm text-ink/60">
          You are in the pool. We will email you when a strong match is ready.
        </p>
      )}

      {data?.matches?.length > 0 && (
        <div className="mt-4 space-y-3">
          {data.matches.map((match) => (
            <article key={match.matchId} className="rounded-[20px] border border-reef/10 bg-white/75 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-semibold text-ink">{match.counterpart?.displayName || 'Your match'}</p>
                  {match.counterpart?.location && (
                    <p className="mt-1 text-xs text-ink/45">{match.counterpart.location}</p>
                  )}
                  <p className="mt-2 text-sm text-ink/65">{match.summary}</p>
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
                </div>

                {match.counterpart?.userId && (
                  <Link
                    to={`/messages/${match.counterpart.userId}`}
                    className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand"
                  >
                    Send message
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default BookingNetworkingPanel;
