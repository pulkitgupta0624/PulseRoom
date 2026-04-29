import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import SectionHeader from '../components/SectionHeader';
import MetricCard from '../components/MetricCard';
import EventEditModal from '../components/EventEditModal';
import EventBookingsModal from '../components/EventBookingsModal';
import SponsorManagerModal from '../components/SponsorManagerModal';
import PromoCodeManagerModal from '../components/PromoCodeManagerModal';
import WebhookManagerModal from '../components/WebhookManagerModal';
import NetworkingManagerModal from '../components/NetworkingManagerModal';
import EngagementHeatmapModal from '../components/EngagementHeatmapModal';
import AnalyticsCharts from '../components/AnalyticsCharts';
import ModalShell from '../components/ModalShell';
import EventThemeFields from '../components/EventThemeFields';
import {
  createEvent,
  deleteEvent,
  fetchOrganizerDashboard,
  publishEvent
} from '../features/events/eventsSlice';
import { api } from '../lib/api';
import { normalizeEventTheme } from '../lib/eventTheme';
import { formatCurrency, formatDate } from '../lib/formatters';

const STATUS_STYLES = {
  draft: 'bg-amber-100 text-amber-700',
  published: 'bg-reef/10 text-reef',
  cancelled: 'bg-ink/8 text-ink/40',
  completed: 'bg-dusk/10 text-dusk'
};

const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const createEmptyTier = () => ({
  tierId: makeId('tier'),
  name: 'General Admission',
  price: 0,
  quantity: 100,
  perks: 'Live access, Replay access'
});

const createEmptySpeaker = () => ({
  id: makeId('speaker'),
  name: '',
  email: '',
  title: '',
  company: '',
  bio: ''
});

const createInitialForm = () => ({
  title: '',
  summary: '',
  description: '',
  type: 'online',
  visibility: 'public',
  startsAt: '',
  endsAt: '',
  venueName: '',
  city: '',
  country: '',
  streamUrl: '',
  organizerSignatureName: '',
  coverImageUrl: '',
  coverImagePrompt: '',
  category: 'technology',
  tags: 'ai,community',
  pageTheme: normalizeEventTheme(),
  tiers: [createEmptyTier()],
  speakers: [],
  sessions: [],
  assumptions: [],
  suggestedFaq: []
});

const toDatetimeLocal = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const pad = (item) => String(item).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const TierRow = ({ tier, index, onChange, onRemove, canRemove }) => (
  <div className="rounded-2xl border border-ink/10 bg-sand/60 p-4 space-y-3">
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">
        Tier {index + 1}
      </p>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-medium text-ember hover:bg-ember/10"
        >
          Remove
        </button>
      )}
    </div>
    {/* FIX: was md:grid-cols-3 with no sm step; added sm:grid-cols-2 to avoid 3-col squeeze on small tablets */}
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
      <input
        value={tier.name}
        onChange={(e) => onChange('name', e.target.value)}
        placeholder="Tier name"
        className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef"
        required
      />
      <input
        type="number"
        min="0"
        value={tier.price}
        onChange={(e) => onChange('price', e.target.value)}
        placeholder="Price (0 = free)"
        className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef"
      />
      <input
        type="number"
        min="1"
        value={tier.quantity}
        onChange={(e) => onChange('quantity', e.target.value)}
        placeholder="Capacity"
        className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef sm:col-span-2 md:col-span-1"
        required
      />
    </div>
    <input
      value={tier.perks}
      onChange={(e) => onChange('perks', e.target.value)}
      placeholder="Perks (comma-separated)"
      className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef"
    />
  </div>
);

const SpeakerRow = ({ speaker, index, onChange, onRemove }) => (
  <div className="rounded-2xl border border-ink/10 bg-sand/60 p-4 space-y-3">
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">
        Speaker {index + 1}
      </p>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-medium text-ember hover:bg-ember/10"
      >
        Remove
      </button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <input
        value={speaker.name}
        onChange={(e) => onChange('name', e.target.value)}
        placeholder="Full name"
        className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef"
        required
      />
      <input
        type="email"
        value={speaker.email}
        onChange={(e) => onChange('email', e.target.value)}
        placeholder="Sign-in email (optional)"
        className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef"
      />
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <input
        value={speaker.title}
        onChange={(e) => onChange('title', e.target.value)}
        placeholder="Job title"
        className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef"
      />
      <input
        value={speaker.company}
        onChange={(e) => onChange('company', e.target.value)}
        placeholder="Company"
        className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef"
      />
      <input
        value={speaker.bio}
        onChange={(e) => onChange('bio', e.target.value)}
        placeholder="Short bio"
        className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-reef sm:col-span-2"
      />
    </div>
  </div>
);

