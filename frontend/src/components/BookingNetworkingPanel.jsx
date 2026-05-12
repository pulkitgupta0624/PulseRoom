import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';

const GOAL_OPTIONS = [
  'Find collaborators',
  'Meet customers',
  'Learn from peers',
  'Find mentors',
  'Offer support',
  'Explore jobs'
];

const createEmptyForm = () => ({
  meetingGoal: '',
  canHelpWith: '',
  lookingFor: '',
  availabilityNote: ''
});

const tagsToText = (values = []) => (Array.isArray(values) ? values.join(', ') : '');

const textToTags = (value) =>
  [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean))]
    .slice(0, 8);

const buildFormFromProfile = (profile = {}) => ({
  meetingGoal: profile.meetingGoal || '',
  canHelpWith: tagsToText(profile.canHelpWith),
  lookingFor: tagsToText(profile.lookingFor),
  availabilityNote: profile.availabilityNote || ''
});

const buildProfilePayload = (form) => ({
  meetingGoal: form.meetingGoal,
  canHelpWith: textToTags(form.canHelpWith),
  lookingFor: textToTags(form.lookingFor),
  availabilityNote: form.availabilityNote.trim()
});

const decisionCopy = {
  pending: {
    label: 'Pending',
    className: 'bg-sand text-ink/60'
  },
  accepted: {
    label: 'Interested',
    className: 'bg-reef/10 text-reef'
  },
  skipped: {
    label: 'Not now',
    className: 'bg-ember/10 text-ember'
  }
};

