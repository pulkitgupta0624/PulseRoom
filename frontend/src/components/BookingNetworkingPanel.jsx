import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { downloadNetworkingMeetingCalendar } from '../lib/downloads';
import { formatDate } from '../lib/formatters';

const GOAL_OPTIONS = [
  'Find collaborators',
  'Meet customers',
  'Learn from peers',
  'Find mentors',
  'Offer support',
  'Explore jobs'
];

const MIN_SLOT_MINUTES = 15;
const MAX_SLOT_MINUTES = 120;

const createEmptyForm = () => ({
  meetingGoal: '',
  canHelpWith: '',
  lookingFor: '',
  availabilityNote: '',
  availabilitySlots: []
});

const tagsToText = (values = []) => (Array.isArray(values) ? values.join(', ') : '');

const textToTags = (value) =>
  [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean))]
    .slice(0, 8);

const toDateTimeInputValue = (value) => {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const offsetMs = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
};

const fromDateTimeInputValue = (value) => {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString();
};

const createEmptySlotDraft = () => {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(18, 0, 0, 0);

  const end = new Date(start.getTime() + 30 * 60_000);

  return {
    startsAt: toDateTimeInputValue(start),
    endsAt: toDateTimeInputValue(end)
  };
};

const normalizeAvailabilitySlots = (slots = []) => {
  const uniqueSlots = new Map();

  for (const slot of Array.isArray(slots) ? slots : []) {
    const startsAt = new Date(slot?.startsAt || 0);
    const endsAt = new Date(slot?.endsAt || 0);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      continue;
    }

    const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
    if (durationMinutes < MIN_SLOT_MINUTES || durationMinutes > MAX_SLOT_MINUTES) {
      continue;
    }

    const normalizedSlot = {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString()
    };
    uniqueSlots.set(`${normalizedSlot.startsAt}|${normalizedSlot.endsAt}`, normalizedSlot);
  }

  return [...uniqueSlots.values()]
    .sort((left, right) => {
      if (new Date(left.startsAt).getTime() !== new Date(right.startsAt).getTime()) {
        return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
      }

      return new Date(left.endsAt).getTime() - new Date(right.endsAt).getTime();
    })
    .slice(0, 8);
};

const buildFormFromProfile = (profile = {}) => ({
  meetingGoal: profile.meetingGoal || '',
  canHelpWith: tagsToText(profile.canHelpWith),
  lookingFor: tagsToText(profile.lookingFor),
  availabilityNote: profile.availabilityNote || '',
  availabilitySlots: normalizeAvailabilitySlots(profile.availabilitySlots)
});

