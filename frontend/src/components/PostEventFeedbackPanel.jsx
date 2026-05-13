import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';
import StarRatingInput from './StarRatingInput';

const NPS_SCALE = Array.from({ length: 11 }, (_, index) => index);

const createEmptyDraft = (sessions = []) => ({
  overallRating: 0,
  npsScore: null,
  attendAgain: true,
  highlightText: '',
  improvementText: '',
  sessionFeedback: (Array.isArray(sessions) ? sessions : []).reduce((accumulator, session) => {
    accumulator[session.sessionKey] = {
      rating: 0,
      comment: ''
    };
    return accumulator;
  }, {})
});

const buildDraftFromFeedback = ({ feedback, sessions }) => {
  const nextDraft = createEmptyDraft(sessions);
  if (!feedback) {
    return nextDraft;
  }

  nextDraft.overallRating = Number(feedback.overallRating || 0);
  nextDraft.npsScore = Number.isInteger(feedback.npsScore) ? feedback.npsScore : null;
  nextDraft.attendAgain = Boolean(feedback.attendAgain);
  nextDraft.highlightText = feedback.highlightText || '';
  nextDraft.improvementText = feedback.improvementText || '';

  (feedback.sessionFeedback || []).forEach((entry) => {
    nextDraft.sessionFeedback[entry.sessionKey] = {
      rating: Number(entry.rating || 0),
      comment: entry.comment || ''
    };
  });

  return nextDraft;
};

