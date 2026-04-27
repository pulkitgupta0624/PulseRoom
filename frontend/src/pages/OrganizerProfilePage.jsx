/**
 * OrganizerProfilePage  — /organizers/:organizerId
 *
 * A public-facing page for any organizer/admin account.  Shows:
 *   • Hero with avatar, name, company, role badge, follower count
 *   • Follow / Unfollow button (signed-in users only)
 *   • Bio, location, social links
 *   • Their published events grid (fetched from /api/events?organizerId=…)
 *
 * Accessible without a login so anyone can discover an organizer.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import EventCard from '../components/EventCard';
import SectionHeader from '../components/SectionHeader';
import { syncFollowState } from '../features/user/userSlice';
import { api } from '../lib/api';

// ── Small reusable stat tile ──────────────────────────────────────────────────
const StatTile = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[24px] border border-ink/10 bg-white/80 px-5 py-4 shadow-bloom">
    <p className="text-xs uppercase tracking-[0.22em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

// ── Follow / Unfollow button ──────────────────────────────────────────────────
const FollowButton = ({ profile, onToggle, loading }) => {
  if (!profile) return null;

  if (!profile.canFollowOrganizer) {
    return (
      <Link
        to="/auth"
        className="rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:bg-sand transition"
      >
        Sign in to follow
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      className={`rounded-full px-6 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
        profile.isFollowingOrganizer
          ? 'border border-ink/15 bg-white text-ink hover:bg-ember/5 hover:border-ember/20 hover:text-ember'
          : 'bg-ink text-sand hover:bg-dusk'
      }`}
    >
      {loading
        ? 'Updating…'
        : profile.isFollowingOrganizer
        ? 'Following'
        : 'Follow organizer'}
    </button>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const OrganizerProfilePage = () => {
  const { organizerId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  const [profile, setProfile]       = useState(null);
  const [events, setEvents]         = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingEvents, setLoadingEvents]   = useState(true);
  const [followLoading, setFollowLoading]   = useState(false);
  const [toast, setToast]           = useState(null);   // { tone, message }

  // ── Load organizer profile ────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    setLoadingProfile(true);

    api.get(`/api/users/profile/${organizerId}`)
      .then((res) => {
        if (!active) return;
        const data = res.data.data;
        // Guard: only organizers & admins have followable profiles
        if (!['organizer', 'admin'].includes(data.role)) {
          navigate('/');   // redirect non-organizer profiles
          return;
        }
        setProfile(data);
      })
      .catch(() => {
        if (active) navigate('/');
      })
      .finally(() => { if (active) setLoadingProfile(false); });

    return () => { active = false; };
  }, [organizerId, navigate]);

  // ── Load organizer's published events ────────────────────────────────────
  useEffect(() => {
    let active = true;
    setLoadingEvents(true);

    api.get('/api/events', {
      params: { organizerId, status: 'published', limit: 20 }
    })
      .then((res) => {
        if (!active) return;
        const payload = res.data.data;
        setEvents(Array.isArray(payload) ? payload : (payload.items || []));
      })
      .catch(() => { if (active) setEvents([]); })
      .finally(() => { if (active) setLoadingEvents(false); });

    return () => { active = false; };
  }, [organizerId]);

  // ── Follow / Unfollow ─────────────────────────────────────────────────────
  const handleFollowToggle = useCallback(async () => {
    if (!user || !profile?.canFollowOrganizer) return;

    setFollowLoading(true);
    setToast(null);

    try {
      const response = profile.isFollowingOrganizer
        ? await api.delete(`/api/users/organizers/${organizerId}/follow`)
        : await api.post(`/api/users/organizers/${organizerId}/follow`);

      const { isFollowing, followersCount } = response.data.data;

      // Update local state
      setProfile((prev) =>
        prev
          ? { ...prev, isFollowingOrganizer: isFollowing, followersCount }
          : prev
      );

      // Sync Redux so ProfilePage "Following" tab stays in sync
      dispatch(syncFollowState({ organizerId, isFollowing, organizerProfile: profile }));

      setToast({
        tone: 'success',
        message: isFollowing
          ? 'You will be notified when this organizer drops new events.'
          : 'You will no longer receive updates from this organizer.'
      });
    } catch (err) {
      setToast({
        tone: 'error',
        message: err.response?.data?.message || 'Unable to update follow status.'
      });
    } finally {
      setFollowLoading(false);
    }
  }, [profile, organizerId, user, dispatch]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loadingProfile) {
    return (
      <div className="space-y-6">
        <div className="h-64 animate-pulse rounded-[36px] bg-white/60" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-[24px] bg-white/60" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-[28px] bg-white/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const initials = profile.displayName?.[0]?.toUpperCase() || '?';
  const companyName = profile.organizerProfile?.companyName || profile.displayName;
  const publishedCount = events.length;

  return (
    <div className="space-y-10">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[36px] border border-ink/10 bg-white/80 shadow-bloom">
        {/* Gradient banner */}
        <div className="h-36 bg-gradient-to-br from-dusk via-reef to-ink" />

        <div className="px-6 pb-8 md:px-10">
          {/* Avatar — positioned to overlap the banner */}
          <div className="-mt-14 mb-5 flex items-end justify-between gap-4">
            <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-reef/40 to-dusk/40 shadow-bloom flex-shrink-0 flex items-center justify-center">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  className="h-full w-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <span className="font-display text-3xl text-ink">{initials}</span>
              )}
            </div>

            {/* Follow button — top-right of avatar row */}
            <div className="mb-2 flex items-center gap-3 flex-wrap">
              <FollowButton
                profile={profile}
                onToggle={handleFollowToggle}
                loading={followLoading}
              />
            </div>
          </div>

          {/* Name + badges */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h1 className="font-display text-3xl text-ink md:text-4xl">{companyName}</h1>
            <span className="rounded-full bg-reef/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-reef">
              {profile.role}
            </span>
            {profile.verifiedOrganizer && (
              <span className="rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ember">
                Verified
              </span>
            )}
          </div>

          {/* Bio */}
          {profile.bio && (
            <p className="max-w-2xl text-base text-ink/70 mb-4">{profile.bio}</p>
          )}

          {/* Location + social links */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink/55">
            {profile.location && (
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-ink/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {profile.location}
              </span>
            )}
            {profile.organizerProfile?.supportEmail && (
              <a
                href={`mailto:${profile.organizerProfile.supportEmail}`}
                className="rounded-full border border-ink/10 bg-sand/60 px-3 py-1 text-xs hover:bg-white transition"
              >
                {profile.organizerProfile.supportEmail}
              </a>
            )}
            {(profile.organizerProfile?.website || profile.socialLinks?.website) && (
              <a
                href={profile.organizerProfile?.website || profile.socialLinks.website}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-ink/10 bg-sand/60 px-3 py-1 text-xs hover:bg-white transition"
              >
                Visit website
              </a>
            )}
            {profile.socialLinks?.linkedin && (
              <a href={profile.socialLinks.linkedin} target="_blank" rel="noopener noreferrer"
                className="rounded-full border border-ink/10 bg-sand/60 px-3 py-1 text-xs hover:bg-white transition">
                LinkedIn
              </a>
            )}
            {profile.socialLinks?.twitter && (
              <a href={profile.socialLinks.twitter} target="_blank" rel="noopener noreferrer"
                className="rounded-full border border-ink/10 bg-sand/60 px-3 py-1 text-xs hover:bg-white transition">
                X / Twitter
              </a>
            )}
          </div>

          {/* Toast feedback */}
          {toast && (
            <p className={`mt-4 max-w-lg rounded-2xl px-4 py-3 text-sm ${
              toast.tone === 'success' ? 'bg-reef/10 text-reef' : 'bg-ember/10 text-ember'
            }`}>
              {toast.message}
            </p>
          )}
        </div>
      </section>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <section className="grid gap-4 md:grid-cols-3">
        <StatTile
          label="Followers"
          value={profile.followersCount || 0}
          accent="text-reef"
        />
        <StatTile
          label="Published Events"
          value={loadingEvents ? '…' : publishedCount}
          accent="text-dusk"
        />
        <StatTile
          label="Total Attendees"
          value={loadingEvents ? '…' : events.reduce((s, e) => s + (e.attendeesCount || 0), 0)}
          accent="text-ember"
        />
      </section>

      {/* ── Events grid ──────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <SectionHeader
          eyebrow="Events"
          title={`By ${companyName}`}
          description="Browse all published events from this organizer."
        />

        {loadingEvents && (
          <div className="grid gap-5 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-[28px] bg-white/60" />
            ))}
          </div>
        )}

        {!loadingEvents && events.length === 0 && (
          <div className="rounded-[28px] border border-ink/10 bg-white/70 px-6 py-14 text-center shadow-bloom">
            <p className="font-display text-2xl text-ink">No published events yet</p>
            <p className="mt-3 text-sm text-ink/55">
              Follow this organizer to get notified when they drop a new event.
            </p>
          </div>
        )}

        {!loadingEvents && events.length > 0 && (
          <div className="grid gap-5 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event._id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default OrganizerProfilePage;