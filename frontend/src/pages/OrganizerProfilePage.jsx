import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import EventCard from '../components/EventCard';
import SectionHeader from '../components/SectionHeader';
import { deriveOrganizerFollowState } from '../features/user/organizerFollowState';
import { syncFollowState } from '../features/user/userSlice';
import { api } from '../lib/api';
import { buildOrganizerBrandTheme, getOrganizerPublicPath } from '../lib/organizerBranding';

const StatTile = ({ label, value, accent = 'text-ink', className = '' }) => (
  <div className={`rounded-[24px] border border-[color:var(--organizer-outline)] bg-white/82 px-5 py-4 shadow-bloom ${className}`}>
    <p className="text-xs uppercase tracking-[0.22em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

const FollowButton = ({
  canFollowOrganizer,
  shouldPromptSignIn,
  isFollowingOrganizer,
  onToggle,
  loading,
  invert = false
}) => {
  if (canFollowOrganizer) {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={loading}
        className={`rounded-full px-6 py-3 text-sm font-semibold transition disabled:opacity-60 ${
          isFollowingOrganizer
            ? 'border border-white/18 bg-white/14 text-white hover:bg-white/20'
            : invert
              ? 'bg-ink text-sand hover:bg-dusk'
              : 'bg-white text-ink hover:bg-sand'
        }`}
      >
        {loading ? 'Updating...' : isFollowingOrganizer ? 'Following' : 'Follow organizer'}
      </button>
    );
  }

  if (shouldPromptSignIn) {
    return (
      <Link
        to="/auth"
        className="rounded-full border border-white/18 bg-white/12 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/18"
      >
        Sign in to follow
      </Link>
    );
  }

  return null;
};