const PostEventFeedbackPanel = ({ event, user, autoFocus = false }) => {
  const feedbackSectionRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [draft, setDraft] = useState(() => createEmptyDraft());

  const loadFeedbackState = async () => {
    if (!user) {
      setEligibility(null);
      setDraft(createEmptyDraft());
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/events/${event._id}/feedback/me`);
      const nextEligibility = response.data.data;
      setEligibility(nextEligibility);
      setDraft(
        buildDraftFromFeedback({
          feedback: nextEligibility.feedback,
          sessions: nextEligibility.sessions || []
        })
      );
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Unable to load post-event feedback right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (event?.status !== 'completed') {
      return;
    }

    void loadFeedbackState();
  }, [event?._id, event?.status, user?.id]);

  useEffect(() => {
    if (!autoFocus || loading || !feedbackSectionRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      feedbackSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  }, [autoFocus, loading]);

  const sessions = eligibility?.sessions || [];

  const submittedAtLabel = useMemo(() => {
    const timestamp = eligibility?.feedback?.updatedAt || eligibility?.feedback?.createdAt;
    return timestamp ? formatDate(timestamp) : null;
  }, [eligibility?.feedback?.createdAt, eligibility?.feedback?.updatedAt]);

  const updateDraftField = (key, value) => {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  const updateSessionDraft = (sessionKey, key, value) => {
    setDraft((current) => ({
      ...current,
      sessionFeedback: {
        ...current.sessionFeedback,
        [sessionKey]: {
          ...(current.sessionFeedback?.[sessionKey] || {
            rating: 0,
            comment: ''
          }),
          [key]: value
        }
      }
    }));
  };

  const handleSubmit = async (eventInput) => {
    eventInput.preventDefault();
    setSaving(true);
    setStatus(null);
    setError(null);

    try {
      await api.post(`/api/events/${event._id}/feedback`, {
        overallRating: Number(draft.overallRating || 0),
        npsScore: Number(draft.npsScore),
        attendAgain: Boolean(draft.attendAgain),
        highlightText: draft.highlightText,
        improvementText: draft.improvementText,
        sessionFeedback: sessions
          .map((session) => ({
            sessionKey: session.sessionKey,
            rating: Number(draft.sessionFeedback?.[session.sessionKey]?.rating || 0),
            comment: draft.sessionFeedback?.[session.sessionKey]?.comment || ''
          }))
          .filter((entry) => entry.rating > 0)
      });

      setStatus({
        tone: 'success',
        message: eligibility?.feedback
          ? 'Your private feedback was updated.'
          : 'Thanks for sharing your feedback.'
      });
      await loadFeedbackState();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save your feedback right now.');
    } finally {
      setSaving(false);
    }
  };

  if (event?.status !== 'completed') {
    return null;
  }

  return (
    <section
      ref={feedbackSectionRef}
      className="rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-dusk">Post-event survey</p>
          <h2 className="mt-1 font-display text-3xl text-ink">Share the real attendee experience</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/62">
            This private survey helps the organizer improve future editions with structured NPS, session ratings, and clear follow-up notes.
          </p>
        </div>
        {submittedAtLabel && (
          <div className="rounded-[22px] bg-sand px-4 py-3 text-sm text-ink/55">
            Last updated {submittedAtLabel}
          </div>
        )}
      </div>

      {!user ? (
        <div className="mt-6 rounded-[26px] border border-dashed border-ink/12 bg-sand/45 px-6 py-10 text-center">
          <p className="font-display text-2xl text-ink">Sign in to leave post-event feedback</p>
          <p className="mt-3 text-sm text-ink/55">
            Feedback is available to confirmed attendees after the event wraps.
          </p>
          <Link
            to="/auth"
            className="mt-5 inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-sand transition hover:bg-ink/90"
          >
            Sign in
          </Link>
        </div>
      ) : loading ? (
        <div className="mt-6 flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dusk border-t-transparent" />
        </div>
      ) : (
        <>
          {error && (
            <p className="mt-6 rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
          )}

          {status && (
            <p className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
              status.tone === 'success' ? 'bg-reef/10 text-reef' : 'bg-ember/10 text-ember'
            }`}>
              {status.message}
            </p>
          )}

          {!eligibility?.canSubmit ? (
            <div className="mt-6 rounded-[26px] border border-dashed border-ink/12 bg-sand/45 px-6 py-10 text-center">
              <p className="font-display text-2xl text-ink">Feedback is not open for this account yet</p>
              <p className="mt-3 text-sm text-ink/55">
                {eligibility?.reason || 'Only confirmed attendees can submit post-event feedback.'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              <div className="grid gap-4 lg:grid-cols-[0.95fr,1.05fr]">
                <div className="rounded-[26px] bg-sand/55 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Overall rating</p>
                  <h3 className="mt-2 font-display text-2xl text-ink">How would you rate the event?</h3>
                  <div className="mt-4">
                    <StarRatingInput
                      value={draft.overallRating}
                      onChange={(value) => updateDraftField('overallRating', value)}
                      size="lg"
                      label="Overall event rating"
                    />
                  </div>
                  <p className="mt-3 text-xs text-ink/45">
                    This stays private in the survey. Public reviews are handled separately.
                  </p>
                </div>

                <div className="rounded-[26px] bg-sand/55 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">NPS</p>
                  <h3 className="mt-2 font-display text-2xl text-ink">How likely are you to recommend it?</h3>
                  <div className="mt-4 grid grid-cols-6 gap-2 md:grid-cols-11">
                    {NPS_SCALE.map((score) => {
                      const isActive = draft.npsScore === score;
                      return (
                        <button
                          key={score}
                          type="button"
                          onClick={() => updateDraftField('npsScore', score)}
                          className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                            isActive
                              ? 'bg-ink text-sand'
                              : 'border border-ink/10 bg-white text-ink/65 hover:bg-sand'
                          }`}
                        >
                          {score}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-ink/45">
                    <span>Not likely</span>
                    <span>Very likely</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[26px] border border-ink/10 bg-white/82 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">What landed well?</p>
                  <textarea
                    value={draft.highlightText}
                    onChange={(eventInput) => updateDraftField('highlightText', eventInput.target.value)}
                    rows={5}
                    placeholder="What felt strongest, most useful, or most memorable?"
                    className="mt-3 w-full rounded-2xl border border-ink/10 bg-sand/45 px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                </div>

                <div className="rounded-[26px] border border-ink/10 bg-white/82 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">What should improve?</p>
                  <textarea
                    value={draft.improvementText}
                    onChange={(eventInput) => updateDraftField('improvementText', eventInput.target.value)}
                    rows={5}
                    placeholder="Where did the experience fall short or feel confusing?"
                    className="mt-3 w-full rounded-2xl border border-ink/10 bg-sand/45 px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                </div>
              </div>

              <div className="rounded-[26px] border border-ink/10 bg-white/82 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Follow-up intent</p>
                <h3 className="mt-2 font-display text-2xl text-ink">Would you attend another edition?</h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => updateDraftField('attendAgain', true)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      draft.attendAgain
                        ? 'bg-reef text-white'
                        : 'border border-ink/10 bg-white text-ink/65 hover:bg-sand'
                    }`}
                  >
                    Yes, definitely
                  </button>
                  <button
                    type="button"
                    onClick={() => updateDraftField('attendAgain', false)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      !draft.attendAgain
                        ? 'bg-ink text-sand'
                        : 'border border-ink/10 bg-white text-ink/65 hover:bg-sand'
                    }`}
                  >
                    Not right now
                  </button>
                </div>
              </div>

              {sessions.length > 0 && (
                <div className="rounded-[26px] border border-ink/10 bg-white/82 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Session notes</p>
                      <h3 className="mt-2 font-display text-2xl text-ink">Rate the standout sessions</h3>
                    </div>
                    <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                      Optional
                    </span>
                  </div>

                  <div className="mt-5 space-y-4">
                    {sessions.map((session) => {
                      const sessionDraft = draft.sessionFeedback?.[session.sessionKey] || {
                        rating: 0,
                        comment: ''
                      };

                      return (
                        <article
                          key={session.sessionKey}
                          className="rounded-[24px] border border-ink/8 bg-sand/45 p-4"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <h4 className="font-semibold text-ink">{session.title}</h4>
                              <p className="mt-1 text-sm text-ink/55">
                                {[session.roomLabel, formatDate(session.startsAt)].filter(Boolean).join(' · ')}
                              </p>
                              {session.speakerNames?.length > 0 && (
                                <p className="mt-2 text-xs text-ink/45">
                                  Speakers: {session.speakerNames.join(', ')}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              <StarRatingInput
                                value={sessionDraft.rating}
                                onChange={(value) => updateSessionDraft(session.sessionKey, 'rating', value)}
                                label={`${session.title} rating`}
                              />
                              {sessionDraft.rating > 0 && (
                                <button
                                  type="button"
                                  onClick={() => updateSessionDraft(session.sessionKey, 'rating', 0)}
                                  className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs text-ink/55 transition hover:bg-sand"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>

                          <textarea
                            value={sessionDraft.comment}
                            onChange={(eventInput) =>
                              updateSessionDraft(session.sessionKey, 'comment', eventInput.target.value)
                            }
                            rows={3}
                            placeholder="What worked or missed the mark in this session?"
                            className="mt-4 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                          />
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={saving || draft.overallRating < 1 || draft.npsScore === null}
                className="w-full rounded-2xl bg-ink px-5 py-3 font-semibold text-sand transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving feedback...' : eligibility?.feedback ? 'Update feedback' : 'Submit feedback'}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
};

export default PostEventFeedbackPanel;
