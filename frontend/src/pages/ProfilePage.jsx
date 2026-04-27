import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import SectionHeader from '../components/SectionHeader';
import {
  fetchProfile,
  updateProfile,
  clearSaved,
  fetchFollowing,
  syncFollowState
} from '../features/user/userSlice';
import { api } from '../lib/api';

const INTEREST_OPTIONS = [
  'technology', 'ai', 'design', 'finance', 'community', 'startup',
  'marketing', 'product', 'engineering', 'data', 'climate', 'health'
];

// ─── Organizer Verification Request Form ──────────────────────────────────────
const OrganizerVerificationSection = ({ userId }) => {
  const [form, setForm] = useState({ legalName: '', companyName: '', website: '', supportEmail: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const updateField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/users/organizer-verifications', form);
      setSubmitted(true);
    } catch (err) {
      const msg = err.response?.data?.message || 'Submission failed';
      if (msg.toLowerCase().includes('pending')) {
        setSubmitted(true);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-[32px] border border-reef/20 bg-reef/5 p-6 shadow-bloom space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-reef/15 flex items-center justify-center flex-shrink-0">
            <svg className="h-5 w-5 text-reef" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-ink">Verification request submitted</p>
            <p className="text-sm text-ink/60">Our team will review your application and notify you by email.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom space-y-5">
      <div>
        <h2 className="font-display text-2xl text-ink">Become a verified organizer</h2>
        <p className="mt-2 text-sm text-ink/60">
          Submit your details for review. Once approved, you'll be able to create and publish events.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-ink/45">Legal name</label>
            <input
              value={form.legalName}
              onChange={(e) => updateField('legalName', e.target.value)}
              placeholder="Your full legal name"
              className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
              required
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-ink/45">Company / org name</label>
            <input
              value={form.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              placeholder="Your company or organization"
              className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
              required
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-ink/45">Website (optional)</label>
            <input
              type="url"
              value={form.website}
              onChange={(e) => updateField('website', e.target.value)}
              placeholder="https://yourcompany.com"
              className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-ink/45">Support email</label>
            <input
              type="email"
              value={form.supportEmail}
              onChange={(e) => updateField('supportEmail', e.target.value)}
              placeholder="support@yourcompany.com"
              className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
            />
          </div>
        </div>
        {error && (
          <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-dusk px-5 py-3 font-semibold text-sand disabled:opacity-60"
        >
          {submitting ? 'Submitting...' : 'Submit verification request'}
        </button>
      </form>
    </div>
  );
};

// ─── Following Tab ─────────────────────────────────────────────────────────────
const FollowingTab = () => {
  const dispatch = useDispatch();
  const { following, followingLoaded, followingLoading } = useSelector((state) => state.user);
  const [unfollowingId, setUnfollowingId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!followingLoaded) {
      dispatch(fetchFollowing());
    }
  }, [dispatch, followingLoaded]);

  const handleUnfollow = async (organizerId, displayName) => {
    setUnfollowingId(organizerId);
    setToast(null);
    try {
      const response = await api.delete(`/api/users/organizers/${organizerId}/follow`);
      const { followersCount } = response.data.data;
      dispatch(syncFollowState({ organizerId, isFollowing: false, organizerProfile: null }));
      setToast({ tone: 'success', message: `You unfollowed ${displayName}.` });
    } catch (err) {
      setToast({
        tone: 'error',
        message: err.response?.data?.message || 'Unable to unfollow right now.'
      });
    } finally {
      setUnfollowingId(null);
    }
  };

  if (followingLoading && !followingLoaded) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-[28px] bg-white/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl text-ink">Following</h2>
        <p className="mt-2 text-sm text-ink/60">
          Organizers you follow. You'll be notified whenever they publish a new event.
        </p>
      </div>

      {toast && (
        <p className={`rounded-2xl px-4 py-3 text-sm ${
          toast.tone === 'success' ? 'bg-reef/10 text-reef' : 'bg-ember/10 text-ember'
        }`}>
          {toast.message}
        </p>
      )}

      {following.length === 0 && (
        <div className="rounded-[32px] border border-ink/10 bg-white/80 px-6 py-14 text-center shadow-bloom">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sand">
            <svg className="h-7 w-7 text-ink/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="font-display text-2xl text-ink">Not following anyone yet</p>
          <p className="mt-3 text-sm text-ink/55">
            Visit an organizer's profile or an event page and hit <strong>Follow organizer</strong> to stay in the loop.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-sand"
          >
            Browse events
          </Link>
        </div>
      )}

      {following.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {following.map((organizer) => {
            const companyName =
              organizer.organizerProfile?.companyName || organizer.displayName;
            const initials = organizer.displayName?.[0]?.toUpperCase() || '?';
            const isUnfollowing = unfollowingId === organizer.userId;

            return (
              <div
                key={organizer.userId}
                className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom flex flex-col gap-4"
              >
                {/* Avatar + name */}
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border-2 border-ink/10 bg-gradient-to-br from-reef/40 to-dusk/40 flex items-center justify-center">
                    {organizer.avatarUrl ? (
                      <img
                        src={organizer.avatarUrl}
                        alt={organizer.displayName}
                        className="h-full w-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <span className="font-display text-xl text-ink">{initials}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg text-ink">{companyName}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className="rounded-full bg-reef/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-reef">
                        {organizer.role}
                      </span>
                      {organizer.verifiedOrganizer && (
                        <span className="rounded-full bg-ember/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
                          Verified
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bio snippet */}
                {organizer.bio && (
                  <p className="text-sm text-ink/60 line-clamp-2">{organizer.bio}</p>
                )}

                {/* Stats row */}
                <div className="flex gap-4 text-xs text-ink/50">
                  <span>
                    <strong className="text-ink">{organizer.followersCount || 0}</strong> followers
                  </span>
                  {organizer.location && <span>📍 {organizer.location}</span>}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-1">
                  <Link
                    to={`/organizers/${organizer.userId}`}
                    className="flex-1 rounded-full border border-ink/10 bg-sand px-4 py-2 text-center text-xs font-semibold text-ink hover:bg-white transition"
                  >
                    View profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleUnfollow(organizer.userId, companyName)}
                    disabled={isUnfollowing}
                    className="flex-1 rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember hover:bg-ember/10 disabled:opacity-60 transition"
                  >
                    {isUnfollowing ? 'Unfollowing…' : 'Unfollow'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Refresh button at the bottom */}
      {following.length > 0 && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => dispatch(fetchFollowing())}
            disabled={followingLoading}
            className="rounded-full border border-ink/10 bg-white px-5 py-2 text-sm text-ink/50 hover:text-ink transition disabled:opacity-50"
          >
            {followingLoading ? 'Refreshing…' : 'Refresh list'}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Main ProfilePage ──────────────────────────────────────────────────────────
const ProfilePage = () => {
  const dispatch = useDispatch();
  const { profile, loading, saving, saved, error } = useSelector((state) => state.user);
  const { user } = useSelector((state) => state.auth);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'following'
  const [form, setForm] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    dispatch(fetchProfile());
  }, [dispatch]);

  useEffect(() => {
    if (profile && !form) {
      setForm({
        displayName: profile.displayName || '',
        bio: profile.bio || '',
        avatarUrl: profile.avatarUrl || '',
        location: profile.location || '',
        interests: profile.interests || [],
        socialLinks: {
          website: profile.socialLinks?.website || '',
          linkedin: profile.socialLinks?.linkedin || '',
          twitter: profile.socialLinks?.twitter || ''
        },
        organizerProfile: {
          companyName: profile.organizerProfile?.companyName || '',
          website: profile.organizerProfile?.website || '',
          supportEmail: profile.organizerProfile?.supportEmail || ''
        }
      });
    }
  }, [profile, form]);

  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => dispatch(clearSaved()), 3000);
      return () => clearTimeout(timer);
    }
  }, [saved, dispatch]);

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateNested = (parent, key, value) =>
    setForm((prev) => ({ ...prev, [parent]: { ...prev[parent], [key]: value } }));

  const toggleInterest = (interest) =>
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest]
    }));

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/uploads/avatar', formData);
      updateField('avatarUrl', res.data.data.url);
    } catch {
      setUploadError('Upload failed. Please try again or paste a URL manually.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      displayName: form.displayName,
      bio: form.bio,
      location: form.location,
      interests: form.interests,
      socialLinks: form.socialLinks
    };
    if (form.avatarUrl) payload.avatarUrl = form.avatarUrl;
    if (user?.role === 'organizer' || user?.role === 'admin') {
      payload.organizerProfile = form.organizerProfile;
    }
    dispatch(updateProfile(payload));
  };

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-ink/50">Loading your profile...</p>
      </div>
    );
  }

  const showVerificationRequest =
    profile &&
    !profile.verifiedOrganizer &&
    !['organizer', 'admin'].includes(profile.role);

  // ── Tab nav ────────────────────────────────────────────────────────────────
  const TABS = [
    { key: 'profile', label: 'My Profile' },
    { key: 'following', label: 'Following' }
  ];

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Account"
        title="Your profile"
        description="Manage your identity, interests, organizer details, and the organizers you follow."
      />

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-full border border-ink/10 bg-sand p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              activeTab === tab.key ? 'bg-ink text-sand' : 'text-ink/60 hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── FOLLOWING TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'following' && <FollowingTab />}

      {/* ── PROFILE TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <>
          {showVerificationRequest && (
            <OrganizerVerificationSection userId={user?.id} />
          )}

          <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[0.85fr,1.15fr]">
            {/* Left: Identity */}
            <div className="space-y-6 rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
              <h2 className="font-display text-2xl text-ink">Identity</h2>

              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-ink/10 bg-gradient-to-br from-reef to-dusk flex-shrink-0">
                    {form.avatarUrl ? (
                      <img src={form.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-display text-2xl text-sand">
                        {form.displayName?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute inset-0 rounded-full bg-ink/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    {uploadingAvatar ? (
                      <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                  <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Avatar</p>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="mt-2 rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-medium text-ink hover:bg-white disabled:opacity-50"
                  >
                    {uploadingAvatar ? 'Uploading...' : 'Upload photo'}
                  </button>
                  <p className="mt-1.5 text-xs text-ink/40">JPG, PNG or WebP · max 5MB</p>
                  {uploadError && <p className="mt-1 text-xs text-ember">{uploadError}</p>}
                </div>
              </div>

              {/* Avatar URL */}
              <div>
                <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Or paste avatar URL</label>
                <input
                  value={form.avatarUrl}
                  onChange={(e) => updateField('avatarUrl', e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-2 text-sm outline-none focus:border-reef"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Display name</label>
                  <input
                    value={form.displayName}
                    onChange={(e) => updateField('displayName', e.target.value)}
                    placeholder="Your public name"
                    className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Bio</label>
                  <textarea
                    value={form.bio}
                    onChange={(e) => updateField('bio', e.target.value)}
                    placeholder="Tell the community about yourself..."
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.22em] text-ink/45">Location</label>
                  <input
                    value={form.location}
                    onChange={(e) => updateField('location', e.target.value)}
                    placeholder="City, Country"
                    className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                  />
                </div>
              </div>

              {/* Role badge */}
              <div className="rounded-2xl bg-sand/70 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Account</p>
                <p className="mt-1 text-sm font-semibold text-ink">{user?.email}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-block rounded-full bg-reef/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-reef">
                    {profile?.role}
                  </span>
                  {profile?.verifiedOrganizer && (
                    <span className="inline-block rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ember">
                      Verified Organizer
                    </span>
                  )}
                </div>
                {/* Quick link to own organizer profile page */}
                {['organizer', 'admin'].includes(profile?.role) && (
                  <Link
                    to={`/organizers/${user?.id}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-reef hover:underline"
                  >
                    View your public organizer page →
                  </Link>
                )}
              </div>
            </div>

            {/* Right: Interests + Social + Organizer */}
            <div className="space-y-6">
              {/* Interests */}
              <div className="rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
                <h2 className="font-display text-2xl text-ink">Interests</h2>
                <p className="mt-2 text-sm text-ink/60">
                  Select topics to get personalized event recommendations.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map((interest) => (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition ${
                        form.interests.includes(interest)
                          ? 'bg-reef text-white'
                          : 'border border-ink/10 bg-sand/70 text-ink/70 hover:border-reef/40'
                      }`}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
              </div>

              {/* Social links */}
              <div className="rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
                <h2 className="font-display text-2xl text-ink">Social links</h2>
                <div className="mt-4 space-y-3">
                  {[
                    { key: 'website', label: 'Website', placeholder: 'https://yoursite.com' },
                    { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/...' },
                    { key: 'twitter', label: 'Twitter / X', placeholder: 'https://x.com/...' }
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="text-xs uppercase tracking-[0.2em] text-ink/45">{label}</label>
                      <input
                        value={form.socialLinks[key]}
                        onChange={(e) => updateNested('socialLinks', key, e.target.value)}
                        placeholder={placeholder}
                        className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Organizer profile */}
              {(user?.role === 'organizer' || user?.role === 'admin') && (
                <div className="rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
                  <h2 className="font-display text-2xl text-ink">Organizer profile</h2>
                  <p className="mt-2 text-sm text-ink/60">
                    Public details shown on your event pages and organizer profile.
                  </p>
                  <div className="mt-4 space-y-3">
                    {[
                      { key: 'companyName', label: 'Company / org name', placeholder: 'Acme Events Ltd.' },
                      { key: 'supportEmail', label: 'Support email', placeholder: 'support@yourorg.com', type: 'email' },
                      { key: 'website', label: 'Org website', placeholder: 'https://yourorg.com' }
                    ].map(({ key, label, placeholder, type = 'text' }) => (
                      <div key={key}>
                        <label className="text-xs uppercase tracking-[0.2em] text-ink/45">{label}</label>
                        <input
                          type={type}
                          value={form.organizerProfile[key]}
                          onChange={(e) => updateNested('organizerProfile', key, e.target.value)}
                          placeholder={placeholder}
                          className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Save */}
              <div>
                {error && (
                  <p className="mb-3 rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
                )}
                {saved && (
                  <p className="mb-3 rounded-2xl bg-reef/10 px-4 py-3 text-sm text-reef">
                    Profile saved successfully.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-2xl bg-ink px-5 py-3 font-semibold text-sand disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save profile'}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default ProfilePage;