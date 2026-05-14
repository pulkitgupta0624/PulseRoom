import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';
import ModalShell from './ModalShell';

const FILTER_DEFAULTS = {
  search: '',
  checkedIn: 'all',
  networking: 'all',
  sessionState: 'all',
  ticketType: 'all',
  referral: 'all'
};

const FILTER_OPTIONS = {
  checkedIn: [
    { value: 'all', label: 'All attendance' },
    { value: 'checked-in', label: 'Checked in' },
    { value: 'not-checked-in', label: 'Not checked in' },
    { value: 'no-show', label: 'No-show' }
  ],
  networking: [
    { value: 'all', label: 'All networking' },
    { value: 'opted-in', label: 'Networking opted in' },
    { value: 'not-opted-in', label: 'Networking not opted in' }
  ],
  sessionState: [
    { value: 'all', label: 'All session states' },
    { value: 'registered', label: 'Reserved sessions' },
    { value: 'waitlisted', label: 'Waitlisted sessions' }
  ],
  ticketType: [
    { value: 'all', label: 'All ticket sizes' },
    { value: 'single-ticket', label: 'Single-ticket buyers' },
    { value: 'multi-ticket', label: 'Multi-ticket buyers' }
  ],
  referral: [
    { value: 'all', label: 'All attribution' },
    { value: 'referred', label: 'Referred bookings' },
    { value: 'direct', label: 'Direct bookings' }
  ]
};

const CHANNEL_OPTIONS = [
  { value: 'both', label: 'In-app + email' },
  { value: 'in_app', label: 'In-app only' },
  { value: 'email', label: 'Email only' }
];

const SCHEDULE_OPTIONS = [
  { value: 'now', label: 'Send now' },
  { value: 'later', label: 'Schedule later' }
];

const AUTOMATION_TRIGGER_OPTIONS = [
  { value: 'event_starts_24h', label: '24 hours before event' },
  { value: 'event_starts_1h', label: '1 hour before event' },
  { value: 'replay_ready', label: 'Replay is ready' },
  { value: 'booking_abandoned', label: 'Abandoned checkout recovery' },
  { value: 'event_completed_no_show', label: 'No-show follow-up after event' },
  { value: 'event_completed_next_drop', label: 'Next drop follow-up after event' }
];

const JOURNEY_TRIGGER_VALUES = new Set([
  'booking_abandoned',
  'event_completed_next_drop'
]);

const TEMPLATE_LIBRARY = [
  {
    id: 'reminder-24h',
    name: '24h Reminder',
    description: 'Warm up attendees one day before go time.',
    title: "You're on tomorrow's guest list",
    body: 'Your event starts in 24 hours. Open PulseRoom, lock in your must-see sessions, and arrive ready to jump in.',
    channel: 'both',
    triggerType: 'event_starts_24h'
  },
  {
    id: 'reminder-1h',
    name: '1h Reminder',
    description: 'Give attendees a final nudge right before doors open.',
    title: 'Starting soon: your event opens in one hour',
    body: 'You are one hour out from the event. Double-check your agenda, join links, and networking plans before the room opens.',
    channel: 'both',
    triggerType: 'event_starts_1h'
  },
  {
    id: 'replay-ready',
    name: 'Replay Follow-up',
    description: 'Bring people back when the replay goes live.',
    title: 'Replay is live',
    body: 'The replay is ready now. Catch the full event, revisit the best moments, and share it with your team.',
    channel: 'both',
    triggerType: 'replay_ready'
  },
  {
    id: 'abandoned-checkout',
    name: 'Checkout Rescue',
    description: 'Recover attendees who dropped before finishing payment.',
    title: 'Your spot is still warm',
    body: 'You were close to checking out. Jump back in, complete your booking, and lock in your place before tickets move.',
    channel: 'both',
    triggerType: 'booking_abandoned'
  },
  {
    id: 'no-show',
    name: 'No-show Winback',
    description: 'Reconnect with people who missed the live event.',
    title: 'We missed you at the event',
    body: 'You missed the live room, but you are still part of the story. Jump into the replay and catch the sessions that mattered most.',
    channel: 'both',
    triggerType: 'event_completed_no_show'
  },
  {
    id: 'next-drop',
    name: 'Next Drop Follow-up',
    description: 'Send attendees into the organizer\'s next published event after this one wraps.',
    title: 'Keep the momentum going',
    body: 'Thanks for showing up. The next room from this organizer is already live, so grab your seat while the energy is still high.',
    channel: 'both',
    triggerType: 'event_completed_next_drop'
  }
];

const padDatePart = (value) => String(value).padStart(2, '0');

const buildScheduledInputValue = (seedDate = new Date(Date.now() + 2 * 60 * 60 * 1000)) => {
  const nextSlot = new Date(seedDate);
  nextSlot.setMinutes(Math.ceil(nextSlot.getMinutes() / 15) * 15, 0, 0);

  return [
    nextSlot.getFullYear(),
    padDatePart(nextSlot.getMonth() + 1),
    padDatePart(nextSlot.getDate())
  ].join('-') + `T${padDatePart(nextSlot.getHours())}:${padDatePart(nextSlot.getMinutes())}`;
};

const loadCrmSnapshot = async (eventId, filters) => {
  const response = await api.get(`/api/notifications/events/${eventId}/crm`, {
    params: filters
  });
  return response.data.data;
};

const loadJourneyDetail = async (eventId, automationId) => {
  const response = await api.get(
    `/api/notifications/events/${eventId}/crm/automations/${automationId}/journey`
  );
  return response.data.data.journey;
};

const isJourneyTrigger = (triggerType) => JOURNEY_TRIGGER_VALUES.has(triggerType);

const JOURNEY_DETAIL_TABS = [
  { key: 'targetedRecipients', label: 'Targeted' },
  { key: 'clickedRecipients', label: 'Clicked' },
  { key: 'convertedRecipients', label: 'Converted' },
  { key: 'skippedRecipients', label: 'Skipped' }
];

const createJourneySettings = (triggerType = '') => {
  if (triggerType === 'booking_abandoned') {
    return {
      initialDelayMinutes: 30,
      resendEnabled: true,
      resendDelayHours: 12,
      cooldownHours: 72,
      stopOnGoal: true
    };
  }

  if (triggerType === 'event_completed_next_drop') {
    return {
      initialDelayMinutes: 180,
      resendEnabled: true,
      resendDelayHours: 24,
      cooldownHours: 168,
      stopOnGoal: true
    };
  }

  return {
    initialDelayMinutes: 0,
    resendEnabled: false,
    resendDelayHours: 24,
    cooldownHours: 72,
    stopOnGoal: true
  };
};

const createJourneyAbTest = (title = '', body = '') => ({
  enabled: false,
  autoWinnerEnabled: false,
  minimumSampleSize: 50,
  winnerVariantKey: '',
  variants: [
    {
      key: 'A',
      label: 'Variant A',
      title,
      body
    },
    {
      key: 'B',
      label: 'Variant B',
      title: '',
      body: ''
    }
  ]
});

const syncJourneyAbTestVariantA = (journeyAbTest, title, body) => ({
  ...(journeyAbTest || createJourneyAbTest(title, body)),
  variants: [
    {
      key: 'A',
      label: 'Variant A',
      title,
      body
    },
    {
      key: 'B',
      label: 'Variant B',
      title: journeyAbTest?.variants?.[1]?.title || '',
      body: journeyAbTest?.variants?.[1]?.body || ''
    }
  ]
});

const createAutomationDraft = () => ({
  automationId: '',
  name: '',
  title: '',
  body: '',
  channel: 'both',
  triggerType: 'event_starts_24h',
  status: 'active',
  journeySettings: createJourneySettings('event_starts_24h'),
  journeyAbTest: createJourneyAbTest('', '')
});

const createJourneyDetailState = () => ({
  open: false,
  loading: false,
  error: null,
  automationId: '',
  tab: 'targetedRecipients',
  data: null
});