const ReferralMetric = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const DashboardPage = () => {
  const dispatch = useDispatch();
  const { dashboard, saving, error: sliceError } = useSelector((state) => state.events);
  const [form, setForm] = useState(() => createInitialForm());
  const [editingEvent, setEditingEvent] = useState(null);
  const [bookingsEvent, setBookingsEvent] = useState(null);
  const [sponsorsEvent, setSponsorsEvent] = useState(null);
  const [promoCodesEvent, setPromoCodesEvent] = useState(null);
  const [webhooksEvent, setWebhooksEvent] = useState(null);
  const [networkingEvent, setNetworkingEvent] = useState(null);
  const [engagementEvent, setEngagementEvent] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createTab, setCreateTab] = useState('details');
  const [aiIdea, setAiIdea] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [organizerAnalytics, setOrganizerAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [referralAnalytics, setReferralAnalytics] = useState(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [copiedReferralEventId, setCopiedReferralEventId] = useState(null);
  const [regeneratingReferralEventId, setRegeneratingReferralEventId] = useState(null);
  const coverInputRef = useRef(null);

  const refreshOrganizerAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const response = await api.get('/api/bookings/analytics/organizer');
      setOrganizerAnalytics(response.data.data);
    } catch {
      setOrganizerAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const refreshReferralAnalytics = async () => {
    setReferralLoading(true);
    try {
      const response = await api.get('/api/bookings/analytics/referrals/organizer');
      setReferralAnalytics(response.data.data);
    } catch {
      setReferralAnalytics(null);
    } finally {
      setReferralLoading(false);
    }
  };

  const refreshDashboard = async () => {
    await Promise.all([
      dispatch(fetchOrganizerDashboard()),
      refreshOrganizerAnalytics(),
      refreshReferralAnalytics()
    ]);
  };

  useEffect(() => {
    refreshDashboard();
  }, [dispatch]);

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const updateTier = (index, key, value) =>
    setForm((current) => ({
      ...current,
      tiers: current.tiers.map((tier, i) => (i === index ? { ...tier, [key]: value } : tier))
    }));

  const addTier = () =>
    setForm((current) => ({ ...current, tiers: [...current.tiers, createEmptyTier()] }));

  const removeTier = (index) =>
    setForm((current) => ({
      ...current,
      tiers: current.tiers.filter((_, i) => i !== index)
    }));

  const updateSpeaker = (index, key, value) =>
    setForm((current) => ({
      ...current,
      speakers: current.speakers.map((s, i) => (i === index ? { ...s, [key]: value } : s))
    }));

  const addSpeaker = () =>
    setForm((current) => ({ ...current, speakers: [...current.speakers, createEmptySpeaker()] }));

  const removeSpeaker = (index) =>
    setForm((current) => ({
      ...current,
      speakers: current.speakers.filter((_, i) => i !== index)
    }));

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/api/uploads/event-cover', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      updateField('coverImageUrl', response.data.data.url);
    } catch {
      setAiError('Cover image upload failed. Check your upload configuration.');
    } finally {
      setUploadingCover(false);
    }
  };

  const applyAiDraft = (draft) => {
    setForm((current) => ({
      ...current,
      title: draft.title || '',
      summary: draft.summary || '',
      description: draft.description || '',
      type: draft.type || 'online',
      visibility: draft.visibility || 'public',
      startsAt: toDatetimeLocal(draft.startsAt),
      endsAt: toDatetimeLocal(draft.endsAt),
      venueName: draft.venueName || '',
      city: draft.city || '',
      country: draft.country || '',
      organizerSignatureName: draft.organizerSignatureName || '',
      coverImagePrompt: draft.coverImagePrompt || '',
      category: draft.categories?.[0] || current.category,
      tags: (draft.tags || []).join(', '),
      tiers: (draft.ticketTiers || []).length
        ? draft.ticketTiers.map((tier) => ({
            tierId: tier.tierId || makeId('tier'),
            name: tier.name || 'General Admission',
            price: tier.price ?? 0,
            quantity: tier.quantity ?? 50,
            perks: (tier.perks || []).join(', ')
          }))
        : current.tiers,
      speakers: (draft.speakers || []).map((speaker) => ({
        id: makeId('speaker'),
        name: speaker.name || '',
        email: speaker.email || '',
        title: speaker.title || '',
        company: speaker.company || '',
        bio: speaker.bio || ''
      })),
      pageTheme: normalizeEventTheme(draft.pageTheme || current.pageTheme),
      sessions: draft.sessions || [],
      assumptions: draft.assumptions || [],
      suggestedFaq: draft.suggestedFaq || []
    }));
  };

  const handleGenerateWithAi = async () => {
    if (!aiIdea.trim()) {
      setAiError('Describe the event idea first so the assistant has something to work from.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await api.post('/api/events/ai/generate', { idea: aiIdea });
      applyAiDraft(response.data.data);
      setCreateTab('details');
    } catch (error) {
      setAiError(error.response?.data?.message || 'AI draft generation failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();

    const ticketTiers = form.tiers.map((tier) => ({
      tierId: tier.tierId,
      name: tier.name,
      quantity: Number(tier.quantity),
      price: Number(tier.price),
      currency: 'INR',
      isFree: Number(tier.price) === 0,
      perks: tier.perks.split(',').map((p) => p.trim()).filter(Boolean)
    }));

    const speakers = form.speakers
      .filter((s) => s.name.trim())
      .map(({ id, ...rest }) => rest);

    const sessions = form.sessions?.length
      ? form.sessions
      : [
          {
            title: 'Opening Session',
            description: 'Kickoff session',
            startsAt: form.startsAt,
            endsAt: form.endsAt,
            roomLabel: 'Main stage',
            speakerNames: speakers.map((s) => s.name)
          }
        ];

    const payload = {
      title: form.title,
      summary: form.summary,
      description: form.description,
      type: form.type,
      visibility: form.visibility,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      venueName: form.venueName,
      city: form.city,
      country: form.country,
      organizerSignatureName: form.organizerSignatureName,
      categories: [form.category],
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      pageTheme: form.pageTheme,
      speakers,
      sessions,
      ticketTiers,
      allowsChat: true,
      allowsQa: true
    };

    if (form.coverImageUrl) payload.coverImageUrl = form.coverImageUrl;
    if (form.streamUrl && form.type !== 'offline') payload.streamUrl = form.streamUrl;

    const result = await dispatch(createEvent(payload));
    if (!result.error) {
      await refreshDashboard();
      setForm(createInitialForm());
      setCreateTab('details');
      setCreateSuccess(true);
      setTimeout(() => setCreateSuccess(false), 4000);
    }
  };

  const handleDelete = async (eventId) => {
    await dispatch(deleteEvent(eventId));
    await refreshDashboard();
    setConfirmDelete(null);
  };

  const handleCopyReferralLink = async (eventId, referralLink) => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedReferralEventId(eventId);
      setTimeout(() => {
        setCopiedReferralEventId((cur) => (cur === eventId ? null : cur));
      }, 2000);
    } catch {
      // Ignore clipboard failures in unsupported environments.
    }
  };

  const handleRegenerateReferralLink = async (eventId) => {
    setRegeneratingReferralEventId(eventId);
    try {
      await api.post(`/api/events/${eventId}/referral/regenerate`);
      await refreshDashboard();
    } finally {
      setRegeneratingReferralEventId(null);
    }
  };

  const totals = dashboard?.totals || {};
  const formTabs = [
    { key: 'details', label: 'Event Details' },
    { key: 'tiers', label: `Tickets (${form.tiers.length})` },
    { key: 'speakers', label: `Speakers (${form.speakers.length})` }
  ];

  return (
    <div className="space-y-10">
      <SectionHeader
        eyebrow="Organizer"
        title="Command center"
        description="Create and publish events, manage ticket check-ins, sell sponsor placements, and track demand with real analytics."
      />

      <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {/* FIX: was md:grid-cols-2 xl:grid-cols-5 — on md the 5th card was orphaned in a 2-col grid.
            Now sm=2, md=3 gives a natural 3+2 wrap instead of 2+2+1. */}
        <MetricCard label="Events" value={totals.events || 0} />
        <MetricCard label="Published" value={totals.published || 0} accent="text-ember" />
        <MetricCard label="Upcoming" value={totals.upcoming || 0} accent="text-dusk" />
        <MetricCard label="Ticket Revenue" value={formatCurrency(totals.revenue || 0)} />
        <MetricCard label="Sponsor Revenue" value={formatCurrency(totals.sponsorRevenue || 0)} accent="text-reef" />
      </section>

      <AnalyticsCharts
        title="Revenue and demand"
        description={analyticsLoading ? 'Loading organizer analytics...' : 'Real booking and attendee trends across your events.'}
        analytics={organizerAnalytics}
      />

      <section className="space-y-6">
        <SectionHeader
          eyebrow="Referrals"
          title="Affiliate performance"
          description={
            referralLoading
              ? 'Loading referral analytics...'
              : 'Each event keeps one active single-use referral invite. Every claimed invite rotates automatically to a fresh discounted link for the next new user.'
          }
        />

        {referralAnalytics ? (
          <>
            {/* FIX: was md:grid-cols-3 xl:grid-cols-6 — added sm:grid-cols-2 so it's 2→3→6 */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              <ReferralMetric label="Active Links" value={referralAnalytics.totals?.activeReferralLinks || 0} />
              <ReferralMetric label="Link Opens" value={referralAnalytics.totals?.linkOpens || 0} accent="text-dusk" />
              <ReferralMetric label="Referred Bookings" value={referralAnalytics.totals?.referredBookings || 0} accent="text-reef" />
              <ReferralMetric label="Referral Revenue" value={formatCurrency(referralAnalytics.totals?.revenue || 0)} accent="text-ember" />
              <ReferralMetric label="Discounts Given" value={formatCurrency(referralAnalytics.totals?.discountsGiven || 0)} accent="text-dusk" />
              <ReferralMetric label="Conversion" value={formatPercent(referralAnalytics.totals?.conversionRate || 0)} />
            </div>

            <div className="rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
              {/* FIX: header was a rigid flex row — on mobile the badge overflowed. Changed to flex-col gap-3 sm:flex-row */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-3xl text-ink">Referral links by event</h2>
                  <p className="mt-2 text-sm text-ink/60">
                    Each active link gives a one-time discount to a first-time PulseRoom booker, then rotates to a fresh link after that checkout claims it.
                  </p>
                </div>
                <span className="self-start rounded-full bg-dusk/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-dusk whitespace-nowrap">
                  {referralAnalytics.events?.length || 0} tracked events
                </span>
              </div>

              <div className="mt-6 space-y-4">
                {referralAnalytics.events?.map((item) => (
                  <div key={item.eventId} className="rounded-[24px] border border-ink/10 bg-sand/55 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      {/* FIX: added min-w-0 so the truncate on the link line actually works */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-2xl text-ink">{item.title}</h3>
                          <span className="rounded-full border border-ink/10 bg-white px-2 py-0.5 text-xs text-ink/50">
                            {item.referralCode || 'Pending link'}
                          </span>
                          <span className="rounded-full border border-dusk/20 bg-dusk/5 px-2 py-0.5 text-xs text-dusk">
                            {item.referralDiscountType === 'fixed'
                              ? `${formatCurrency(item.referralDiscountValue || 0)} off`
                              : `${item.referralDiscountValue || 0}% off`}
                          </span>
                          <span className="rounded-full border border-reef/20 bg-reef/5 px-2 py-0.5 text-xs text-reef capitalize">
                            {item.currentLinkStatus || 'active'}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-sm text-ink/55">{item.referralLink || 'Referral link unavailable'}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink/40">
                          {item.lastReferredAt ? `Last referred booking ${formatDate(item.lastReferredAt)}` : 'No referred bookings yet'}
                        </p>
                      </div>

                      {/* FIX: button group — added shrink-0 so it never compresses on lg+ */}
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {item.referralLink && (
                          <button
                            type="button"
                            onClick={() => handleCopyReferralLink(item.eventId, item.referralLink)}
                            className="rounded-full border border-ink/15 bg-white px-4 py-2 text-xs font-semibold text-ink hover:bg-sand"
                          >
                            {copiedReferralEventId === item.eventId ? 'Copied link' : 'Copy link'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRegenerateReferralLink(item.eventId)}
                          disabled={regeneratingReferralEventId === item.eventId}
                          className="rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember hover:bg-ember/10 disabled:opacity-60"
                        >
                          {regeneratingReferralEventId === item.eventId ? 'Refreshing...' : 'Refresh link'}
                        </button>
                        <Link
                          to={`/events/${item.eventId}`}
                          className="rounded-full border border-dusk/20 bg-dusk/5 px-4 py-2 text-xs font-semibold text-dusk hover:bg-dusk/10"
                        >
                          View event
                        </Link>
                      </div>
                    </div>

                    {/* FIX: was md:grid-cols-3 xl:grid-cols-6 — added sm:grid-cols-2 for smooth progression */}
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Link opens</p>
                        <p className="mt-2 font-semibold text-ink">{item.linkOpens || 0}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Bookings</p>
                        <p className="mt-2 font-semibold text-ink">{item.referredBookings || 0}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Tickets sold</p>
                        <p className="mt-2 font-semibold text-ink">{item.ticketsSold || 0}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Revenue</p>
                        <p className="mt-2 font-semibold text-ink">{formatCurrency(item.revenue || 0)}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Discounts</p>
                        <p className="mt-2 font-semibold text-ink">{formatCurrency(item.discountsGiven || 0)}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Conversion</p>
                        <p className="mt-2 font-semibold text-ink">{formatPercent(item.conversionRate || 0)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white/70 px-6 py-8 text-sm text-ink/55 shadow-bloom">
            Referral analytics will show up here after organizer links start generating bookings.
          </div>
        )}
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.95fr,1.05fr]">
        <div className="space-y-6 rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
          <div className="space-y-3 rounded-[28px] border border-ink/10 bg-sand/55 p-5">
            <p className="text-xs uppercase tracking-[0.26em] text-reef">AI Event Assistant</p>
            <h2 className="font-display text-3xl text-ink">Describe the idea once</h2>
            <p className="text-sm text-ink/60">
              PulseRoom will draft the title, copy, ticket tiers, tags, timing assumptions, and a cover image prompt for you.
            </p>
            <textarea
              value={aiIdea}
              onChange={(e) => setAiIdea(e.target.value)}
              rows={4}
              placeholder="I want to host a React workshop for 50 people in Jaipur..."
              className="w-full rounded-[24px] border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleGenerateWithAi}
                disabled={aiLoading}
                className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-60"
              >
                {aiLoading ? 'Generating draft...' : 'Generate with AI'}
              </button>
              {form.coverImagePrompt && (
                <span className="rounded-full border border-dusk/20 bg-dusk/5 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-dusk">
                  Cover prompt ready
                </span>
              )}
            </div>
            {aiError && (
              <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{aiError}</p>
            )}
          </div>

          {(form.coverImagePrompt || form.assumptions.length > 0 || form.suggestedFaq.length > 0) && (
            <div className="space-y-4 rounded-[28px] border border-ink/10 bg-white p-5">
              {form.coverImagePrompt && (
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Cover image prompt</p>
                  <p className="mt-2 rounded-2xl bg-sand/70 px-4 py-3 text-sm text-ink/70">{form.coverImagePrompt}</p>
                </div>
              )}
              {form.assumptions.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-ink/45">AI assumptions</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.assumptions.map((a) => (
                      <span key={a} className="rounded-full border border-ink/10 bg-sand px-3 py-1 text-xs text-ink/60">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {form.suggestedFaq.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Suggested attendee FAQs</p>
                  <div className="mt-2 space-y-2">
                    {form.suggestedFaq.map((q) => (
                      <p key={q} className="rounded-2xl bg-sand/70 px-4 py-3 text-sm text-ink/70">{q}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-0 rounded-[32px] border border-ink/10 bg-white shadow-bloom overflow-hidden">
            <div className="p-6 pb-0">
              <h2 className="font-display text-3xl text-ink">Create a new event</h2>
            </div>

            {/* FIX: tab bar — was w-fit with no overflow protection, clipped on mobile.
                Now overflows with a scroll track when the viewport is too narrow. */}
            <div className="px-6 pt-4 pb-0">
              <div className="overflow-x-auto pb-1">
                <div className="flex gap-1 rounded-2xl border border-ink/10 bg-sand p-1 w-fit min-w-full sm:min-w-0">
                  {formTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setCreateTab(tab.key)}
                      className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition ${
                        createTab === tab.key ? 'bg-ink text-sand' : 'text-ink/55 hover:text-ink'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <form onSubmit={handleCreateEvent} className="p-6 space-y-4">
              {createTab === 'details' && (
                <>
                  <div
                    className="relative overflow-hidden rounded-[20px] border-2 border-dashed border-ink/15 bg-sand/50 cursor-pointer"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    {form.coverImageUrl ? (
                      <div className="relative">
                        <img src={form.coverImageUrl} alt="Cover" className="h-32 w-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-ink/30 opacity-0 hover:opacity-100 transition">
                          <p className="text-sm text-white font-medium">Change cover</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-24 gap-2">
                        {uploadingCover ? (
                          <p className="text-sm text-reef font-medium">Uploading...</p>
                        ) : (
                          <>
                            <svg className="h-6 w-6 text-ink/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                            </svg>
                            <p className="text-xs text-ink/40">Upload cover image (optional)</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />

                  <input
                    value={form.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Event title"
                    className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                    required
                  />
                  <input
                    value={form.summary}
                    onChange={(e) => updateField('summary', e.target.value)}
                    placeholder="Short summary"
                    className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                    required
                  />
                  <textarea
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Full event description"
                    rows="4"
                    className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                    required
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      value={form.type}
                      onChange={(e) => updateField('type', e.target.value)}
                      className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 focus:border-reef"
                    >
                      <option value="online">Online</option>
                      <option value="offline">Offline</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                    <select
                      value={form.visibility}
                      onChange={(e) => updateField('visibility', e.target.value)}
                      className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 focus:border-reef"
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-ink/50 mb-1 block">Starts At</label>
                      <input
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={(e) => updateField('startsAt', e.target.value)}
                        className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 focus:border-reef"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-ink/50 mb-1 block">Ends At</label>
                      <input
                        type="datetime-local"
                        value={form.endsAt}
                        onChange={(e) => updateField('endsAt', e.target.value)}
                        className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 focus:border-reef"
                        required
                      />
                    </div>
                  </div>

                  {/* FIX: venue/city/country was md:grid-cols-3 — on small tablets that's very cramped.
                      Now stacks to 1 col, then sm:grid-cols-2 (venue spans full), then md:grid-cols-3. */}
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    <input
                      value={form.venueName}
                      onChange={(e) => updateField('venueName', e.target.value)}
                      placeholder="Venue / stream name"
                      className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef sm:col-span-2 md:col-span-1"
                    />
                    <input
                      value={form.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      placeholder="City"
                      className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                    />
                    <input
                      value={form.country}
                      onChange={(e) => updateField('country', e.target.value)}
                      placeholder="Country"
                      className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                    />
                  </div>

                  {form.type !== 'offline' && (
                    <div>
                      <label className="text-xs text-ink/50 mb-1 block">Backup external stream URL (optional)</label>
                      <input
                        value={form.streamUrl}
                        onChange={(e) => updateField('streamUrl', e.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-ink/50 mb-1 block">Certificate signature name</label>
                    <input
                      value={form.organizerSignatureName}
                      onChange={(e) => updateField('organizerSignatureName', e.target.value)}
                      placeholder="Shown on PDF attendance certificates"
                      className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={form.category}
                      onChange={(e) => updateField('category', e.target.value)}
                      placeholder="Category"
                      className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                    />
                    <input
                      value={form.tags}
                      onChange={(e) => updateField('tags', e.target.value)}
                      placeholder="Tags (comma-separated)"
                      className="rounded-2xl border border-ink/10 bg-sand px-4 py-3 outline-none focus:border-reef"
                    />
                  </div>

                  <EventThemeFields
                    value={form.pageTheme}
                    onChange={(pageTheme) => updateField('pageTheme', pageTheme)}
                  />
                </>
              )}

              {createTab === 'tiers' && (
                <div className="space-y-4">
                  <p className="text-sm text-ink/60">Define one or more ticket tiers for the event.</p>
                  {form.tiers.map((tier, index) => (
                    <TierRow
                      key={tier.tierId}
                      tier={tier}
                      index={index}
                      onChange={(key, value) => updateTier(index, key, value)}
                      onRemove={() => removeTier(index)}
                      canRemove={form.tiers.length > 1}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={addTier}
                    className="w-full rounded-2xl border-2 border-dashed border-ink/15 py-3 text-sm font-medium text-ink/50 hover:border-reef/40 hover:text-reef transition"
                  >
                    + Add another tier
                  </button>
                </div>
              )}

              {createTab === 'speakers' && (
                <div className="space-y-4">
                  <p className="text-sm text-ink/60">
                    Add speakers who will appear on the event page. Optional sign-in email helps speaker badges show correctly in live Q&A.
                  </p>
                  {form.speakers.length === 0 && (
                    <div className="rounded-2xl bg-sand/50 px-5 py-8 text-center">
                      <p className="text-sm text-ink/45">No speakers added yet.</p>
                    </div>
                  )}
                  {form.speakers.map((speaker, index) => (
                    <SpeakerRow
                      key={speaker.id}
                      speaker={speaker}
                      index={index}
                      onChange={(key, value) => updateSpeaker(index, key, value)}
                      onRemove={() => removeSpeaker(index)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={addSpeaker}
                    className="w-full rounded-2xl border-2 border-dashed border-ink/15 py-3 text-sm font-medium text-ink/50 hover:border-reef/40 hover:text-reef transition"
                  >
                    + Add a speaker
                  </button>
                </div>
              )}

              {sliceError && (
                <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{sliceError}</p>
              )}
              {createSuccess && (
                <p className="rounded-2xl bg-reef/10 px-4 py-3 text-sm text-reef">
                  Event created as a draft. Publish it when you are ready to sell tickets.
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-2xl bg-ink px-5 py-3 font-semibold text-sand disabled:opacity-60"
              >
                {saving ? 'Creating...' : 'Create draft event'}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-4 rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-3xl text-ink">Your event slate</h2>
            <span className="shrink-0 rounded-full bg-reef/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-reef">
              {dashboard?.events?.length || 0} events
            </span>
          </div>

          {!dashboard?.events?.length && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-ink/50">No events yet. Create your first one.</p>
            </div>
          )}

          {/* FIX: removed max-h-[80vh] fixed height; replaced with a more generous overflow container
              that doesn't collapse awkwardly relative to the create-form column on the left */}
          <div className="space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
            {(dashboard?.events || []).map((event) => (
              <div key={event._id} className="rounded-[24px] border border-ink/10 bg-sand/70 overflow-hidden">
                {event.coverImageUrl && (
                  <img src={event.coverImageUrl} alt={event.title} className="h-24 w-full object-cover" />
                )}
                <div className="p-5">
                  <div className="flex flex-col gap-4">
                    {/* FIX: was a rigid md:flex-row layout; event info and button group
                        both had unbounded widths causing overlap at mid-breakpoints.
                        Now purely flex-col with the button group always below the info. */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-xl text-ink">{event.title}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] ${
                            STATUS_STYLES[event.status] || 'bg-ink/8 text-ink/50'
                          }`}
                        >
                          {event.status}
                        </span>
                        {event.type && (
                          <span className="rounded-full border border-ink/10 px-2 py-0.5 text-xs text-ink/50 capitalize">
                            {event.type}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-ink/65">{formatDate(event.startsAt)}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink/55">
                        <span>Revenue {formatCurrency(event.analytics?.revenue || 0)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{event.analytics?.bookings || 0} bookings</span>
                        <span aria-hidden="true">·</span>
                        <span>{event.attendeesCount || 0} attendees</span>
                      </div>
                      {/* FIX: replaced broken Â· encoding artifacts with proper · character */}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink/55">
                        <span>Sponsor revenue {formatCurrency(event.sponsorSummary?.grossRevenue || 0)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{event.sponsorSummary?.activeSponsors || 0} live sponsors</span>
                        <span aria-hidden="true">·</span>
                        <span>{event.sponsorSummary?.boothClicks || 0} booth clicks</span>
                      </div>
                      {event.ticketTiers?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {event.ticketTiers.map((tier) => (
                            <span
                              key={tier.tierId}
                              className="rounded-full border border-ink/10 bg-white px-2 py-0.5 text-xs text-ink/55"
                            >
                              {tier.name} · {tier.isFree || tier.price === 0 ? 'Free' : formatCurrency(tier.price, tier.currency)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setBookingsEvent(event)}
                        className="rounded-full border border-reef/20 bg-reef/5 px-3 py-2 text-xs font-medium text-reef hover:bg-reef/10"
                      >
                        Bookings
                      </button>
                      <button
                        type="button"
                        onClick={() => setSponsorsEvent(event)}
                        className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      >
                        Sponsors
                      </button>
                      <button
                        type="button"
                        onClick={() => setPromoCodesEvent(event)}
                        className="rounded-full border border-dusk/20 bg-dusk/5 px-3 py-2 text-xs font-medium text-dusk hover:bg-dusk/10"
                      >
                        Promo Codes
                      </button>
                      <button
                        type="button"
                        onClick={() => setWebhooksEvent(event)}
                        className="rounded-full border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink hover:bg-sand"
                      >
                        Webhooks
                      </button>
                      <button
                        type="button"
                        onClick={() => setNetworkingEvent(event)}
                        className="rounded-full border border-reef/20 bg-reef/5 px-3 py-2 text-xs font-medium text-reef hover:bg-reef/10"
                      >
                        Networking
                      </button>
                      <button
                        type="button"
                        onClick={() => setEngagementEvent(event)}
                        className="rounded-full border border-ember/20 bg-ember/5 px-3 py-2 text-xs font-medium text-ember hover:bg-ember/10"
                      >
                        Engagement
                      </button>
                      <Link
                        to={`/events/${event._id}/check-in`}
                        className="rounded-full border border-dusk/20 bg-dusk/5 px-3 py-2 text-xs font-medium text-dusk hover:bg-dusk/10"
                      >
                        Scanner
                      </Link>
                      <Link
                        to={`/events/${event._id}/live`}
                        className="rounded-full border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink hover:bg-sand"
                      >
                        Live room
                      </Link>
                      <button
                        type="button"
                        onClick={() => setEditingEvent(event)}
                        className="rounded-full border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink hover:bg-sand"
                      >
                        Edit
                      </button>
                      {event.status === 'draft' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await dispatch(publishEvent(event._id));
                            await refreshDashboard();
                          }}
                          className="rounded-full bg-ink px-3 py-2 text-xs font-semibold text-sand"
                        >
                          Publish
                        </button>
                      )}
                      {event.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(event)}
                          className="rounded-full border border-ember/20 bg-ember/5 px-3 py-2 text-xs font-medium text-ember hover:bg-ember/10"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {editingEvent && <EventEditModal event={editingEvent} onClose={() => setEditingEvent(null)} />}
      {bookingsEvent && <EventBookingsModal event={bookingsEvent} onClose={() => setBookingsEvent(null)} />}
      {sponsorsEvent && (
        <SponsorManagerModal event={sponsorsEvent} onClose={() => setSponsorsEvent(null)} onUpdated={refreshDashboard} />
      )}
      {promoCodesEvent && (
        <PromoCodeManagerModal event={promoCodesEvent} onClose={() => setPromoCodesEvent(null)} />
      )}
      {webhooksEvent && (
        <WebhookManagerModal event={webhooksEvent} onClose={() => setWebhooksEvent(null)} />
      )}
      {networkingEvent && (
        <NetworkingManagerModal event={networkingEvent} onClose={() => setNetworkingEvent(null)} />
      )}
      {engagementEvent && (
        <EngagementHeatmapModal event={engagementEvent} onClose={() => setEngagementEvent(null)} />
      )}

      {confirmDelete && (
        <ModalShell
          onClose={() => setConfirmDelete(null)}
          labelledBy="delete-event-title"
          closeOnBackdrop={false}
          panelClassName="w-full max-w-md rounded-[28px] border border-ink/10 bg-white p-6 shadow-bloom"
        >
            <h3 id="delete-event-title" className="font-display text-2xl text-ink">Delete event?</h3>
            <p className="mt-3 text-sm text-ink/70">
              Are you sure you want to permanently delete <strong>{confirmDelete.title}</strong>? This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-2xl border border-ink/10 bg-sand px-5 py-3 font-semibold text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete._id)}
                className="flex-1 rounded-2xl bg-ember px-5 py-3 font-semibold text-white"
              >
                Delete
              </button>
            </div>
        </ModalShell>
      )}
    </div>
  );
};

export default DashboardPage;
