import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import SectionHeader from '../components/SectionHeader';
import { fetchProfile, updateProfile, clearSaved } from '../features/user/userSlice';
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
        setSubmitted(true); // treat as already submitted
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

// ─── Main ProfilePage ──────────────────────────────────────────────────────────
const ProfilePage = () => {
  const dispatch = useDispatch();
  const { profile, loading, saving, saved, error } = useSelector((state) => state.user);
  const { user } = useSelector((state) => state.auth);
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

  // frontend/src/pages/ProfilePage.jsx
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // REMOVE the headers config completely
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

  // Show verification CTA for non-organizer/non-admin attendees, speakers, or moderators
  const showVerificationRequest =
    profile &&
    !profile.verifiedOrganizer &&
    !['organizer', 'admin'].includes(profile.role);

  return (
    <div className="space-y-10">
      <SectionHeader
        eyebrow="Account"
        title="Your profile"
        description="Manage your identity, interests, and public organizer details."
      />

      {/* Verification CTA for non-organizers */}
      {showVerificationRequest && (
        <OrganizerVerificationSection userId={user?.id} />
      )}

      <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[0.85fr,1.15fr]">
        {/* Left: Identity */}
        <div className="space-y-6 rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
          <h2 className="font-display text-2xl text-ink">Identity</h2>

          {/* Avatar with upload */}
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
                  <svg
                    className="h-5 w-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Avatar</p>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-medium text-ink hover:bg-white disabled:opacity-50"
                >
                  {uploadingAvatar ? 'Uploading...' : 'Upload photo'}
                </button>
              </div>
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
                  className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition ${form.interests.includes(interest)
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

          {/* Organizer profile — shown if organizer/admin */}
          {(user?.role === 'organizer' || user?.role === 'admin') && (
            <div className="rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
              <h2 className="font-display text-2xl text-ink">Organizer profile</h2>
              <p className="mt-2 text-sm text-ink/60">
                Public details shown on your event pages.
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
    </div>
  );
};

export default ProfilePage;