const formatCampaignStatusLabel = (status) => {
  if (status === 'scheduled') {
    return 'Scheduled';
  }
  if (status === 'sending') {
    return 'Sending';
  }
  if (status === 'failed') {
    return 'Needs attention';
  }
  return 'Sent';
};

const formatAutomationStatusLabel = (status) =>
  status === 'paused' ? 'Paused' : 'Active';

const formatPercent = (value) => `${Number(value || 0).toFixed(1).replace(/\.0$/, '')}%`;
const formatOptionalDate = (value, fallback = 'Waiting for activity') =>
  value ? formatDate(value) : fallback;

const JourneyMetric = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[22px] border border-ink/10 bg-white px-4 py-3">
    <p className="text-[11px] uppercase tracking-[0.18em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-2xl ${accent}`}>{value}</p>
  </div>
);

const MetricCard = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

const SegmentButton = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
      active
        ? 'border border-reef/20 bg-reef text-white'
        : 'border border-ink/10 bg-white text-ink/65 hover:bg-sand'
    }`}
  >
    {label}
  </button>
);

const JourneyDetailTabButton = ({ active, label, count, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
      active
        ? 'bg-ink text-sand'
        : 'border border-ink/10 bg-white text-ink/65 hover:bg-sand'
    }`}
  >
    {label} {count ? `(${count})` : ''}
  </button>
);