const OrganizerProfilePage = () => {
  const { organizerId, publicHandle } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  const [profile, setProfile] = useState(null);
  const [resolvedOrganizerId, setResolvedOrganizerId] = useState('');
  const [rewards, setRewards] = useState(null);
  const [events, setEvents] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let active = true;
    setLoadingProfile(true);

    const request = publicHandle
      ? api.get(`/api/users/organizers/handle/${publicHandle}`)
      : api.get(`/api/users/profile/${organizerId}`);

    request
      .then((res) => {
        if (!active) {
          return;
        }

        const data = res.data.data;
        if (!['organizer', 'admin'].includes(data.role)) {
          navigate('/');
          return;
        }

        if (!publicHandle) {
          const canonicalPublicPath = getOrganizerPublicPath(data, data.userId || organizerId || '');
          if (canonicalPublicPath.startsWith('/studio/')) {
            navigate(canonicalPublicPath, { replace: true });
            return;
          }
        }

        setProfile(data);
        setResolvedOrganizerId(data.userId || organizerId || '');
      })
      .catch(() => {
        if (active) {
          navigate('/');
        }
      })
      .finally(() => {
        if (active) {
          setLoadingProfile(false);
        }
      });

    return () => {
      active = false;
    };
  }, [navigate, organizerId, publicHandle]);

  useEffect(() => {
    if (!resolvedOrganizerId) {
      return undefined;
    }

    let active = true;
    setLoadingEvents(true);

    api.get('/api/events', {
      params: {
        organizerId: resolvedOrganizerId,
        limit: 24
      }
    })
      .then((res) => {
        if (!active) {
          return;
        }

        const payload = res.data.data;
        setEvents(Array.isArray(payload) ? payload : payload.items || []);
      })
      .catch(() => {
        if (active) {
          setEvents([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoadingEvents(false);
        }
      });

    return () => {
      active = false;
    };
  }, [resolvedOrganizerId]);

  useEffect(() => {
    if (!resolvedOrganizerId) {
      return undefined;
    }

    let active = true;

    api.get(`/api/gamification/users/${resolvedOrganizerId}/public`)
      .then((res) => {
        if (active) {
          setRewards(res.data.data);
        }
      })
      .catch(() => {
        if (active) {
          setRewards(null);
        }
      });

    return () => {
      active = false;
    };
  }, [resolvedOrganizerId]);

  const followState = deriveOrganizerFollowState({
    organizerProfile: profile,
    organizerId: resolvedOrganizerId,
    viewerUser: user
  });

  const handleFollowToggle = useCallback(async () => {
    if (!user || !followState.canFollowOrganizer || !profile || !resolvedOrganizerId) {
      return;
    }

    setFollowLoading(true);
    setToast(null);

    try {
      const response = profile.isFollowingOrganizer
        ? await api.delete(`/api/users/organizers/${resolvedOrganizerId}/follow`)
        : await api.post(`/api/users/organizers/${resolvedOrganizerId}/follow`);

      const { followersCount, isFollowing } = response.data.data;
      const nextProfile = {
        ...profile,
        followersCount,
        isFollowingOrganizer: isFollowing
      };

      setProfile(nextProfile);
      dispatch(syncFollowState({ organizerId: resolvedOrganizerId, isFollowing, organizerProfile: nextProfile }));
      setToast({
        tone: 'success',
        message: isFollowing
          ? 'You will be notified when this organizer drops new events.'
          : 'You will no longer receive updates from this organizer.'
      });
    } catch (error) {
      setToast({
        tone: 'error',
        message: error.response?.data?.message || 'Unable to update follow status.'
      });
    } finally {
      setFollowLoading(false);
    }
  }, [dispatch, followState.canFollowOrganizer, profile, resolvedOrganizerId, user]);

  const brandTheme = useMemo(
    () => buildOrganizerBrandTheme(profile?.organizerProfile?.branding || {}),
    [profile?.organizerProfile?.branding]
  );

  if (loadingProfile) {
    return (
      <div className="space-y-6">
        <div className="h-72 animate-pulse rounded-[36px] bg-white/60" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-[24px] bg-white/60" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-[28px] bg-white/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const branding = brandTheme.branding;
  const initials = profile.displayName?.[0]?.toUpperCase() || '?';
  const companyName = profile.organizerProfile?.companyName || profile.displayName;
  const totalAttendees = events.reduce((sum, event) => sum + Number(event.attendeesCount || 0), 0);
  const rewardBadges = rewards?.badges || [];
  const shouldShowRewards = rewardBadges.length > 0 || Number(rewards?.totalPoints || 0) > 0;
  const heroTitle = branding.heroTitle || companyName;
  const heroSubtitle =
    branding.heroSubtitle ||
    profile.bio ||
    'Follow this organizer to stay on top of new drops, returning series, and the next premium room they open.';
  const primaryCtaUrl =
    branding.ctaUrl ||
    profile.organizerProfile?.website ||
    profile.socialLinks?.website ||
    '';
  const primaryCtaLabel = branding.ctaLabel || (primaryCtaUrl ? 'Visit website' : '');
  const publicHubPath = getOrganizerPublicPath(profile, resolvedOrganizerId);

  return (
    <div className="space-y-10" style={brandTheme.styles}>
      <section
        className="overflow-hidden rounded-[36px] border border-[color:var(--organizer-outline)] shadow-bloom"
        style={{
          background: brandTheme.heroBackground
        }}
      >
        <div
          className="relative"
          style={{
            backgroundImage: branding.coverImageUrl
              ? `linear-gradient(135deg, rgba(18,18,18,0.38), rgba(18,18,18,0.2)), url(${branding.coverImageUrl})`
              : undefined,
            backgroundPosition: 'center',
            backgroundSize: 'cover'
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_35%)]" />
          <div className="relative grid gap-8 px-6 py-10 text-[color:var(--organizer-hero-text)] md:px-10 lg:grid-cols-[1.25fr,0.75fr]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                {branding.publicHandle ? (
                  <span className="rounded-full border border-white/18 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em]">
                    /studio/{branding.publicHandle}
                  </span>
                ) : null}
                <span className="rounded-full border border-white/18 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.22em]">
                  {profile.role}
                </span>
                {profile.verifiedOrganizer ? (
                  <span className="rounded-full border border-white/18 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.22em]">
                    Verified
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-start gap-4">
                {branding.logoUrl ? (
                  <img
                    src={branding.logoUrl}
                    alt={`${companyName} logo`}
                    className="h-20 w-20 rounded-[24px] border border-white/20 bg-white/10 object-cover p-1"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                ) : null}
                <div className="space-y-3">
                  <h1
                    className="max-w-4xl text-4xl leading-tight md:text-5xl"
                    style={{ fontFamily: 'var(--organizer-heading-font)' }}
                  >
                    {heroTitle}
                  </h1>
                  <p
                    className="max-w-3xl text-sm text-white/80 md:text-base"
                    style={{ fontFamily: 'var(--organizer-body-font)' }}
                  >
                    {heroSubtitle}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-white/78">
                {profile.location ? <span>{profile.location}</span> : null}
                {profile.organizerProfile?.supportEmail ? (
                  <a href={`mailto:${profile.organizerProfile.supportEmail}`} className="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-xs transition hover:bg-white/14">
                    {profile.organizerProfile.supportEmail}
                  </a>
                ) : null}
                {profile.socialLinks?.linkedin ? (
                  <a
                    href={profile.socialLinks.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-xs transition hover:bg-white/14"
                  >
                    LinkedIn
                  </a>
                ) : null}
                {profile.socialLinks?.twitter ? (
                  <a
                    href={profile.socialLinks.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-xs transition hover:bg-white/14"
                  >
                    X / Twitter
                  </a>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <FollowButton
                  canFollowOrganizer={followState.canFollowOrganizer}
                  shouldPromptSignIn={followState.shouldPromptSignIn}
                  isFollowingOrganizer={Boolean(profile.isFollowingOrganizer)}
                  onToggle={handleFollowToggle}
                  loading={followLoading}
                />
                {primaryCtaUrl && primaryCtaLabel ? (
                  <a
                    href={primaryCtaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-white/18 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/18"
                  >
                    {primaryCtaLabel}
                  </a>
                ) : null}
              </div>

              {toast ? (
                <p
                  className={`max-w-lg rounded-2xl px-4 py-3 text-sm ${
                    toast.tone === 'success'
                      ? 'bg-white/14 text-white'
                      : 'bg-amber-100/90 text-amber-900'
                  }`}
                >
                  {toast.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-4 rounded-[28px] border border-white/14 bg-white/10 p-5 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white/18 bg-white/12 shadow-bloom">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="font-display text-3xl text-white">{initials}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/64">Organizer</p>
                  <p className="mt-2 font-display text-2xl text-white">{companyName}</p>
                  <Link to={publicHubPath} className="mt-2 inline-flex text-xs text-white/80 underline-offset-4 hover:underline">
                    Share this studio
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/58">Followers</p>
                  <p className="mt-2 font-display text-3xl text-white">{profile.followersCount || 0}</p>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/58">Published</p>
                  <p className="mt-2 font-display text-3xl text-white">{loadingEvents ? '...' : events.length}</p>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-4 sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/58">Audience reached</p>
                  <p className="mt-2 font-display text-3xl text-white">{loadingEvents ? '...' : totalAttendees}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatTile label="Followers" value={profile.followersCount || 0} accent="text-[color:var(--organizer-primary)]" />
        <StatTile label="Published Events" value={loadingEvents ? '...' : events.length} accent="text-[color:var(--organizer-accent)]" />
        <StatTile label="Total Attendees" value={loadingEvents ? '...' : totalAttendees} accent="text-dusk" />
      </section>

      {shouldShowRewards ? (
        <section className="rounded-[32px] border border-[color:var(--organizer-outline)] bg-white/82 p-6 shadow-bloom">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--organizer-primary)]">Community profile</p>
              <h2 className="mt-2 font-display text-3xl text-ink">Badges and points</h2>
              <p className="mt-2 text-sm text-ink/60">
                PulseRoom rewards attendees for turning up early, contributing to Q&amp;A, leaving reviews, and staying active in the community.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[380px]">
              <StatTile label="Points" value={rewards.totalPoints || 0} accent="text-[color:var(--organizer-accent)]" />
              <StatTile label="Level" value={rewards.level?.label || 'Starter'} accent="text-[color:var(--organizer-primary)]" />
              <StatTile label="Badges" value={rewardBadges.length} accent="text-dusk" />
            </div>
          </div>

          {rewardBadges.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {rewardBadges.map((badge) => (
                <div
                  key={badge.key}
                  className="rounded-full px-4 py-2 text-sm font-medium text-ink"
                  style={{
                    background: 'var(--organizer-primary-soft)',
                    border: '1px solid var(--organizer-outline)'
                  }}
                >
                  {badge.name}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-6">
        <SectionHeader
          eyebrow="Events"
          title={`Inside ${companyName}`}
          description="Browse the live and upcoming public events released under this organizer brand."
        />

        {loadingEvents ? (
          <div className="grid gap-5 lg:grid-cols-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-[28px] bg-white/60" />
            ))}
          </div>
        ) : null}

        {!loadingEvents && events.length === 0 ? (
          <div className="rounded-[28px] border border-[color:var(--organizer-outline)] bg-white/76 px-6 py-14 text-center shadow-bloom">
            <p className="font-display text-2xl text-ink">No published events yet</p>
            <p className="mt-3 text-sm text-ink/55">
              Follow this organizer to get notified when they drop a new room.
            </p>
          </div>
        ) : null}

        {!loadingEvents && events.length > 0 ? (
          <div className="grid gap-5 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event._id} event={event} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default OrganizerProfilePage;