const StatusPill = ({ label, decision }) => {
  const tone = decisionCopy[decision] || decisionCopy.pending;

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.className}`}>
      {label}: {tone.label}
    </span>
  );
};

const BookingNetworkingPanel = ({ booking }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decisionSavingId, setDecisionSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(createEmptyForm);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get(`/api/events/${booking.eventId}/networking/me`);
        if (active) {
          const payload = response.data.data;
          setData(payload);
          setForm(buildFormFromProfile(payload.profile));
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

  const profilePayload = useMemo(() => buildProfilePayload(form), [form]);

  const persistNetworking = async (payload, successMessage) => {
    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const response = await api.post(`/api/events/${booking.eventId}/networking/me`, payload);
      setData(response.data.data);
      setForm(buildFormFromProfile(response.data.data.profile));
      if (successMessage) {
        setStatus({
          tone: 'success',
          message: successMessage
        });
      }
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to update networking preferences.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (optedIn) => {
    await persistNetworking(
      {
        optedIn,
        ...profilePayload
      },
      optedIn
        ? 'You are in. We will use your profile to make stronger introductions.'
        : 'You are out of the networking pool for now.'
    );
  };

  const handleProfileSave = async () => {
    await persistNetworking(profilePayload, 'Networking profile saved.');
  };

  const handleMatchDecision = async (match, decision) => {
    setDecisionSavingId(match.matchId);
    setError(null);
    setStatus(null);

    try {
      const nextDecision = match.myStatus?.decision === decision ? 'pending' : decision;
      const response = await api.post(
        `/api/events/${booking.eventId}/networking/matches/${match.matchId}/decision`,
        { decision: nextDecision }
      );
      const updatedMatch = response.data.data.match;

      setData((current) => ({
        ...current,
        matches: (current?.matches || []).map((item) =>
          item.matchId === updatedMatch.matchId ? updatedMatch : item
        )
      }));
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to update your networking decision.');
    } finally {
      setDecisionSavingId(null);
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-reef">Pre-event networking</p>
          <p className="mt-1 text-sm text-ink/70">
            Tell us what you can help with, what you want to meet around, and we will shape better
            introductions before <span className="font-semibold text-ink">{booking.eventSnapshot?.title}</span>.
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

      {status && (
        <p className="mt-3 rounded-2xl bg-reef/10 px-4 py-3 text-sm text-reef">{status.message}</p>
      )}

      <section className="mt-4 rounded-[22px] border border-ink/10 bg-white/75 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Your intro profile</p>
            <p className="mt-1 text-sm text-ink/60">
              Keep this tight and specific. Comma-separate topics like fundraising, ai ops, hiring.
            </p>
          </div>
          {data?.optedInAt && (
            <p className="text-xs text-ink/45">Joined the pool {formatDate(data.optedInAt)}</p>
          )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="text-sm text-ink/65">
            <span className="block text-xs uppercase tracking-[0.18em] text-ink/45">Meeting goal</span>
            <select
              value={form.meetingGoal}
              onChange={(event) => setForm((current) => ({ ...current, meetingGoal: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm focus:border-reef"
            >
              <option value="">Pick one</option>
              {GOAL_OPTIONS.map((goal) => (
                <option key={goal} value={goal}>
                  {goal}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-ink/65">
            <span className="block text-xs uppercase tracking-[0.18em] text-ink/45">Availability note</span>
            <input
              type="text"
              value={form.availabilityNote}
              onChange={(event) =>
                setForm((current) => ({ ...current, availabilityNote: event.target.value }))
              }
              placeholder="Example: Free after 6pm IST or happy to connect async"
              className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm focus:border-reef"
            />
          </label>

          <label className="text-sm text-ink/65">
            <span className="block text-xs uppercase tracking-[0.18em] text-ink/45">I can help with</span>
            <input
              type="text"
              value={form.canHelpWith}
              onChange={(event) => setForm((current) => ({ ...current, canHelpWith: event.target.value }))}
              placeholder="fundraising, product strategy, growth"
              className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm focus:border-reef"
            />
          </label>

          <label className="text-sm text-ink/65">
            <span className="block text-xs uppercase tracking-[0.18em] text-ink/45">I want to meet around</span>
            <input
              type="text"
              value={form.lookingFor}
              onChange={(event) => setForm((current) => ({ ...current, lookingFor: event.target.value }))}
              placeholder="hiring, partnerships, mentors"
              className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm focus:border-reef"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleProfileSave}
            disabled={saving}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-sand disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save profile'}
          </button>
          {!data?.optedIn && (
            <p className="self-center text-xs text-ink/45">
              Save your notes first, then opt in when you are ready to be matched.
            </p>
          )}
        </div>
      </section>

      {data?.optedIn && (!data.matches || data.matches.length === 0) && (
        <p className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-sm text-ink/60">
          You are in the pool. We will notify you when a strong match is ready.
        </p>
      )}

      {data?.matches?.length > 0 && (
        <div className="mt-4 space-y-3">
          {data.matches.map((match) => {
            const counterpartProfile = match.counterpart?.networkingProfile || {};
            const canHelpWith = counterpartProfile.canHelpWith || [];
            const lookingFor = counterpartProfile.lookingFor || [];

            return (
              <article key={match.matchId} className="rounded-[20px] border border-reef/10 bg-white/75 px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{match.counterpart?.displayName || 'Your match'}</p>
                      {counterpartProfile.meetingGoal && (
                        <span className="rounded-full bg-dusk/10 px-3 py-1 text-xs font-semibold text-dusk">
                          {counterpartProfile.meetingGoal}
                        </span>
                      )}
                    </div>

                    {match.counterpart?.location && (
                      <p className="mt-1 text-xs text-ink/45">{match.counterpart.location}</p>
                    )}

                    <p className="mt-2 text-sm text-ink/65">{match.summary}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {match.sharedInterests?.map((interest) => (
                        <span
                          key={`interest-${match.matchId}-${interest}`}
                          className="rounded-full border border-reef/15 bg-reef/5 px-3 py-1 text-xs font-medium capitalize text-reef"
                        >
                          {interest}
                        </span>
                      ))}
                      {match.sharedIntentTags?.map((intentTag) => (
                        <span
                          key={`intent-${match.matchId}-${intentTag}`}
                          className="rounded-full border border-dusk/15 bg-dusk/5 px-3 py-1 text-xs font-medium capitalize text-dusk"
                        >
                          {intentTag}
                        </span>
                      ))}
                    </div>

                    {(canHelpWith.length > 0 || lookingFor.length > 0 || counterpartProfile.availabilityNote) && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {canHelpWith.length > 0 && (
                          <div className="rounded-2xl bg-sand/70 px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Can help with</p>
                            <p className="mt-2 text-sm text-ink/65">{canHelpWith.join(', ')}</p>
                          </div>
                        )}
                        {lookingFor.length > 0 && (
                          <div className="rounded-2xl bg-sand/70 px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Looking for</p>
                            <p className="mt-2 text-sm text-ink/65">{lookingFor.join(', ')}</p>
                          </div>
                        )}
                        {counterpartProfile.availabilityNote && (
                          <div className="rounded-2xl bg-sand/70 px-3 py-3 md:col-span-2">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Availability</p>
                            <p className="mt-2 text-sm text-ink/65">{counterpartProfile.availabilityNote}</p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <StatusPill label="You" decision={match.myStatus?.decision} />
                      <StatusPill label="Them" decision={match.counterpartStatus?.decision} />
                    </div>

                    {match.mutualAcceptance && (
                      <p className="mt-3 rounded-2xl bg-reef/10 px-3 py-2 text-sm text-reef">
                        You both said yes. This intro is live now.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 lg:min-w-[168px]">
                    <button
                      type="button"
                      onClick={() => handleMatchDecision(match, 'accepted')}
                      disabled={decisionSavingId === match.matchId}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                        match.myStatus?.decision === 'accepted'
                          ? 'bg-reef text-white'
                          : 'border border-reef/20 bg-white text-reef'
                      }`}
                    >
                      {decisionSavingId === match.matchId ? 'Saving...' : 'Interested'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMatchDecision(match, 'skipped')}
                      disabled={decisionSavingId === match.matchId}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                        match.myStatus?.decision === 'skipped'
                          ? 'bg-ember text-white'
                          : 'border border-ink/10 bg-sand text-ink/65'
                      }`}
                    >
                      Not now
                    </button>
                    {match.counterpart?.userId && (
                      <Link
                        to={`/messages/${match.counterpart.userId}`}
                        className="rounded-full bg-ink px-4 py-2 text-center text-sm font-semibold text-sand"
                      >
                        Send message
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BookingNetworkingPanel;