const JourneyRecipientCard = ({ title, subtitle, chips = [], detail = '' }) => (
  <article className="rounded-[22px] border border-ink/10 bg-sand/45 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-1 text-xs text-ink/50">{subtitle}</p>
      </div>
      {!!chips.length && (
        <div className="flex flex-wrap justify-end gap-2">
          {chips.map((chip) => (
            <span key={chip} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/60">
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
    {detail && (
      <p className="mt-3 text-sm text-ink/65">{detail}</p>
    )}
  </article>
);

const AudienceCrmModal = ({ event, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [savingSegment, setSavingSegment] = useState(false);
  const [deletingSegmentId, setDeletingSegmentId] = useState(null);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [deletingAutomationId, setDeletingAutomationId] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [filters, setFilters] = useState(FILTER_DEFAULTS);
  const deferredSearch = useDeferredValue(filters.search);
  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      search: deferredSearch
    }),
    [deferredSearch, filters]
  );
  const [data, setData] = useState({
    event: null,
    summary: {
      total: null,
      filtered: null
    },
    audience: [],
    segments: [],
    automations: [],
    journeys: {
      summary: null,
      items: []
    },
    recentCampaigns: []
  });
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  const [segmentName, setSegmentName] = useState('');
  const [campaign, setCampaign] = useState({
    title: '',
    body: '',
    channel: 'both',
    scheduleMode: 'now',
    scheduledFor: buildScheduledInputValue()
  });
  const [automationDraft, setAutomationDraft] = useState(createAutomationDraft());
  const [journeyDetail, setJourneyDetail] = useState(createJourneyDetailState());

  useEffect(() => {
    setFilters(FILTER_DEFAULTS);
    setActiveSegmentId(null);
    setSegmentName('');
    setCampaign({
      title: '',
      body: '',
      channel: 'both',
      scheduleMode: 'now',
      scheduledFor: buildScheduledInputValue()
    });
    setAutomationDraft(createAutomationDraft());
    setJourneyDetail(createJourneyDetailState());
  }, [event._id]);

  useEffect(() => {
    let active = true;

    const loadCrm = async () => {
      setLoading(true);
      setError(null);

      try {
        const crmData = await loadCrmSnapshot(event._id, effectiveFilters);
        if (active) {
          setData(crmData);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.message || 'Unable to load audience CRM right now.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadCrm();
    return () => {
      active = false;
    };
  }, [effectiveFilters, event._id]);

  const filteredSummary = data.summary?.filtered || {};
  const totalSummary = data.summary?.total || {};
  const recipientCount = filteredSummary.audienceCount || 0;
  const journeySummary = data.journeys?.summary || {};
  const journeyItems = data.journeys?.items || [];
  const openJourney = journeyItems.find((item) => item.automationId === journeyDetail.automationId) || null;

  const updateFilter = (key, value) => {
    setActiveSegmentId(null);
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  };

  const resetFilters = () => {
    setActiveSegmentId(null);
    setFilters(FILTER_DEFAULTS);
  };

  const handleApplySegment = (segment) => {
    setActiveSegmentId(segment.segmentId);
    setSegmentName(segment.name);
    setFilters({
      ...FILTER_DEFAULTS,
      ...(segment.filters || {})
    });
  };

  const handleSaveSegment = async () => {
    if (!segmentName.trim()) {
      setError('Give this audience segment a name first.');
      return;
    }

    setSavingSegment(true);
    setError(null);
    setStatus(null);

    try {
      const saveResponse = await api.post(`/api/notifications/events/${event._id}/crm/segments`, {
        segmentId: activeSegmentId,
        name: segmentName.trim(),
        filters: effectiveFilters
      });
      setActiveSegmentId(saveResponse.data.data.segment.segmentId);
      setSegmentName(saveResponse.data.data.segment.name);
      setStatus({
        tone: 'success',
        message: activeSegmentId ? 'Audience segment updated.' : 'Audience segment saved.'
      });
      setData(await loadCrmSnapshot(event._id, effectiveFilters));
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save this audience segment.');
    } finally {
      setSavingSegment(false);
    }
  };

  const handleDeleteSegment = async (segmentId) => {
    setDeletingSegmentId(segmentId);
    setError(null);
    setStatus(null);

    try {
      await api.delete(`/api/notifications/events/${event._id}/crm/segments/${segmentId}`);
      if (activeSegmentId === segmentId) {
        setActiveSegmentId(null);
        setSegmentName('');
      }
      setStatus({
        tone: 'success',
        message: 'Audience segment removed.'
      });
      setData(await loadCrmSnapshot(event._id, effectiveFilters));
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || 'Unable to remove this audience segment.');
    } finally {
      setDeletingSegmentId(null);
    }
  };

  const applyTemplateToCampaign = (template) => {
    setCampaign((current) => ({
      ...current,
      title: template.title,
      body: template.body,
      channel: template.channel,
      scheduleMode: 'now'
    }));
    setStatus({
      tone: 'success',
      message: `${template.name} loaded into the campaign composer.`
    });
  };

  const applyTemplateToAutomation = (template) => {
    setAutomationDraft({
      automationId: '',
      name: template.name,
      title: template.title,
      body: template.body,
      channel: template.channel,
      triggerType: template.triggerType,
      status: 'active',
      journeySettings: createJourneySettings(template.triggerType),
      journeyAbTest: createJourneyAbTest(template.title, template.body)
    });
    setStatus({
      tone: 'success',
      message: `${template.name} loaded into the automation builder.`
    });
  };

  const handleSendCampaign = async () => {
    if (!campaign.title.trim() || !campaign.body.trim()) {
      setError('Add both a campaign title and message before sending.');
      return;
    }

    if (campaign.scheduleMode === 'later' && !campaign.scheduledFor) {
      setError('Choose when this campaign should go out.');
      return;
    }

    setSendingCampaign(true);
    setError(null);
    setStatus(null);

    try {
      const response = await api.post(`/api/notifications/events/${event._id}/crm/campaigns`, {
        title: campaign.title.trim(),
        body: campaign.body.trim(),
        channel: campaign.channel,
        scheduleMode: campaign.scheduleMode,
        scheduledFor: campaign.scheduleMode === 'later' ? campaign.scheduledFor : '',
        filters: effectiveFilters,
        segmentId: activeSegmentId || ''
      });
      const savedCampaign = response.data.data.campaign;

      setStatus({
        tone: 'success',
        message:
          savedCampaign.status === 'scheduled'
            ? `Campaign scheduled for ${formatDate(savedCampaign.scheduledFor)}.`
            : savedCampaign.status === 'failed'
              ? savedCampaign.dispatchError || 'Campaign needs attention before it can send.'
              : `Campaign sent to ${savedCampaign.recipientCount} attendee${savedCampaign.recipientCount === 1 ? '' : 's'}.`
      });
      setCampaign((current) => ({
        title: '',
        body: '',
        channel: current.channel,
        scheduleMode: 'now',
        scheduledFor: buildScheduledInputValue()
      }));
      setData(await loadCrmSnapshot(event._id, effectiveFilters));
    } catch (sendError) {
      setError(sendError.response?.data?.message || 'Unable to send this campaign right now.');
    } finally {
      setSendingCampaign(false);
    }
  };

  const handleOpenJourneyDetail = async (automationId) => {
    setJourneyDetail({
      open: true,
      loading: true,
      error: null,
      automationId,
      tab: 'targetedRecipients',
      data: null
    });

    try {
      const detail = await loadJourneyDetail(event._id, automationId);
      setJourneyDetail((current) =>
        current.automationId === automationId
          ? {
              ...current,
              loading: false,
              data: detail
            }
          : current
      );
    } catch (detailError) {
      setJourneyDetail((current) =>
        current.automationId === automationId
          ? {
              ...current,
              loading: false,
              error: detailError.response?.data?.message || 'Unable to load journey detail right now.'
            }
          : current
      );
    }
  };

  const handleCloseJourneyDetail = () => {
    setJourneyDetail(createJourneyDetailState());
  };

  const handleSaveAutomation = async () => {
    if (!automationDraft.name.trim()) {
      setError('Give this automation a name first.');
      return;
    }
    if (!automationDraft.title.trim() || !automationDraft.body.trim()) {
      setError('Add both an automation title and message before saving.');
      return;
    }
    if (
      isJourneyTrigger(automationDraft.triggerType) &&
      automationDraft.journeyAbTest.enabled &&
      (
        !automationDraft.journeyAbTest.variants?.[1]?.title?.trim() ||
        !automationDraft.journeyAbTest.variants?.[1]?.body?.trim()
      )
    ) {
      setError('Add both a title and message for Variant B before enabling A/B testing.');
      return;
    }

    setSavingAutomation(true);
    setError(null);
    setStatus(null);

    try {
      const response = await api.post(`/api/notifications/events/${event._id}/crm/automations`, {
        automationId: automationDraft.automationId,
        name: automationDraft.name.trim(),
        title: automationDraft.title.trim(),
        body: automationDraft.body.trim(),
        channel: automationDraft.channel,
        triggerType: automationDraft.triggerType,
        status: automationDraft.status,
        journeySettings: automationDraft.journeySettings,
        journeyAbTest: automationDraft.journeyAbTest,
        filters: effectiveFilters,
        segmentId: activeSegmentId || ''
      });
      const savedAutomation = response.data.data.automation;
      setStatus({
        tone: 'success',
        message: automationDraft.automationId
          ? `Automation updated: ${savedAutomation.name}.`
          : `Automation saved: ${savedAutomation.name}.`
      });
      setAutomationDraft(createAutomationDraft());
      setData(await loadCrmSnapshot(event._id, effectiveFilters));
      if (journeyDetail.open && journeyDetail.automationId === savedAutomation.automationId) {
        await handleOpenJourneyDetail(savedAutomation.automationId);
      }
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save this automation right now.');
    } finally {
      setSavingAutomation(false);
    }
  };

  const handleEditAutomation = (automation) => {
    setActiveSegmentId(automation.segmentId || null);
    setSegmentName(automation.segmentName || '');
    setFilters({
      ...FILTER_DEFAULTS,
      ...(automation.filters || {})
    });
    setAutomationDraft({
      automationId: automation.automationId,
      name: automation.name,
      title: automation.title,
      body: automation.body,
      channel: automation.channel,
      triggerType: automation.triggerType,
      status: automation.status,
      journeySettings: automation.journeySettings || createJourneySettings(automation.triggerType),
      journeyAbTest: automation.journeyAbTest || createJourneyAbTest(automation.title, automation.body)
    });
    setStatus({
      tone: 'success',
      message: `${automation.name} is ready to edit.`
    });
  };

  const handleDeleteAutomation = async (automationId) => {
    setDeletingAutomationId(automationId);
    setError(null);
    setStatus(null);

    try {
      await api.delete(`/api/notifications/events/${event._id}/crm/automations/${automationId}`);
      if (automationDraft.automationId === automationId) {
        setAutomationDraft(createAutomationDraft());
      }
      if (journeyDetail.automationId === automationId) {
        setJourneyDetail(createJourneyDetailState());
      }
      setStatus({
        tone: 'success',
        message: 'Automation removed.'
      });
      setData(await loadCrmSnapshot(event._id, effectiveFilters));
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || 'Unable to remove this automation.');
    } finally {
      setDeletingAutomationId(null);
    }
  };

  const renderJourneyDetailList = (tabKey, items = []) => {
    if (!items.length) {
      return (
        <div className="rounded-[24px] bg-sand/50 px-5 py-10 text-center">
          <p className="text-sm text-ink/50">Nothing to show in this view yet.</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {items.map((item) => {
          if (tabKey === 'clickedRecipients') {
            return (
              <JourneyRecipientCard
                key={item.userId}
                title={item.attendeeName || item.email || item.userId}
                subtitle={item.email || item.userId}
                chips={[
                  `${item.clickedCount || 0} click${Number(item.clickedCount || 0) === 1 ? '' : 's'}`,
                  ...((item.variantLabels || []).slice(0, 1)),
                  ...((item.touchLabels || []).slice(0, 1))
                ]}
                detail={`First click ${formatOptionalDate(item.firstClickedAt)}${item.convertedAt ? ` | Converted ${formatDate(item.convertedAt)}` : ''}`}
              />
            );
          }

          if (tabKey === 'convertedRecipients') {
            return (
              <JourneyRecipientCard
                key={item.recordId || item.userId}
                title={item.attendeeName || item.email || item.userId}
                subtitle={item.email || item.userId}
                chips={[
                  item.attributedVariantLabel || 'Variant',
                  item.attributedTouchLabel || 'Converted',
                  item.targetEventTitle || 'Target event'
                ]}
                detail={`Converted ${formatDate(item.convertedAt)}${item.targetEventTitle ? ` into ${item.targetEventTitle}` : ''}.`}
              />
            );
          }

          if (tabKey === 'skippedRecipients') {
            return (
              <JourneyRecipientCard
                key={item.userId}
                title={item.attendeeName || item.email || item.userId}
                subtitle={item.email || item.userId}
                chips={[
                  ...((item.reasonLabels || []).slice(0, 2)),
                  ...((item.variantLabels || []).slice(0, 1)),
                  ...((item.touchLabels || []).slice(0, 1))
                ]}
                detail={`Last skipped ${formatOptionalDate(item.lastSkippedAt)}.`}
              />
            );
          }

          return (
            <JourneyRecipientCard
              key={item.userId}
              title={item.attendeeName || item.email || item.userId}
              subtitle={item.email || item.userId}
              chips={[
                `${item.touchCount || 0} touch${Number(item.touchCount || 0) === 1 ? '' : 'es'}`,
                ...((item.variantLabels || []).slice(0, 1)),
                `${item.deliveredCount || 0} delivered`,
                item.clickedCount ? `${item.clickedCount} clicked` : 'No clicks yet'
              ]}
              detail={`First targeted ${formatOptionalDate(item.firstTargetedAt)}${item.convertedAt ? ` | Converted ${formatDate(item.convertedAt)}` : ''}`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="audience-crm-title"
      panelClassName="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-ink/10 bg-white px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-reef">Audience CRM</p>
          <h2 id="audience-crm-title" className="mt-1 font-display text-3xl text-ink">{event.title}</h2>
          <p className="mt-2 text-sm text-ink/55">
            Filter your audience, save reusable segments, and turn strong messages into campaigns or automations.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close audience CRM"
          className="rounded-full p-2 text-ink/50 transition hover:bg-sand hover:text-ink"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-reef border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard label="Audience" value={filteredSummary.audienceCount || 0} />
              <MetricCard label="Checked In" value={filteredSummary.checkedInCount || 0} accent="text-reef" />
              <MetricCard label="No-Shows" value={filteredSummary.noShowCount || 0} accent="text-ember" />
              <MetricCard label="Networking" value={filteredSummary.networkingOptInCount || 0} accent="text-dusk" />
              <MetricCard label="Reserved" value={filteredSummary.reservedSessionCount || 0} accent="text-reef" />
              <MetricCard label="Waitlisted" value={filteredSummary.waitlistedSessionCount || 0} accent="text-ember" />
            </section>

            {error && (
              <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
            )}

            {status && (
              <p className={`rounded-2xl px-4 py-3 text-sm ${
                status.tone === 'success' ? 'bg-reef/10 text-reef' : 'bg-ember/10 text-ember'
              }`}>
                {status.message}
              </p>
            )}

            <section className="rounded-[28px] border border-ink/10 bg-white/80 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Filters</p>
                  <h3 className="mt-1 font-display text-2xl text-ink">Find the right attendees</h3>
                  <p className="mt-2 text-sm text-ink/55">
                    Total audience {totalSummary.audienceCount || 0}. Current view {filteredSummary.audienceCount || 0}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink/65 transition hover:bg-white"
                >
                  Reset filters
                </button>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <input
                  value={filters.search}
                  onChange={(inputEvent) => updateFilter('search', inputEvent.target.value)}
                  placeholder="Search attendee, email, or tier"
                  className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef md:col-span-2 xl:col-span-1"
                />
                {Object.entries(FILTER_OPTIONS).map(([key, options]) => (
                  <select
                    key={key}
                    value={filters[key]}
                    onChange={(inputEvent) => updateFilter(key, inputEvent.target.value)}
                    className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
                  >
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-ink/10 bg-white/80 p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Templates</p>
                <h3 className="mt-1 font-display text-2xl text-ink">Ready-made campaign ideas</h3>
                <p className="mt-2 text-sm text-ink/55">
                  Start with a proven message, then send it now or promote it into an automation for the current filtered audience.
                </p>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {TEMPLATE_LIBRARY.map((template) => (
                  <article key={template.id} className="rounded-[24px] border border-ink/10 bg-sand/50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{template.name}</p>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-dusk">
                        {AUTOMATION_TRIGGER_OPTIONS.find((item) => item.value === template.triggerType)?.label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-ink/65">{template.description}</p>
                    <p className="mt-3 text-sm font-semibold text-ink">{template.title}</p>
                    <p className="mt-1 text-sm text-ink/60">{template.body}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => applyTemplateToCampaign(template)}
                        className="rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink/70 transition hover:bg-sand"
                      >
                        Use for send
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTemplateToAutomation(template)}
                        className="rounded-full bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sand transition hover:opacity-90"
                      >
                        Use for automation
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-ink/10 bg-white/80 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Journeys</p>
                  <h3 className="mt-1 font-display text-2xl text-ink">Automation performance</h3>
                  <p className="mt-2 max-w-3xl text-sm text-ink/55">
                    Track recovery wins and next-drop conversions from the journeys running on this event.
                  </p>
                </div>
                <div className="rounded-[24px] border border-ink/10 bg-sand/55 px-4 py-3 text-sm text-ink/60">
                  {journeyItems.length
                    ? `${journeySummary.activeJourneyCount || 0} live journey${journeySummary.activeJourneyCount === 1 ? '' : 's'}`
                    : 'Journey reporting unlocks after you save a recovery or next-drop automation.'}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <JourneyMetric label="Live Journeys" value={journeySummary.activeJourneyCount || 0} accent="text-reef" />
                <JourneyMetric label="Recovered" value={journeySummary.recoveredCount || 0} accent="text-ember" />
                <JourneyMetric label="Next Drop" value={journeySummary.nextDropConversionCount || 0} accent="text-dusk" />
                <JourneyMetric label="Click Rate" value={formatPercent(journeySummary.clickRate || 0)} />
              </div>

              {!journeyItems.length ? (
                <div className="mt-5 rounded-[24px] bg-sand/50 px-5 py-10 text-center">
                  <p className="text-sm text-ink/50">No journey automation data yet for this event.</p>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  {journeyItems.map((journey) => {
                    const linkedAutomation = data.automations?.find(
                      (automation) => automation.automationId === journey.automationId
                    );

                    return (
                      <article key={journey.automationId} className="rounded-[24px] border border-ink/10 bg-sand/50 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-ink">{journey.name}</p>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            journey.status === 'paused'
                              ? 'bg-white text-ink/60'
                              : 'bg-reef/10 text-reef'
                          }`}>
                            {formatAutomationStatusLabel(journey.status)}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-dusk">
                            {journey.triggerLabel}
                          </span>
                          {journey.targetEventTitle && (
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/60">
                              Target {journey.targetEventTitle}
                            </span>
                          )}
                          {journey.abTestEnabled && (
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-dusk">
                              A/B testing
                            </span>
                          )}
                          {journey.winnerVariantKey && (
                            <span className="rounded-full bg-reef/10 px-2.5 py-1 text-[11px] font-semibold text-reef">
                              Winner {journey.winnerVariantKey}
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-sm text-ink/65">
                          {journey.conversionGoalLabel}
                          {journey.targetEventTitle ? ` into ${journey.targetEventTitle}` : ''}.
                        </p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <JourneyMetric label="Audience" value={journey.uniqueRecipientCount || 0} />
                          <JourneyMetric label="Delivered" value={journey.deliveredCount || 0} accent="text-reef" />
                          <JourneyMetric label="Clicked" value={journey.clickedCount || 0} accent="text-dusk" />
                          <JourneyMetric label="Converted" value={journey.conversionCount || 0} accent="text-ember" />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/55">
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {journey.campaignCount} send{journey.campaignCount === 1 ? '' : 's'}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1">
                            Open {formatPercent(journey.openRate || 0)}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1">
                            Click {formatPercent(journey.clickRate || 0)}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1">
                            Convert {formatPercent(journey.conversionRate || 0)}
                          </span>
                        </div>

                        {journey.variantStats?.length > 0 && (
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {journey.variantStats.map((variant) => (
                              <div key={variant.variantKey} className="rounded-[20px] border border-dusk/15 bg-white p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-ink">{variant.variantLabel}</p>
                                  {variant.winnerSelected && (
                                    <span className="rounded-full bg-reef/10 px-2.5 py-1 text-[11px] font-semibold text-reef">
                                      Winner
                                    </span>
                                  )}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/55">
                                  <span className="rounded-full bg-sand px-2.5 py-1">
                                    {variant.uniqueRecipientCount || 0} targeted
                                  </span>
                                  <span className="rounded-full bg-sand px-2.5 py-1">
                                    {variant.clickedCount || 0} clicked
                                  </span>
                                  <span className="rounded-full bg-sand px-2.5 py-1">
                                    {variant.conversionCount || 0} converted
                                  </span>
                                </div>
                                <p className="mt-3 text-xs text-ink/50">
                                  Click {formatPercent(variant.clickRate || 0)} | Convert {formatPercent(variant.conversionRate || 0)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-ink/45">
                          {journey.latestSentAt
                            ? `Last send ${formatDate(journey.latestSentAt)}`
                            : journey.lastTriggeredAt
                              ? `Triggered ${formatDate(journey.lastTriggeredAt)}`
                              : 'Waiting for first trigger'}
                        </p>
                        {journey.targetEventStartsAt && (
                          <p className="mt-1 text-xs text-ink/45">
                            Target starts {formatDate(journey.targetEventStartsAt)}
                          </p>
                        )}
                        {journey.lastDispatchError && (
                          <p className={`mt-2 text-xs ${
                            journey.lastDispatchStatus === 'failed' ? 'text-ember' : 'text-ink/45'
                          }`}>
                            {journey.lastDispatchError}
                          </p>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenJourneyDetail(journey.automationId)}
                            className="rounded-full bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sand transition hover:opacity-90"
                          >
                            View details
                          </button>
                          {linkedAutomation && (
                            <button
                              type="button"
                              onClick={() => handleEditAutomation(linkedAutomation)}
                              className="rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink/70 transition hover:bg-sand"
                            >
                              Edit journey
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
              <div className="space-y-5 rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Segments</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Saved audiences</h3>
                  </div>
                  <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                    {data.segments?.length || 0} saved
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {data.segments?.length
                    ? data.segments.map((segment) => (
                        <div key={segment.segmentId} className="flex items-center gap-2">
                          <SegmentButton
                            active={activeSegmentId === segment.segmentId}
                            label={segment.name}
                            onClick={() => handleApplySegment(segment)}
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteSegment(segment.segmentId)}
                            disabled={deletingSegmentId === segment.segmentId}
                            className="rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ember transition hover:bg-ember/10 disabled:opacity-60"
                          >
                            {deletingSegmentId === segment.segmentId ? '...' : 'Delete'}
                          </button>
                        </div>
                      ))
                    : (
                      <p className="text-sm text-ink/50">No saved segments yet. Save your current filters to reuse them later.</p>
                    )}
                </div>

                <div className="rounded-[24px] border border-ink/10 bg-sand/50 p-4">
                  <label className="text-xs uppercase tracking-[0.18em] text-ink/45">Segment name</label>
                  <input
                    value={segmentName}
                    onChange={(inputEvent) => setSegmentName(inputEvent.target.value)}
                    placeholder="VIP no-shows, Networking opt-ins, Session waitlist..."
                    className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <button
                    type="button"
                    onClick={handleSaveSegment}
                    disabled={savingSegment}
                    className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-sand disabled:opacity-60"
                  >
                    {savingSegment ? 'Saving...' : activeSegmentId ? 'Update segment' : 'Save current filters'}
                  </button>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Campaigns</p>
                  <h3 className="mt-1 font-display text-2xl text-ink">Send a targeted update</h3>
                  <p className="mt-2 text-sm text-ink/55">
                    This message will go to {recipientCount} attendee{recipientCount === 1 ? '' : 's'} in the current filtered view.
                  </p>
                </div>

                <div className="space-y-3 rounded-[24px] border border-ink/10 bg-sand/50 p-4">
                  <input
                    value={campaign.title}
                    onChange={(inputEvent) =>
                      setCampaign((current) => ({
                        ...current,
                        title: inputEvent.target.value
                      }))
                    }
                    placeholder="Campaign title"
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <textarea
                    value={campaign.body}
                    onChange={(inputEvent) =>
                      setCampaign((current) => ({
                        ...current,
                        body: inputEvent.target.value
                      }))
                    }
                    rows={5}
                    placeholder="Share a reminder, follow-up, replay note, or sponsor update..."
                    className="w-full rounded-[24px] border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <select
                    value={campaign.channel}
                    onChange={(inputEvent) =>
                      setCampaign((current) => ({
                        ...current,
                        channel: inputEvent.target.value
                      }))
                    }
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  >
                    {CHANNEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-3 md:grid-cols-2">
                    {SCHEDULE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setCampaign((current) => ({
                            ...current,
                            scheduleMode: option.value
                          }))
                        }
                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                          campaign.scheduleMode === option.value
                            ? 'border-reef bg-reef/10 text-reef'
                            : 'border-ink/10 bg-white text-ink/70 hover:bg-sand'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {campaign.scheduleMode === 'later' && (
                    <input
                      type="datetime-local"
                      value={campaign.scheduledFor}
                      onChange={(inputEvent) =>
                        setCampaign((current) => ({
                          ...current,
                          scheduledFor: inputEvent.target.value
                        }))
                      }
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleSendCampaign}
                    disabled={sendingCampaign || recipientCount < 1}
                    className="rounded-full bg-reef px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {sendingCampaign
                      ? campaign.scheduleMode === 'later'
                        ? 'Scheduling...'
                        : 'Sending...'
                      : campaign.scheduleMode === 'later'
                        ? `Schedule for ${recipientCount}`
                        : `Send to ${recipientCount}`}
                  </button>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Automations</p>
                  <h3 className="mt-1 font-display text-2xl text-ink">Turn this audience into a workflow</h3>
                  <p className="mt-2 text-sm text-ink/55">
                    Save a reusable trigger for the current filters or active segment so your best follow-ups run on their own.
                  </p>
                </div>

                <div className="space-y-3 rounded-[24px] border border-ink/10 bg-sand/50 p-4">
                  <input
                    value={automationDraft.name}
                    onChange={(inputEvent) =>
                      setAutomationDraft((current) => ({
                        ...current,
                        name: inputEvent.target.value
                      }))
                    }
                    placeholder="Automation name"
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <input
                    value={automationDraft.title}
                    onChange={(inputEvent) =>
                      setAutomationDraft((current) => {
                        const nextTitle = inputEvent.target.value;
                        return {
                          ...current,
                          title: nextTitle,
                          journeyAbTest: syncJourneyAbTestVariantA(
                            current.journeyAbTest,
                            nextTitle,
                            current.body
                          )
                        };
                      })
                    }
                    placeholder="Automation title"
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <textarea
                    value={automationDraft.body}
                    onChange={(inputEvent) =>
                      setAutomationDraft((current) => {
                        const nextBody = inputEvent.target.value;
                        return {
                          ...current,
                          body: nextBody,
                          journeyAbTest: syncJourneyAbTestVariantA(
                            current.journeyAbTest,
                            current.title,
                            nextBody
                          )
                        };
                      })
                    }
                    rows={4}
                    placeholder="What should this automation say when it fires?"
                    className="w-full rounded-[24px] border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <select
                    value={automationDraft.triggerType}
                    onChange={(inputEvent) =>
                      setAutomationDraft((current) => ({
                        ...current,
                        triggerType: inputEvent.target.value,
                        journeySettings: createJourneySettings(inputEvent.target.value),
                        journeyAbTest: createJourneyAbTest(current.title, current.body)
                      }))
                    }
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  >
                    {AUTOMATION_TRIGGER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={automationDraft.channel}
                      onChange={(inputEvent) =>
                        setAutomationDraft((current) => ({
                          ...current,
                          channel: inputEvent.target.value
                        }))
                      }
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                    >
                      {CHANNEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={automationDraft.status}
                      onChange={(inputEvent) =>
                        setAutomationDraft((current) => ({
                          ...current,
                          status: inputEvent.target.value
                        }))
                      }
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
                  {isJourneyTrigger(automationDraft.triggerType) && (
                    <div className="space-y-3 rounded-[22px] border border-dusk/15 bg-white/75 p-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-dusk">Journey optimization</p>
                        <p className="mt-2 text-sm text-ink/60">
                          Add a delay, send one resend automatically, suppress repeat nudges with cooldowns, and stop the journey when the goal is already done.
                        </p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-2 text-sm text-ink/65">
                          <span className="block text-xs uppercase tracking-[0.16em] text-ink/45">Initial delay (minutes)</span>
                          <input
                            type="number"
                            min="0"
                            max="10080"
                            value={automationDraft.journeySettings.initialDelayMinutes}
                            onChange={(inputEvent) =>
                              setAutomationDraft((current) => ({
                                ...current,
                                journeySettings: {
                                  ...current.journeySettings,
                                  initialDelayMinutes: Number(inputEvent.target.value || 0)
                                }
                              }))
                            }
                            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                          />
                        </label>
                        <label className="space-y-2 text-sm text-ink/65">
                          <span className="block text-xs uppercase tracking-[0.16em] text-ink/45">Cooldown (hours)</span>
                          <input
                            type="number"
                            min="0"
                            max="720"
                            value={automationDraft.journeySettings.cooldownHours}
                            onChange={(inputEvent) =>
                              setAutomationDraft((current) => ({
                                ...current,
                                journeySettings: {
                                  ...current.journeySettings,
                                  cooldownHours: Number(inputEvent.target.value || 0)
                                }
                              }))
                            }
                            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                          />
                        </label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-2 text-sm text-ink/65">
                          <span className="block text-xs uppercase tracking-[0.16em] text-ink/45">Resend</span>
                          <select
                            value={automationDraft.journeySettings.resendEnabled ? 'enabled' : 'disabled'}
                            onChange={(inputEvent) =>
                              setAutomationDraft((current) => ({
                                ...current,
                                journeySettings: {
                                  ...current.journeySettings,
                                  resendEnabled: inputEvent.target.value === 'enabled'
                                }
                              }))
                            }
                            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                          >
                            <option value="enabled">One resend</option>
                            <option value="disabled">No resend</option>
                          </select>
                        </label>
                        <label className="space-y-2 text-sm text-ink/65">
                          <span className="block text-xs uppercase tracking-[0.16em] text-ink/45">Resend delay (hours)</span>
                          <input
                            type="number"
                            min="1"
                            max="168"
                            value={automationDraft.journeySettings.resendDelayHours}
                            onChange={(inputEvent) =>
                              setAutomationDraft((current) => ({
                                ...current,
                                journeySettings: {
                                  ...current.journeySettings,
                                  resendDelayHours: Number(inputEvent.target.value || 1)
                                }
                              }))
                            }
                            disabled={!automationDraft.journeySettings.resendEnabled}
                            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef disabled:opacity-50"
                          />
                        </label>
                      </div>
                      <label className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-sand/55 px-4 py-3 text-sm text-ink/65">
                        <input
                          type="checkbox"
                          checked={automationDraft.journeySettings.stopOnGoal}
                          onChange={(inputEvent) =>
                            setAutomationDraft((current) => ({
                              ...current,
                              journeySettings: {
                                ...current.journeySettings,
                                stopOnGoal: inputEvent.target.checked
                              }
                            }))
                          }
                          className="h-4 w-4 rounded border-ink/20 text-reef focus:ring-reef"
                        />
                        Stop future touches after the attendee completes the journey goal.
                      </label>

                      <div className="space-y-3 rounded-[22px] border border-ink/10 bg-sand/40 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-dusk">A/B testing</p>
                            <p className="mt-2 text-sm text-ink/60">
                              The current title and message become Variant A. Add Variant B to split future journey sends and learn which copy converts harder.
                            </p>
                          </div>
                          {automationDraft.journeyAbTest.winnerVariantKey && (
                            <span className="rounded-full bg-reef/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-reef">
                              Winner {automationDraft.journeyAbTest.winnerVariantKey}
                            </span>
                          )}
                        </div>

                        <label className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
                          <input
                            type="checkbox"
                            checked={automationDraft.journeyAbTest.enabled}
                            onChange={(inputEvent) =>
                              setAutomationDraft((current) => ({
                                ...current,
                                journeyAbTest: {
                                  ...syncJourneyAbTestVariantA(current.journeyAbTest, current.title, current.body),
                                  enabled: inputEvent.target.checked,
                                  winnerVariantKey: inputEvent.target.checked
                                    ? current.journeyAbTest.winnerVariantKey || ''
                                    : '',
                                  autoWinnerEnabled: inputEvent.target.checked
                                    ? current.journeyAbTest.autoWinnerEnabled
                                    : false
                                }
                              }))
                            }
                            className="h-4 w-4 rounded border-ink/20 text-dusk focus:ring-dusk"
                          />
                          Split this journey between Variant A and Variant B.
                        </label>

                        {automationDraft.journeyAbTest.enabled && (
                          <div className="space-y-3">
                            <div className="rounded-[20px] border border-dusk/15 bg-white p-4">
                              <p className="text-xs uppercase tracking-[0.16em] text-ink/45">Variant A</p>
                              <p className="mt-2 text-sm text-ink/60">
                                Uses the main title and message fields above.
                              </p>
                            </div>

                            <div className="space-y-3 rounded-[20px] border border-dusk/15 bg-white p-4">
                              <p className="text-xs uppercase tracking-[0.16em] text-dusk">Variant B</p>
                              <input
                                value={automationDraft.journeyAbTest.variants?.[1]?.title || ''}
                                onChange={(inputEvent) =>
                                  setAutomationDraft((current) => ({
                                    ...current,
                                    journeyAbTest: {
                                      ...current.journeyAbTest,
                                      winnerVariantKey: '',
                                      variants: [
                                        current.journeyAbTest.variants?.[0] || {
                                          key: 'A',
                                          label: 'Variant A',
                                          title: current.title,
                                          body: current.body
                                        },
                                        {
                                          key: 'B',
                                          label: 'Variant B',
                                          title: inputEvent.target.value,
                                          body: current.journeyAbTest.variants?.[1]?.body || ''
                                        }
                                      ]
                                    }
                                  }))
                                }
                                placeholder="Variant B title"
                                className="w-full rounded-2xl border border-ink/10 bg-sand/20 px-4 py-3 text-sm outline-none focus:border-dusk"
                              />
                              <textarea
                                value={automationDraft.journeyAbTest.variants?.[1]?.body || ''}
                                onChange={(inputEvent) =>
                                  setAutomationDraft((current) => ({
                                    ...current,
                                    journeyAbTest: {
                                      ...current.journeyAbTest,
                                      winnerVariantKey: '',
                                      variants: [
                                        current.journeyAbTest.variants?.[0] || {
                                          key: 'A',
                                          label: 'Variant A',
                                          title: current.title,
                                          body: current.body
                                        },
                                        {
                                          key: 'B',
                                          label: 'Variant B',
                                          title: current.journeyAbTest.variants?.[1]?.title || '',
                                          body: inputEvent.target.value
                                        }
                                      ]
                                    }
                                  }))
                                }
                                rows={4}
                                placeholder="Variant B message"
                                className="w-full rounded-[20px] border border-ink/10 bg-sand/20 px-4 py-3 text-sm outline-none focus:border-dusk"
                              />
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
                                <input
                                  type="checkbox"
                                  checked={automationDraft.journeyAbTest.autoWinnerEnabled}
                                  onChange={(inputEvent) =>
                                    setAutomationDraft((current) => ({
                                      ...current,
                                      journeyAbTest: {
                                        ...current.journeyAbTest,
                                        autoWinnerEnabled: inputEvent.target.checked,
                                        winnerVariantKey: inputEvent.target.checked
                                          ? current.journeyAbTest.winnerVariantKey || ''
                                          : ''
                                      }
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-ink/20 text-dusk focus:ring-dusk"
                                />
                                Auto-pick a winner once enough conversions land.
                              </label>
                              <label className="space-y-2 text-sm text-ink/65">
                                <span className="block text-xs uppercase tracking-[0.16em] text-ink/45">Minimum sample per variant</span>
                                <input
                                  type="number"
                                  min="10"
                                  max="100000"
                                  value={automationDraft.journeyAbTest.minimumSampleSize}
                                  onChange={(inputEvent) =>
                                    setAutomationDraft((current) => ({
                                      ...current,
                                      journeyAbTest: {
                                        ...current.journeyAbTest,
                                        minimumSampleSize: Number(inputEvent.target.value || 10),
                                        winnerVariantKey: ''
                                      }
                                    }))
                                  }
                                  disabled={!automationDraft.journeyAbTest.autoWinnerEnabled}
                                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-dusk disabled:opacity-50"
                                />
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveAutomation}
                      disabled={savingAutomation}
                      className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-sand disabled:opacity-60"
                    >
                      {savingAutomation
                        ? 'Saving...'
                        : automationDraft.automationId
                          ? 'Update automation'
                          : 'Save automation'}
                    </button>
                    {automationDraft.automationId && (
                      <button
                        type="button"
                        onClick={() => setAutomationDraft(createAutomationDraft())}
                        className="rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink/70 transition hover:bg-sand"
                      >
                        Clear editor
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-5 rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Audience</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Who matches right now</h3>
                  </div>
                  <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                    {data.audience?.length || 0} rows
                  </span>
                </div>

                {!data.audience?.length ? (
                  <div className="rounded-[24px] bg-sand/50 px-5 py-10 text-center">
                    <p className="text-sm text-ink/50">No attendees match these filters yet.</p>
                  </div>
                ) : (
                  <div className="max-h-[28rem] overflow-y-auto rounded-[24px] border border-ink/10">
                    <table className="min-w-full divide-y divide-ink/10 text-sm">
                      <thead className="sticky top-0 bg-white/95 backdrop-blur">
                        <tr className="text-left text-xs uppercase tracking-[0.16em] text-ink/45">
                          <th className="px-4 py-3">Attendee</th>
                          <th className="px-4 py-3">Tier</th>
                          <th className="px-4 py-3">Tickets</th>
                          <th className="px-4 py-3">Check-in</th>
                          <th className="px-4 py-3">Networking</th>
                          <th className="px-4 py-3">Sessions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/8 bg-sand/35">
                        {data.audience.map((attendee) => (
                          <tr key={attendee.userId}>
                            <td className="px-4 py-3 align-top">
                              <p className="font-semibold text-ink">{attendee.attendeeName}</p>
                              <p className="mt-1 text-xs text-ink/50">{attendee.email || 'No email captured'}</p>
                              <p className="mt-1 text-xs text-ink/40">
                                Joined {formatDate(attendee.confirmedAt)}
                              </p>
                            </td>
                            <td className="px-4 py-3 align-top text-ink/70">{attendee.tierName || 'General'}</td>
                            <td className="px-4 py-3 align-top text-ink/70">
                              {attendee.ticketCount}
                              {attendee.ticketCount > 1 && (
                                <span className="ml-2 rounded-full bg-dusk/10 px-2 py-0.5 text-[11px] font-semibold text-dusk">
                                  Multi
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-wrap gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  attendee.hasCheckedIn ? 'bg-reef/10 text-reef' : 'bg-sand text-ink/60'
                                }`}>
                                  {attendee.checkedInCount}/{attendee.ticketCount} checked in
                                </span>
                                {attendee.isNoShow && (
                                  <span className="rounded-full bg-ember/10 px-2.5 py-1 text-[11px] font-semibold text-ember">
                                    No-show
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                attendee.isNetworkingOptedIn ? 'bg-dusk/10 text-dusk' : 'bg-sand text-ink/60'
                              }`}>
                                {attendee.isNetworkingOptedIn ? 'Opted in' : 'Not opted in'}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-wrap gap-2">
                                {attendee.registeredSessionCount > 0 && (
                                  <span className="rounded-full bg-reef/10 px-2.5 py-1 text-[11px] font-semibold text-reef">
                                    {attendee.registeredSessionCount} reserved
                                  </span>
                                )}
                                {attendee.waitlistedSessionCount > 0 && (
                                  <span className="rounded-full bg-ember/10 px-2.5 py-1 text-[11px] font-semibold text-ember">
                                    {attendee.waitlistedSessionCount} waitlisted
                                  </span>
                                )}
                                {!attendee.registeredSessionCount && !attendee.waitlistedSessionCount && (
                                  <span className="rounded-full bg-sand px-2.5 py-1 text-[11px] font-semibold text-ink/60">
                                    No session activity
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Automations</p>
                      <h3 className="mt-1 font-display text-2xl text-ink">Live workflows</h3>
                    </div>
                  </div>

                  {!data.automations?.length ? (
                    <div className="mt-4 rounded-[24px] bg-sand/50 px-5 py-8 text-center">
                      <p className="text-sm text-ink/50">No automations saved yet for this event.</p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {data.automations.map((automation) => (
                        <article key={automation.automationId} className="rounded-[24px] border border-ink/10 bg-sand/55 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-ink">{automation.name}</p>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              automation.status === 'paused'
                                ? 'bg-sand text-ink/60'
                                : 'bg-reef/10 text-reef'
                            }`}>
                              {formatAutomationStatusLabel(automation.status)}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-dusk">
                              {automation.triggerLabel}
                            </span>
                            {automation.segmentName && (
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/60">
                                {automation.segmentName}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm font-semibold text-ink">{automation.title}</p>
                          <p className="mt-1 text-sm text-ink/65">{automation.body}</p>
                          {isJourneyTrigger(automation.triggerType) && automation.journeySettings && (
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/55">
                              <span className="rounded-full bg-white px-2.5 py-1">
                                Delay {automation.journeySettings.initialDelayMinutes || 0}m
                              </span>
                              <span className="rounded-full bg-white px-2.5 py-1">
                                Cooldown {automation.journeySettings.cooldownHours || 0}h
                              </span>
                              <span className="rounded-full bg-white px-2.5 py-1">
                                {automation.journeySettings.resendEnabled
                                  ? `1 resend / ${automation.journeySettings.resendDelayHours || 24}h`
                                  : 'No resend'}
                              </span>
                              <span className="rounded-full bg-white px-2.5 py-1">
                                {automation.journeySettings.stopOnGoal ? 'Stop on goal' : 'Keep going'}
                              </span>
                            </div>
                          )}
                          {isJourneyTrigger(automation.triggerType) && automation.journeyAbTest?.enabled && (
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-dusk">
                              <span className="rounded-full bg-white px-2.5 py-1">A/B live</span>
                              <span className="rounded-full bg-white px-2.5 py-1">
                                {automation.journeyAbTest.autoWinnerEnabled
                                  ? `Auto winner / ${automation.journeyAbTest.minimumSampleSize}`
                                  : 'Balanced split'}
                              </span>
                              {automation.journeyAbTest.winnerVariantKey && (
                                <span className="rounded-full bg-reef/10 px-2.5 py-1 text-reef">
                                  Winner {automation.journeyAbTest.winnerVariantKey}
                                </span>
                              )}
                            </div>
                          )}
                          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-ink/45">
                            {automation.scheduledFor
                              ? `Scheduled ${formatDate(automation.scheduledFor)}`
                              : automation.lastTriggeredAt
                                ? `Triggered ${formatDate(automation.lastTriggeredAt)}`
                                : 'Waiting for trigger'}
                          </p>
                          {automation.lastDispatchStatus && (
                            <p className={`mt-1 text-xs ${
                              automation.lastDispatchStatus === 'failed' ? 'text-ember' : 'text-ink/45'
                            }`}>
                              Last result: {automation.lastDispatchStatus}
                              {automation.lastDispatchError ? ` | ${automation.lastDispatchError}` : ''}
                            </p>
                          )}
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditAutomation(automation)}
                              className="rounded-full border border-ink/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink/70 transition hover:bg-sand"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAutomation(automation.automationId)}
                              disabled={deletingAutomationId === automation.automationId}
                              className="rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ember transition hover:bg-ember/10 disabled:opacity-60"
                            >
                              {deletingAutomationId === automation.automationId ? 'Removing...' : 'Delete'}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Recent campaigns</p>
                      <h3 className="mt-1 font-display text-2xl text-ink">Send history</h3>
                    </div>
                  </div>

                  {!data.recentCampaigns?.length ? (
                    <div className="mt-4 rounded-[24px] bg-sand/50 px-5 py-8 text-center">
                      <p className="text-sm text-ink/50">No campaigns created yet for this event.</p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {data.recentCampaigns.map((campaignItem) => (
                        <article key={campaignItem.campaignId} className="rounded-[24px] border border-ink/10 bg-sand/55 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-ink">{campaignItem.title}</p>
                            {campaignItem.automationName ? (
                              <span className="rounded-full bg-dusk/10 px-2.5 py-1 text-[11px] font-semibold text-dusk">
                                {campaignItem.automationName}
                              </span>
                            ) : campaignItem.segmentName ? (
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-dusk">
                                {campaignItem.segmentName}
                              </span>
                            ) : null}
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              campaignItem.status === 'failed'
                                ? 'bg-ember/10 text-ember'
                                : campaignItem.status === 'scheduled'
                                  ? 'bg-dusk/10 text-dusk'
                                  : 'bg-white text-ink/60'
                            }`}>
                              {formatCampaignStatusLabel(campaignItem.status)}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/60">
                              {campaignItem.sourceType === 'automation' ? 'Auto' : 'Manual'}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink/60">
                              {campaignItem.channel.replace('_', ' ')}
                            </span>
                            {campaignItem.variantMeta?.variantLabel && (
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-dusk">
                                {campaignItem.variantMeta.variantLabel}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm text-ink/65">{campaignItem.body}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/55">
                            <span className="rounded-full bg-white px-2.5 py-1">
                              {campaignItem.recipientCount} recipients
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1">
                              {campaignItem.analytics?.deliveredCount || 0}/{campaignItem.analytics?.targetDeliveryCount || 0} delivered
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1">
                              {campaignItem.analytics?.openedCount || 0} opened
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1">
                              {campaignItem.analytics?.clickedCount || 0} clicked
                            </span>
                          </div>
                          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-ink/45">
                            {campaignItem.status === 'scheduled' && campaignItem.scheduledFor
                              ? `Scheduled ${formatDate(campaignItem.scheduledFor)}`
                              : campaignItem.sentAt
                                ? `Sent ${formatDate(campaignItem.sentAt)}`
                                : `Created ${formatDate(campaignItem.createdAt)}`}
                          </p>
                          <p className="mt-1 text-xs text-ink/45">
                            Open rate {campaignItem.analytics?.openRate || 0}% | Click rate {campaignItem.analytics?.clickRate || 0}%
                          </p>
                          {campaignItem.dispatchError && (
                            <p className={`mt-2 text-xs ${
                              campaignItem.status === 'failed' ? 'text-ember' : 'text-ink/45'
                            }`}>
                              {campaignItem.dispatchError}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {journeyDetail.open && (
        <>
          <button
            type="button"
            onClick={handleCloseJourneyDetail}
            aria-label="Close journey detail"
            className="absolute inset-0 z-20 bg-ink/20 backdrop-blur-[2px]"
          />
          <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-2xl flex-col border-l border-ink/10 bg-white shadow-bloom">
            <div className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-dusk">Journey detail</p>
                <h3 className="mt-1 font-display text-3xl text-ink">
                  {journeyDetail.data?.automation?.name || openJourney?.name || 'Journey'}
                </h3>
                <p className="mt-2 text-sm text-ink/55">
                  {journeyDetail.data?.automation?.conversionGoalLabel || openJourney?.conversionGoalLabel || 'Conversion goal'}
                  {journeyDetail.data?.automation?.targetEventTitle || openJourney?.targetEventTitle
                    ? ` into ${journeyDetail.data?.automation?.targetEventTitle || openJourney?.targetEventTitle}`
                    : ''}
                  .
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseJourneyDetail}
                className="rounded-full p-2 text-ink/50 transition hover:bg-sand hover:text-ink"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {journeyDetail.loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-dusk border-t-transparent" />
                </div>
              ) : journeyDetail.error ? (
                <div className="rounded-[24px] border border-ember/20 bg-ember/5 px-5 py-6 text-sm text-ember">
                  {journeyDetail.error}
                </div>
              ) : journeyDetail.data ? (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <JourneyMetric
                      label="Targeted"
                      value={journeyDetail.data.summary?.targetedRecipientCount || 0}
                    />
                    <JourneyMetric
                      label="Converted"
                      value={journeyDetail.data.summary?.convertedRecipientCount || 0}
                      accent="text-ember"
                    />
                    <JourneyMetric
                      label="Skipped"
                      value={journeyDetail.data.summary?.skippedRecipientCount || 0}
                      accent="text-dusk"
                    />
                    <JourneyMetric
                      label="Click Rate"
                      value={formatPercent(journeyDetail.data.summary?.clickRate || 0)}
                      accent="text-reef"
                    />
                  </div>

                  {journeyDetail.data.variantSummaries?.length > 0 && (
                    <section className="rounded-[28px] border border-ink/10 bg-white/90 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Variants</p>
                          <h4 className="mt-1 font-display text-2xl text-ink">Experiment split</h4>
                        </div>
                        {journeyDetail.data.summary?.winnerVariantKey && (
                          <span className="rounded-full bg-reef/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-reef">
                            Winner {journeyDetail.data.summary.winnerVariantKey}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {journeyDetail.data.variantSummaries.map((variant) => (
                          <article key={variant.variantKey} className="rounded-[22px] border border-dusk/15 bg-sand/35 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-ink">{variant.variantLabel}</p>
                              {variant.winnerSelected && (
                                <span className="rounded-full bg-reef/10 px-2.5 py-1 text-[11px] font-semibold text-reef">
                                  Winner
                                </span>
                              )}
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              <JourneyMetric label="Targeted" value={variant.uniqueRecipientCount || 0} />
                              <JourneyMetric label="Converted" value={variant.conversionCount || 0} accent="text-ember" />
                            </div>
                            <p className="mt-3 text-xs text-ink/50">
                              Delivered {variant.deliveredCount || 0} | Clicked {variant.clickedCount || 0}
                            </p>
                            <p className="mt-1 text-xs text-ink/50">
                              Click {formatPercent(variant.clickRate || 0)} | Convert {formatPercent(variant.conversionRate || 0)}
                            </p>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="rounded-[28px] border border-ink/10 bg-sand/35 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Touches</p>
                        <h4 className="mt-1 font-display text-2xl text-ink">Send timeline</h4>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs text-ink/50">
                        {journeyDetail.data.touches?.length || 0} touch{journeyDetail.data.touches?.length === 1 ? '' : 'es'}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {journeyDetail.data.touches?.map((touch) => (
                        <article key={touch.campaignId} className="rounded-[22px] border border-ink/10 bg-white p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-ink">{touch.touchLabel}</p>
                            {touch.variantLabel && (
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-dusk">
                                {touch.variantLabel}
                              </span>
                            )}
                            {touch.winnerSelected && (
                              <span className="rounded-full bg-reef/10 px-2.5 py-1 text-[11px] font-semibold text-reef">
                                Winner
                              </span>
                            )}
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              touch.status === 'failed'
                                ? 'bg-ember/10 text-ember'
                                : touch.status === 'scheduled'
                                  ? 'bg-dusk/10 text-dusk'
                                  : 'bg-reef/10 text-reef'
                            }`}>
                              {formatCampaignStatusLabel(touch.status)}
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <JourneyMetric label="Targeted" value={touch.targetedRecipientCount || 0} />
                            <JourneyMetric label="Delivered" value={touch.deliveredCount || 0} accent="text-reef" />
                            <JourneyMetric label="Clicked" value={touch.clickedCount || 0} accent="text-dusk" />
                            <JourneyMetric label="Converted" value={touch.convertedCount || 0} accent="text-ember" />
                          </div>

                          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-ink/45">
                            {touch.status === 'scheduled' && touch.scheduledFor
                              ? `Scheduled ${formatDate(touch.scheduledFor)}`
                              : touch.sentAt
                                ? `Sent ${formatDate(touch.sentAt)}`
                                : `Created ${formatDate(touch.createdAt)}`}
                          </p>
                          <p className="mt-1 text-xs text-ink/45">
                            Click {formatPercent(touch.clickRate || 0)} | Convert {formatPercent(touch.conversionRate || 0)}
                            {touch.skippedRecipientCount
                              ? ` | Skipped ${touch.skippedRecipientCount} (${touch.cooldownSkippedCount || 0} cooldown, ${touch.goalSkippedCount || 0} goal)`
                              : ''}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-ink/10 bg-white/90 p-4">
                    <div className="flex flex-wrap gap-2">
                      {JOURNEY_DETAIL_TABS.map((tab) => (
                        <JourneyDetailTabButton
                          key={tab.key}
                          active={journeyDetail.tab === tab.key}
                          label={tab.label}
                          count={journeyDetail.data?.[tab.key]?.length || 0}
                          onClick={() => setJourneyDetail((current) => ({
                            ...current,
                            tab: tab.key
                          }))}
                        />
                      ))}
                    </div>

                    <div className="mt-4">
                      {renderJourneyDetailList(
                        journeyDetail.tab,
                        journeyDetail.data?.[journeyDetail.tab] || []
                      )}
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          </aside>
        </>
      )}
    </ModalShell>
  );
};

export default AudienceCrmModal;
