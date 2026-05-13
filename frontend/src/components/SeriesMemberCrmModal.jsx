import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/formatters';
import ModalShell from './ModalShell';

const FILTER_DEFAULTS = {
  search: '',
  source: 'all',
  joinedWindow: 'all',
  planType: 'all',
  replayAccess: 'all',
  vipNetworking: 'all'
};

const FILTER_OPTIONS = {
  source: [
    { value: 'all', label: 'All join sources' },
    { value: 'self_join', label: 'Self-joined members' },
    { value: 'organizer_grant', label: 'Organizer-granted members' }
  ],
  joinedWindow: [
    { value: 'all', label: 'All join windows' },
    { value: 'last_7_days', label: 'Joined in last 7 days' },
    { value: 'last_30_days', label: 'Joined in last 30 days' },
    { value: 'older', label: 'Joined earlier' }
  ],
  planType: [
    { value: 'all', label: 'All plan types' },
    { value: 'paid', label: 'Paid memberships' },
    { value: 'free', label: 'Free memberships' }
  ],
  replayAccess: [
    { value: 'all', label: 'All replay access' },
    { value: 'included', label: 'Replay included' },
    { value: 'not-included', label: 'Replay not included' }
  ],
  vipNetworking: [
    { value: 'all', label: 'All networking perks' },
    { value: 'enabled', label: 'VIP networking enabled' },
    { value: 'not-enabled', label: 'VIP networking not enabled' }
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
  { value: 'series_membership_activated', label: 'When a member joins' },
  { value: 'series_next_event_24h', label: '24 hours before next drop' }
];

const TEMPLATE_LIBRARY = [
  {
    id: 'series-welcome',
    name: 'Member Welcome',
    description: 'Launch a smooth first-touch drip the second a pass becomes active.',
    title: 'Welcome to the series',
    body: 'Your pass is active now. Open the series hub, explore upcoming drops, and use your member perks before the next room opens.',
    channel: 'both',
    triggerType: 'series_membership_activated'
  },
  {
    id: 'series-24h',
    name: 'Next Drop Reminder',
    description: 'Bring active members back one day before the next live session.',
    title: 'Tomorrow: your next series drop is live',
    body: 'We are 24 hours out from the next drop. Check the agenda, claim any member pricing, and show up ready for the next room.',
    channel: 'both',
    triggerType: 'series_next_event_24h'
  },
  {
    id: 'vip-activation',
    name: 'VIP Networking Nudge',
    description: 'Prompt networking-enabled members to use the premium perks they unlocked.',
    title: 'Your VIP networking perks are live',
    body: 'You unlocked networking perks with this series pass. Jump into the hub, review upcoming drops, and make the most of the people in the room.',
    channel: 'both',
    triggerType: 'series_membership_activated'
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

const loadSeriesCrmSnapshot = async (seriesId, filters) => {
  const response = await api.get(`/api/notifications/series/${seriesId}/crm`, {
    params: filters
  });
  return response.data.data;
};

const createAutomationDraft = () => ({
  automationId: '',
  name: '',
  title: '',
  body: '',
  channel: 'both',
  triggerType: 'series_membership_activated',
  status: 'active'
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

const SeriesMemberCrmModal = ({ series, onClose }) => {
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
    series: null,
    summary: {
      total: null,
      filtered: null
    },
    audience: [],
    segments: [],
    automations: [],
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
  }, [series._id]);

  useEffect(() => {
    let active = true;

    const loadCrm = async () => {
      setLoading(true);
      setError(null);

      try {
        const crmData = await loadSeriesCrmSnapshot(series._id, effectiveFilters);
        if (active) {
          setData(crmData);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.message || 'Unable to load series member CRM right now.');
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
  }, [effectiveFilters, series._id]);

  const filteredSummary = data.summary?.filtered || {};
  const totalSummary = data.summary?.total || {};
  const recipientCount = filteredSummary.memberCount || 0;

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

  const refreshCrm = async () => {
    setData(await loadSeriesCrmSnapshot(series._id, effectiveFilters));
  };

  const handleSaveSegment = async () => {
    if (!segmentName.trim()) {
      setError('Give this member segment a name first.');
      return;
    }

    setSavingSegment(true);
    setError(null);
    setStatus(null);

    try {
      const response = await api.post(`/api/notifications/series/${series._id}/crm/segments`, {
        segmentId: activeSegmentId,
        name: segmentName.trim(),
        filters: effectiveFilters
      });
      setActiveSegmentId(response.data.data.segment.segmentId);
      setSegmentName(response.data.data.segment.name);
      setStatus({
        tone: 'success',
        message: activeSegmentId ? 'Member segment updated.' : 'Member segment saved.'
      });
      await refreshCrm();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save this member segment.');
    } finally {
      setSavingSegment(false);
    }
  };

  const handleDeleteSegment = async (segmentId) => {
    setDeletingSegmentId(segmentId);
    setError(null);
    setStatus(null);

    try {
      await api.delete(`/api/notifications/series/${series._id}/crm/segments/${segmentId}`);
      if (activeSegmentId === segmentId) {
        setActiveSegmentId(null);
        setSegmentName('');
      }
      setStatus({
        tone: 'success',
        message: 'Member segment removed.'
      });
      await refreshCrm();
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || 'Unable to remove this member segment.');
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
      status: 'active'
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
      const response = await api.post(`/api/notifications/series/${series._id}/crm/campaigns`, {
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
              : `Campaign sent to ${savedCampaign.recipientCount} member${savedCampaign.recipientCount === 1 ? '' : 's'}.`
      });
      setCampaign((current) => ({
        title: '',
        body: '',
        channel: current.channel,
        scheduleMode: 'now',
        scheduledFor: buildScheduledInputValue()
      }));
      await refreshCrm();
    } catch (sendError) {
      setError(sendError.response?.data?.message || 'Unable to send this member campaign right now.');
    } finally {
      setSendingCampaign(false);
    }
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

    setSavingAutomation(true);
    setError(null);
    setStatus(null);

    try {
      const response = await api.post(`/api/notifications/series/${series._id}/crm/automations`, {
        automationId: automationDraft.automationId,
        name: automationDraft.name.trim(),
        title: automationDraft.title.trim(),
        body: automationDraft.body.trim(),
        channel: automationDraft.channel,
        triggerType: automationDraft.triggerType,
        status: automationDraft.status,
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
      await refreshCrm();
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
      status: automation.status
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
      await api.delete(`/api/notifications/series/${series._id}/crm/automations/${automationId}`);
      if (automationDraft.automationId === automationId) {
        setAutomationDraft(createAutomationDraft());
      }
      setStatus({
        tone: 'success',
        message: 'Automation removed.'
      });
      await refreshCrm();
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || 'Unable to remove this automation.');
    } finally {
      setDeletingAutomationId(null);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="series-member-crm-title"
      panelClassName="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-ink/10 bg-white px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-reef">Series Member CRM</p>
          <h2 id="series-member-crm-title" className="mt-1 font-display text-3xl text-ink">{series.name}</h2>
          <p className="mt-2 text-sm text-ink/55">
            Shape member segments, schedule targeted drips, and automate the moments that keep the series alive between drops.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close series member CRM"
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
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Members" value={filteredSummary.memberCount || 0} />
              <MetricCard label="Paid" value={filteredSummary.paidMemberCount || 0} accent="text-reef" />
              <MetricCard label="Recent" value={filteredSummary.recentJoinCount || 0} accent="text-dusk" />
              <MetricCard label="Replay" value={filteredSummary.replayAccessCount || 0} accent="text-reef" />
              <MetricCard label="VIP" value={filteredSummary.vipNetworkingCount || 0} accent="text-ember" />
            </section>

            {error && (
              <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
            )}

            {status && (
              <p className={`rounded-2xl px-4 py-3 text-sm ${
                status.tone === 'success' ? 'bg-reef/10 text-reef' : 'bg-dusk/10 text-dusk'
              }`}>
                {status.message}
              </p>
            )}

            <section className="rounded-[28px] border border-ink/10 bg-white/80 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Filters</p>
                  <h3 className="mt-1 font-display text-2xl text-ink">Find the right members</h3>
                  <p className="mt-2 text-sm text-ink/55">
                    Total members {totalSummary.memberCount || 0}. Current view {filteredSummary.memberCount || 0}.
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
                  onChange={(event) => updateFilter('search', event.target.value)}
                  placeholder="Search member, email, or plan"
                  className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef md:col-span-2 xl:col-span-1"
                />
                {Object.entries(FILTER_OPTIONS).map(([key, options]) => (
                  <select
                    key={key}
                    value={filters[key]}
                    onChange={(event) => updateFilter(key, event.target.value)}
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
                <h3 className="mt-1 font-display text-2xl text-ink">Ready-made member plays</h3>
                <p className="mt-2 text-sm text-ink/55">
                  Start with a strong lifecycle message, then send it now or promote it into a series automation for the current filtered view.
                </p>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-3">
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

            <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
              <div className="space-y-5 rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Segments</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Saved member views</h3>
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
                    onChange={(event) => setSegmentName(event.target.value)}
                    placeholder="Paid VIPs, Fresh joins, Replay-heavy members..."
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
                  <h3 className="mt-1 font-display text-2xl text-ink">Send a targeted member update</h3>
                  <p className="mt-2 text-sm text-ink/55">
                    This message will go to {recipientCount} member{recipientCount === 1 ? '' : 's'} in the current filtered view.
                  </p>
                </div>

                <div className="space-y-3 rounded-[24px] border border-ink/10 bg-sand/50 p-4">
                  <input
                    value={campaign.title}
                    onChange={(event) =>
                      setCampaign((current) => ({
                        ...current,
                        title: event.target.value
                      }))
                    }
                    placeholder="Campaign title"
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <textarea
                    value={campaign.body}
                    onChange={(event) =>
                      setCampaign((current) => ({
                        ...current,
                        body: event.target.value
                      }))
                    }
                    rows={5}
                    placeholder="Share a perk reminder, next-drop note, or welcome message..."
                    className="w-full rounded-[24px] border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <select
                    value={campaign.channel}
                    onChange={(event) =>
                      setCampaign((current) => ({
                        ...current,
                        channel: event.target.value
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
                      onChange={(event) =>
                        setCampaign((current) => ({
                          ...current,
                          scheduledFor: event.target.value
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
                  <h3 className="mt-1 font-display text-2xl text-ink">Build member lifecycle flows</h3>
                  <p className="mt-2 text-sm text-ink/55">
                    Turn this filtered audience into a reusable workflow for new members or the next series drop.
                  </p>
                </div>

                <div className="space-y-3 rounded-[24px] border border-ink/10 bg-sand/50 p-4">
                  <input
                    value={automationDraft.name}
                    onChange={(event) =>
                      setAutomationDraft((current) => ({
                        ...current,
                        name: event.target.value
                      }))
                    }
                    placeholder="Automation name"
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <input
                    value={automationDraft.title}
                    onChange={(event) =>
                      setAutomationDraft((current) => ({
                        ...current,
                        title: event.target.value
                      }))
                    }
                    placeholder="Automation title"
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <textarea
                    value={automationDraft.body}
                    onChange={(event) =>
                      setAutomationDraft((current) => ({
                        ...current,
                        body: event.target.value
                      }))
                    }
                    rows={4}
                    placeholder="What should this automation say when it fires?"
                    className="w-full rounded-[24px] border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <select
                    value={automationDraft.triggerType}
                    onChange={(event) =>
                      setAutomationDraft((current) => ({
                        ...current,
                        triggerType: event.target.value
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
                      onChange={(event) =>
                        setAutomationDraft((current) => ({
                          ...current,
                          channel: event.target.value
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
                      onChange={(event) =>
                        setAutomationDraft((current) => ({
                          ...current,
                          status: event.target.value
                        }))
                      }
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
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
                    <p className="text-sm text-ink/50">No members match these filters yet.</p>
                  </div>
                ) : (
                  <div className="max-h-[28rem] overflow-y-auto rounded-[24px] border border-ink/10">
                    <table className="min-w-full divide-y divide-ink/10 text-sm">
                      <thead className="sticky top-0 bg-white/95 backdrop-blur">
                        <tr className="text-left text-xs uppercase tracking-[0.16em] text-ink/45">
                          <th className="px-4 py-3">Member</th>
                          <th className="px-4 py-3">Source</th>
                          <th className="px-4 py-3">Plan</th>
                          <th className="px-4 py-3">Joined</th>
                          <th className="px-4 py-3">Perks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/8 bg-sand/35">
                        {data.audience.map((member) => (
                          <tr key={member.userId}>
                            <td className="px-4 py-3 align-top">
                              <p className="font-semibold text-ink">{member.attendeeName}</p>
                              <p className="mt-1 text-xs text-ink/50">{member.email || 'No email captured'}</p>
                              {member.lastUsedAt && (
                                <p className="mt-1 text-xs text-ink/40">Last used {formatDate(member.lastUsedAt)}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top text-ink/70">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                member.source === 'organizer_grant'
                                  ? 'bg-dusk/10 text-dusk'
                                  : 'bg-sand text-ink/65'
                              }`}>
                                {member.source === 'organizer_grant' ? 'Organizer grant' : 'Self join'}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top text-ink/70">
                              <p className="font-semibold text-ink">{member.planName || 'Series Pass'}</p>
                              <p className="mt-1 text-xs text-ink/45">
                                {member.price > 0 ? formatCurrency(member.price, member.currency) : 'Free pass'}
                              </p>
                            </td>
                            <td className="px-4 py-3 align-top text-ink/70">
                              {member.joinedAt ? formatDate(member.joinedAt) : 'Unknown'}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-wrap gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  member.includesReplayLibrary ? 'bg-reef/10 text-reef' : 'bg-sand text-ink/60'
                                }`}>
                                  {member.includesReplayLibrary ? 'Replay' : 'No replay'}
                                </span>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  member.vipNetworking ? 'bg-ember/10 text-ember' : 'bg-sand text-ink/60'
                                }`}>
                                  {member.vipNetworking ? 'VIP networking' : 'Standard'}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Automations</p>
                  <h3 className="mt-1 font-display text-2xl text-ink">Live workflows</h3>

                  {!data.automations?.length ? (
                    <div className="mt-4 rounded-[24px] bg-sand/50 px-5 py-8 text-center">
                      <p className="text-sm text-ink/50">No automations saved yet for this series.</p>
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
                          </div>
                          <p className="mt-3 text-sm font-semibold text-ink">{automation.title}</p>
                          <p className="mt-1 text-sm text-ink/60">{automation.body}</p>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink/45">
                            <span>{automation.channel === 'both' ? 'In-app + email' : automation.channel}</span>
                            {automation.scheduledFor ? (
                              <span>Scheduled {formatDate(automation.scheduledFor)}</span>
                            ) : null}
                            {automation.lastTriggeredAt ? (
                              <span>Last fired {formatDate(automation.lastTriggeredAt)}</span>
                            ) : null}
                          </div>
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
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Campaign history</p>
                  <h3 className="mt-1 font-display text-2xl text-ink">Recent sends</h3>

                  {!data.recentCampaigns?.length ? (
                    <div className="mt-4 rounded-[24px] bg-sand/50 px-5 py-8 text-center">
                      <p className="text-sm text-ink/50">No member campaigns sent yet for this series.</p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {data.recentCampaigns.map((campaignItem) => (
                        <article key={campaignItem.campaignId} className="rounded-[24px] border border-ink/10 bg-white p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-ink">{campaignItem.title}</p>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              campaignItem.status === 'failed'
                                ? 'bg-ember/10 text-ember'
                                : campaignItem.status === 'scheduled'
                                  ? 'bg-dusk/10 text-dusk'
                                  : 'bg-reef/10 text-reef'
                            }`}>
                              {formatCampaignStatusLabel(campaignItem.status)}
                            </span>
                            {campaignItem.sourceType === 'automation' && campaignItem.automationName ? (
                              <span className="rounded-full bg-sand px-2.5 py-1 text-[11px] font-semibold text-ink/60">
                                {campaignItem.automationName}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm text-ink/60">{campaignItem.body}</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-4">
                            <div className="rounded-2xl bg-sand/50 px-3 py-3">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Delivered</p>
                              <p className="mt-1 font-semibold text-ink">{campaignItem.analytics?.deliveredCount || 0}</p>
                            </div>
                            <div className="rounded-2xl bg-sand/50 px-3 py-3">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Opened</p>
                              <p className="mt-1 font-semibold text-ink">{campaignItem.analytics?.openedCount || 0}</p>
                            </div>
                            <div className="rounded-2xl bg-sand/50 px-3 py-3">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Open rate</p>
                              <p className="mt-1 font-semibold text-ink">{campaignItem.analytics?.openRate || 0}%</p>
                            </div>
                            <div className="rounded-2xl bg-sand/50 px-3 py-3">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Click rate</p>
                              <p className="mt-1 font-semibold text-ink">{campaignItem.analytics?.clickRate || 0}%</p>
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-ink/45">
                            {campaignItem.scheduledFor
                              ? `Scheduled ${formatDate(campaignItem.scheduledFor)}`
                              : campaignItem.sentAt
                                ? `Sent ${formatDate(campaignItem.sentAt)}`
                                : `Created ${formatDate(campaignItem.createdAt)}`}
                          </p>
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
    </ModalShell>
  );
};

export default SeriesMemberCrmModal;