const buildProfilePayload = (form) => ({
  meetingGoal: form.meetingGoal,
  canHelpWith: textToTags(form.canHelpWith),
  lookingFor: textToTags(form.lookingFor),
  availabilityNote: form.availabilityNote.trim(),
  availabilitySlots: normalizeAvailabilitySlots(form.availabilitySlots)
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

const meetingCopy = {
  none: {
    label: 'No meeting yet',
    className: 'bg-sand text-ink/55'
  },
  proposed: {
    label: 'Proposal pending',
    className: 'bg-dusk/10 text-dusk'
  },
  confirmed: {
    label: 'Meeting confirmed',
    className: 'bg-reef/10 text-reef'
  },
  declined: {
    label: 'Proposal declined',
    className: 'bg-ember/10 text-ember'
  },
  cancelled: {
    label: 'Meeting cancelled',
    className: 'bg-ink/8 text-ink/60'
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

const MeetingPill = ({ status }) => {
  const tone = meetingCopy[status] || meetingCopy.none;

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.className}`}>
      {tone.label}
    </span>
  );
};

const formatSlotLabel = (slot) => {
  if (!slot?.startsAt || !slot?.endsAt) {
    return 'Choose a time';
  }

  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Choose a time';
  }

  return `${formatDate(start)} - ${end.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
};

const buildMeetingSlotOptions = ({ mySlots = [], counterpartSlots = [] }) => {
  const optionMap = new Map();

  for (const slot of normalizeAvailabilitySlots(mySlots)) {
    const key = `${slot.startsAt}|${slot.endsAt}`;
    optionMap.set(key, {
      ...slot,
      slotKey: key,
      source: 'mine'
    });
  }

  for (const slot of normalizeAvailabilitySlots(counterpartSlots)) {
    const key = `${slot.startsAt}|${slot.endsAt}`;
    const existing = optionMap.get(key);

    optionMap.set(key, {
      ...slot,
      slotKey: key,
      source: existing ? 'both' : 'counterpart'
    });
  }

  return [...optionMap.values()].sort(
    (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()
  );
};

const meetingStatusMessage = (meeting, counterpartName) => {
  if (!meeting?.status || meeting.status === 'none') {
    return 'Once you both say yes, propose a slot from either published availability window.';
  }

  if (meeting.status === 'proposed') {
    return `${meeting.proposedByName || counterpartName || 'Your match'} suggested ${formatSlotLabel(meeting)}.`;
  }

  if (meeting.status === 'confirmed') {
    return `Locked in for ${formatSlotLabel(meeting)}.`;
  }

  if (meeting.status === 'declined') {
    return 'That proposed time was declined. Pick another slot when you are ready.';
  }

  if (meeting.status === 'cancelled') {
    return 'The previous meeting was cancelled. You can rebook from the published slots.';
  }

  return 'Manage the next step from here.';
};

const MeetingSchedulerPanel = ({
  booking,
  match,
  myAvailabilitySlots,
  draft,
  onDraftChange,
  onMeetingAction,
  meetingSaving
}) => {
  const meeting = match.meeting || { status: 'none' };
  const counterpartName = match.counterpart?.displayName || 'your match';
  const counterpartSlots = match.counterpart?.networkingProfile?.availabilitySlots || [];
  const slotOptions = buildMeetingSlotOptions({
    mySlots: myAvailabilitySlots,
    counterpartSlots
  });
  const activeDraft = {
    slotKey: draft?.slotKey || slotOptions[0]?.slotKey || '',
    note: draft?.note || ''
  };
  const selectedSlot =
    slotOptions.find((slot) => slot.slotKey === activeDraft.slotKey) || slotOptions[0] || null;
  const canShowProposalForm =
    match.mutualAcceptance && (meeting.status !== 'proposed' || meeting.isMine) && meeting.status !== 'confirmed';

  return (
    <section className="mt-5 rounded-[22px] border border-dusk/15 bg-dusk/5 px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-dusk">Meeting scheduler</p>
            <MeetingPill status={meeting.status} />
          </div>
          <p className="mt-2 text-sm text-ink/65">
            {meetingStatusMessage(meeting, counterpartName)}
          </p>
        </div>

        {meeting.status === 'confirmed' && (
          <button
            type="button"
            onClick={() =>
              downloadNetworkingMeetingCalendar({
                eventTitle: booking.eventSnapshot?.title,
                counterpartName,
                startsAt: meeting.startsAt,
                endsAt: meeting.endsAt,
                note: meeting.note
              })
            }
            className="rounded-full border border-reef/20 bg-white px-4 py-2 text-sm font-semibold text-reef"
          >
            Add to calendar
          </button>
        )}
      </div>

      {(counterpartSlots.length > 0 || myAvailabilitySlots.length > 0) && (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <div className="rounded-2xl bg-white/80 px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Your slots</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {myAvailabilitySlots.length > 0 ? (
                myAvailabilitySlots.map((slot) => (
                  <span
                    key={`mine-${slot.startsAt}-${slot.endsAt}`}
                    className="rounded-full border border-reef/15 bg-reef/5 px-3 py-1 text-xs font-medium text-reef"
                  >
                    {formatSlotLabel(slot)}
                  </span>
                ))
              ) : (
                <p className="text-xs text-ink/45">Add your own bookable slots to start scheduling.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white/80 px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">{counterpartName}'s slots</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {counterpartSlots.length > 0 ? (
                counterpartSlots.map((slot) => (
                  <span
                    key={`counterpart-${slot.startsAt}-${slot.endsAt}`}
                    className="rounded-full border border-dusk/15 bg-dusk/5 px-3 py-1 text-xs font-medium text-dusk"
                  >
                    {formatSlotLabel(slot)}
                  </span>
                ))
              ) : (
                <p className="text-xs text-ink/45">They have not published meeting windows yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {meeting.status === 'proposed' && (
        <div className="mt-4 rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-sm font-semibold text-ink">Proposal: {formatSlotLabel(meeting)}</p>
          {meeting.note && (
            <p className="mt-2 text-sm text-ink/60">{meeting.note}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {meeting.canRespond && (
              <>
                <button
                  type="button"
                  onClick={() => onMeetingAction(match, 'confirm')}
                  disabled={meetingSaving}
                  className="rounded-full bg-reef px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {meetingSaving ? 'Saving...' : 'Confirm meeting'}
                </button>
                <button
                  type="button"
                  onClick={() => onMeetingAction(match, 'decline')}
                  disabled={meetingSaving}
                  className="rounded-full border border-ember/25 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember disabled:opacity-60"
                >
                  Decline
                </button>
              </>
            )}

            {meeting.canCancel && (
              <button
                type="button"
                onClick={() => onMeetingAction(match, 'cancel')}
                disabled={meetingSaving}
                className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-sm font-semibold text-ink/70 disabled:opacity-60"
              >
                {meeting.isMine ? 'Withdraw proposal' : 'Cancel proposal'}
              </button>
            )}
          </div>
        </div>
      )}

      {meeting.status === 'confirmed' && (
        <div className="mt-4 rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-sm font-semibold text-ink">{formatSlotLabel(meeting)}</p>
          {meeting.note && (
            <p className="mt-2 text-sm text-ink/60">{meeting.note}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onMeetingAction(match, 'cancel')}
              disabled={meetingSaving}
              className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-sm font-semibold text-ink/70 disabled:opacity-60"
            >
              {meetingSaving ? 'Saving...' : 'Cancel meeting'}
            </button>
          </div>
        </div>
      )}

      {canShowProposalForm && (
        <div className="mt-4 rounded-2xl bg-white/80 px-4 py-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Propose a meetup</p>
              <p className="mt-1 text-sm text-ink/55">
                Pick one of the published time windows and add a short note if context would help.
              </p>
            </div>
            {slotOptions.length > 0 && (
              <p className="text-xs text-ink/45">{slotOptions.length} slot option{slotOptions.length === 1 ? '' : 's'} available</p>
            )}
          </div>

          {!slotOptions.length ? (
            <p className="mt-4 rounded-2xl bg-sand/60 px-4 py-3 text-sm text-ink/55">
              Save at least one slot on either side to start booking a networking meetup.
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,1fr]">
                <label className="text-sm text-ink/65">
                  <span className="block text-xs uppercase tracking-[0.18em] text-ink/45">Time slot</span>
                  <select
                    value={activeDraft.slotKey}
                    onChange={(event) =>
                      onDraftChange(match.matchId, {
                        ...activeDraft,
                        slotKey: event.target.value
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm focus:border-dusk"
                  >
                    {slotOptions.map((slot) => (
                      <option key={slot.slotKey} value={slot.slotKey}>
                        {formatSlotLabel(slot)} {slot.source === 'both' ? '| shared window' : slot.source === 'mine' ? '| your slot' : '| their slot'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-ink/65">
                  <span className="block text-xs uppercase tracking-[0.18em] text-ink/45">Short note</span>
                  <input
                    type="text"
                    value={activeDraft.note}
                    onChange={(event) =>
                      onDraftChange(match.matchId, {
                        ...activeDraft,
                        note: event.target.value.slice(0, 240)
                      })
                    }
                    placeholder="Example: Happy to chat about partnerships after the keynote."
                    className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm focus:border-dusk"
                  />
                </label>
              </div>

              {selectedSlot && (
                <p className="mt-3 text-xs text-ink/45">
                  Proposed time: {formatSlotLabel(selectedSlot)}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onMeetingAction(match, 'propose')}
                  disabled={meetingSaving}
                  className="rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {meetingSaving ? 'Saving...' : meeting.status === 'proposed' ? 'Update proposal' : 'Propose time'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};

const BookingNetworkingPanel = ({ booking }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decisionSavingId, setDecisionSavingId] = useState(null);
  const [meetingSavingId, setMeetingSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(createEmptyForm);
  const [slotDraft, setSlotDraft] = useState(createEmptySlotDraft);
  const [meetingDrafts, setMeetingDrafts] = useState({});

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
          setMeetingDrafts({});
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
        ? 'You are in. We will use your profile and open slots to make stronger introductions.'
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

  const handleMeetingAction = async (match, action) => {
    setMeetingSavingId(match.matchId);
    setError(null);
    setStatus(null);

    try {
      const counterpartSlots = match.counterpart?.networkingProfile?.availabilitySlots || [];
      const slotOptions = buildMeetingSlotOptions({
        mySlots: data?.profile?.availabilitySlots || [],
        counterpartSlots
      });
      const currentDraft = meetingDrafts[match.matchId] || {
        slotKey: slotOptions[0]?.slotKey || '',
        note: ''
      };
      const selectedSlot =
        slotOptions.find((slot) => slot.slotKey === currentDraft.slotKey) || slotOptions[0] || null;

      const payload = { action };
      if (action === 'propose') {
        if (!selectedSlot) {
          throw new Error('Add or receive at least one availability slot before proposing a meeting.');
        }

        payload.startsAt = selectedSlot.startsAt;
        payload.endsAt = selectedSlot.endsAt;
        payload.note = currentDraft.note?.trim() || '';
      }

      const response = await api.post(
        `/api/events/${booking.eventId}/networking/matches/${match.matchId}/meeting`,
        payload
      );
      const updatedMatch = response.data.data.match;

      setData((current) => ({
        ...current,
        matches: (current?.matches || []).map((item) =>
          item.matchId === updatedMatch.matchId ? updatedMatch : item
        )
      }));

      const statusMessage = {
        propose: 'Meeting proposal sent.',
        confirm: 'Networking meetup confirmed.',
        decline: 'Meeting proposal declined.',
        cancel: 'Networking meetup cancelled.'
      };
      setStatus({
        tone: 'success',
        message: statusMessage[action] || 'Meeting updated.'
      });
    } catch (saveError) {
      setError(
        saveError.response?.data?.message ||
          saveError.message ||
          'Unable to update your networking meeting.'
      );
    } finally {
      setMeetingSavingId(null);
    }
  };

  const handleAddAvailabilitySlot = () => {
    const startsAt = fromDateTimeInputValue(slotDraft.startsAt);
    const endsAt = fromDateTimeInputValue(slotDraft.endsAt);
    const nextSlots = normalizeAvailabilitySlots([
      ...(form.availabilitySlots || []),
      {
        startsAt,
        endsAt
      }
    ]);

    if (!startsAt || !endsAt || nextSlots.length === (form.availabilitySlots || []).length) {
      setError('Add a valid 15 to 120 minute slot before saving your profile.');
      return;
    }

    setError(null);
    setForm((current) => ({
      ...current,
      availabilitySlots: nextSlots
    }));
    setSlotDraft(createEmptySlotDraft());
  };

  const handleRemoveAvailabilitySlot = (slotKey) => {
    setForm((current) => ({
      ...current,
      availabilitySlots: (current.availabilitySlots || []).filter(
        (slot) => `${slot.startsAt}|${slot.endsAt}` !== slotKey
      )
    }));
  };

  const handleOptToggleClick = () => {
    if (
      data?.optedIn &&
      (data?.matches || []).some((match) => ['proposed', 'confirmed'].includes(match.meeting?.status))
    ) {
      const confirmed = window.confirm(
        'Opting out will cancel your active networking meetups and proposals. Continue?'
      );
      if (!confirmed) {
        return;
      }
    }

    handleToggle(!data?.optedIn);
  };

  const handleMeetingDraftChange = (matchId, nextDraft) => {
    setMeetingDrafts((current) => ({
      ...current,
      [matchId]: nextDraft
    }));
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
            Tell us what you can help with, what you want to meet around, and when you are free.
            We will turn strong intros into real booked conversations before{' '}
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
          onClick={handleOptToggleClick}
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

        <div className="mt-4 rounded-[20px] border border-dusk/10 bg-dusk/5 px-4 py-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-dusk">Bookable meeting slots</p>
              <p className="mt-1 text-sm text-ink/60">
                Add discrete 15 to 120 minute windows. These become one-click options when a match wants to book time.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs text-ink/45">
              {(form.availabilitySlots || []).length}/8 slots
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr,1fr,auto]">
            <label className="text-sm text-ink/65">
              <span className="block text-xs uppercase tracking-[0.18em] text-ink/45">Starts</span>
              <input
                type="datetime-local"
                value={slotDraft.startsAt}
                onChange={(event) =>
                  setSlotDraft((current) => ({ ...current, startsAt: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-dusk"
              />
            </label>

            <label className="text-sm text-ink/65">
              <span className="block text-xs uppercase tracking-[0.18em] text-ink/45">Ends</span>
              <input
                type="datetime-local"
                value={slotDraft.endsAt}
                onChange={(event) =>
                  setSlotDraft((current) => ({ ...current, endsAt: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:border-dusk"
              />
            </label>

            <button
              type="button"
              onClick={handleAddAvailabilitySlot}
              className="mt-6 rounded-full bg-dusk px-4 py-3 text-sm font-semibold text-white"
            >
              Add slot
            </button>
          </div>

          {(form.availabilitySlots || []).length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {form.availabilitySlots.map((slot) => {
                const slotKey = `${slot.startsAt}|${slot.endsAt}`;
                return (
                  <button
                    key={slotKey}
                    type="button"
                    onClick={() => handleRemoveAvailabilitySlot(slotKey)}
                    className="rounded-full border border-dusk/15 bg-white px-3 py-2 text-xs font-medium text-dusk transition hover:border-ember/25 hover:text-ember"
                  >
                    {formatSlotLabel(slot)} x
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink/55">
              No bookable slots yet. Add a few windows so matches can lock time with you quickly.
            </p>
          )}
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
                      <MeetingPill status={match.meeting?.status} />
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
                        You both said yes. Use the scheduler below to turn this intro into a booked conversation.
                      </p>
                    )}

                    {match.mutualAcceptance && (
                      <MeetingSchedulerPanel
                        booking={booking}
                        match={match}
                        myAvailabilitySlots={data?.profile?.availabilitySlots || []}
                        draft={meetingDrafts[match.matchId]}
                        onDraftChange={handleMeetingDraftChange}
                        onMeetingAction={handleMeetingAction}
                        meetingSaving={meetingSavingId === match.matchId}
                      />
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
