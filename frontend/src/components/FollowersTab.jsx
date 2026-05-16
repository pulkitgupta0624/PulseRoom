import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const FollowersTab = ({ organizerId = '', followersCount = 0 }) => {
  const [followers, setFollowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applyFollowersResponse = (response) => {
    setFollowers(response.data.data.followers || []);
    setError(null);
  };

  const handleFollowersError = (loadError) => {
    setFollowers([]);
    setError(loadError.response?.data?.message || 'Unable to load your followers right now.');
  };

  const refreshFollowers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/users/me/followers');
      applyFollowersResponse(response);
    } catch (loadError) {
      handleFollowersError(loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!organizerId) {
      setFollowers([]);
      setLoading(false);
      return;
    }

    let active = true;

    const loadFollowers = async () => {
      setLoading(true);
      try {
        const response = await api.get('/api/users/me/followers');
        if (!active) {
          return;
        }

        applyFollowersResponse(response);
      } catch (loadError) {
        if (!active) {
          return;
        }

        handleFollowersError(loadError);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadFollowers();

    return () => {
      active = false;
    };
  }, [organizerId]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-[28px] bg-white/60" />
        ))}
      </div>
    );
  }

  const visibleFollowersCount = Math.max(Number(followersCount || 0), followers.length);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl text-ink">Followers</h2>
        <p className="mt-2 text-sm text-ink/60">
          People who chose to follow your organizer page. They will be notified whenever you publish a new event.
        </p>
      </div>

      <div className="inline-flex rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/70 shadow-bloom">
        <strong className="mr-2 text-ink">{visibleFollowersCount}</strong> followers
      </div>

      {error ? (
        <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
      ) : null}

      {!error && followers.length === 0 ? (
        <div className="rounded-[32px] border border-ink/10 bg-white/80 px-6 py-14 text-center shadow-bloom">
          <p className="font-display text-2xl text-ink">No followers yet</p>
          <p className="mt-3 text-sm text-ink/55">
            Share your organizer studio and publish events so attendees can discover you and click follow.
          </p>
        </div>
      ) : null}

      {followers.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {followers.map((follower) => {
            const initials = follower.displayName?.[0]?.toUpperCase() || '?';

            return (
              <div
                key={follower.userId}
                className="flex flex-col gap-4 rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink/10 bg-gradient-to-br from-reef/40 to-dusk/40">
                    {follower.avatarUrl ? (
                      <img
                        src={follower.avatarUrl}
                        alt={follower.displayName}
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="font-display text-xl text-ink">{initials}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg text-ink">{follower.displayName}</p>
                    <span className="mt-1 inline-flex rounded-full bg-reef/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-reef">
                      {follower.role}
                    </span>
                  </div>
                </div>

                {follower.bio ? (
                  <p className="line-clamp-2 text-sm text-ink/60">{follower.bio}</p>
                ) : (
                  <p className="text-sm text-ink/45">Following your organizer profile for future drops.</p>
                )}

                <div className="text-xs text-ink/50">
                  {follower.location || 'Location not shared'}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="text-center">
        <button
          type="button"
          onClick={refreshFollowers}
          disabled={loading}
          className="rounded-full border border-ink/10 bg-white px-5 py-2 text-sm text-ink/50 transition hover:text-ink disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh list'}
        </button>
      </div>
    </div>
  );
};

export default FollowersTab;
