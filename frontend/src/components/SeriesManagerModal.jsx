import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ModalShell from './ModalShell';
import SeriesMemberCrmModal from './SeriesMemberCrmModal';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';

const createEmptyForm = () => ({
  name: '',
  summary: '',
  description: '',
  cadenceLabel: 'Monthly',
  accentColor: '#1D7A85',
  coverImageUrl: '',
  planName: 'Series Pass',
  price: 0,
  currency: 'INR',
  discountPercent: 10,
  earlyAccessHours: 24,
  membersOnlyBooking: false,
  allowSelfJoin: true,
  includesReplayLibrary: true,
  vipNetworking: false,
  perks: 'Member pricing, Early access, Replay library'
});

const formFromSeries = (series) => ({
  name: series.name || '',
  summary: series.summary || '',
  description: series.description || '',
  cadenceLabel: series.cadenceLabel || '',
  accentColor: series.theme?.accentColor || '#1D7A85',
  coverImageUrl: series.theme?.coverImageUrl || '',
  planName: series.membershipSettings?.planName || 'Series Pass',
  price: Number(series.membershipSettings?.price || 0),
  currency: series.membershipSettings?.currency || 'INR',
  discountPercent: Number(series.membershipSettings?.discountPercent || 0),
  earlyAccessHours: Number(series.membershipSettings?.earlyAccessHours || 0),
  membersOnlyBooking: Boolean(series.membershipSettings?.membersOnlyBooking),
  allowSelfJoin: series.membershipSettings?.allowSelfJoin !== false,
  includesReplayLibrary: series.membershipSettings?.includesReplayLibrary !== false,
  vipNetworking: Boolean(series.membershipSettings?.vipNetworking),
  perks: (series.membershipSettings?.perks || []).join(', ')
});

const SeriesManagerModal = ({ events = [], onClose, onUpdated = null }) => {
  const [payload, setPayload] = useState({ series: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(() => createEmptyForm());
  const [editingSeriesId, setEditingSeriesId] = useState(null);
  const [attachDrafts, setAttachDrafts] = useState({});
  const [cloneDrafts, setCloneDrafts] = useState({});
  const [activeSeriesCrm, setActiveSeriesCrm] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/events/series/organizer/manage');
      setPayload(response.data.data);
      setError(null);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Unable to load your event series right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const resetForm = () => {
    setForm(createEmptyForm());
    setEditingSeriesId(null);
  };

  const handleSaveSeries = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    setError(null);

    const payloadBody = {
      name: form.name.trim(),
      summary: form.summary.trim(),
      description: form.description.trim(),
      cadenceLabel: form.cadenceLabel.trim(),
      membershipSettings: {
        planName: form.planName.trim(),
        price: Number(form.price || 0),
        currency: form.currency.trim().toUpperCase() || 'INR',
        discountPercent: Number(form.discountPercent || 0),
        earlyAccessHours: Number(form.earlyAccessHours || 0),
        membersOnlyBooking: Boolean(form.membersOnlyBooking),
        allowSelfJoin: Boolean(form.allowSelfJoin),
        includesReplayLibrary: Boolean(form.includesReplayLibrary),
        vipNetworking: Boolean(form.vipNetworking),
        perks: form.perks.split(',').map((perk) => perk.trim()).filter(Boolean)
      },
      theme: {
        accentColor: form.accentColor,
        coverImageUrl: form.coverImageUrl.trim()
      }
    };

    try {
      if (editingSeriesId) {
        await api.patch(`/api/events/series/${editingSeriesId}`, payloadBody);
        setStatus({ tone: 'success', message: 'Series updated and linked events were refreshed.' });
      } else {
        await api.post('/api/events/series', payloadBody);
        setStatus({ tone: 'success', message: 'Series created. You can attach events or clone the next drop below.' });
      }
      await loadData();
      if (onUpdated) {
        await onUpdated();
      }
      resetForm();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save the series right now.');
    } finally {
      setSaving(false);
    }
  };

  const handleAttach = async (seriesId) => {
    const eventId = attachDrafts[seriesId];
    if (!eventId) {
      return;
    }

    setError(null);
    try {
      await api.post(`/api/events/series/${seriesId}/events/${eventId}/attach`);
      setStatus({ tone: 'success', message: 'Event attached to the series.' });
      setAttachDrafts((current) => ({ ...current, [seriesId]: '' }));
      await loadData();
      if (onUpdated) {
        await onUpdated();
      }
    } catch (attachError) {
      setError(attachError.response?.data?.message || 'Unable to attach this event.');
    }
  };

  const handleDetach = async (seriesId, eventId) => {
    setError(null);
    try {
      await api.delete(`/api/events/series/${seriesId}/events/${eventId}`);
      setStatus({ tone: 'success', message: 'Event removed from the series.' });
      await loadData();
      if (onUpdated) {
        await onUpdated();
      }
    } catch (detachError) {
      setError(detachError.response?.data?.message || 'Unable to remove this event from the series.');
    }
  };

  const handleClone = async (seriesId) => {
    const draft = cloneDrafts[seriesId];
    if (!draft?.startsAt) {
      setError('Choose the next event start time before cloning.');
      return;
    }

    setError(null);
    try {
      await api.post(`/api/events/series/${seriesId}/events/clone`, {
        sourceEventId: draft.sourceEventId || undefined,
        title: draft.title?.trim() || undefined,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt || undefined
      });
      setStatus({ tone: 'success', message: 'Series event cloned into draft mode.' });
      await loadData();
      if (onUpdated) {
        await onUpdated();
      }
    } catch (cloneError) {
      setError(cloneError.response?.data?.message || 'Unable to clone a new event from this series.');
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="series-manager-title"
      closeOnBackdrop={false}
      panelClassName="w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-6 py-4 rounded-t-[32px]">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-reef">Recurring series</p>
          <h2 id="series-manager-title" className="mt-1 font-display text-2xl text-ink">Series Studio</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close series manager"
          className="rounded-full p-2 text-ink/50 hover:bg-sand/80 hover:text-ink"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid gap-8 p-6 xl:grid-cols-[0.9fr,1.1fr]">
        <section className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-ink/45">
              {editingSeriesId ? 'Edit series' : 'Create series'}
            </p>
            <h3 className="mt-2 font-display text-3xl text-ink">
              {editingSeriesId ? 'Tune the recurring engine' : 'Launch a recurring format'}
            </h3>
            <p className="mt-2 text-sm text-ink/60">
              Set the series identity once, then attach existing events or clone the next drop in a few clicks.
            </p>
          </div>

          <form onSubmit={handleSaveSeries} className="space-y-4">
            <input
              value={form.name}
              onChange={(event) => updateForm('name', event.target.value)}
              placeholder="Series name"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3"
              required
            />
            <textarea
              value={form.summary}
              onChange={(event) => updateForm('summary', event.target.value)}
              rows={2}
              placeholder="One-line promise for the whole series"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3"
              required
            />
            <textarea
              value={form.description}
              onChange={(event) => updateForm('description', event.target.value)}
              rows={4}
              placeholder="Why this series exists, who it is for, and what members unlock"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={form.cadenceLabel}
                onChange={(event) => updateForm('cadenceLabel', event.target.value)}
                placeholder="Cadence label"
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3"
              />
              <input
                type="color"
                value={form.accentColor}
                onChange={(event) => updateForm('accentColor', event.target.value)}
                className="h-12 rounded-2xl border border-ink/10 bg-white px-2 py-2"
              />
              <input
                value={form.planName}
                onChange={(event) => updateForm('planName', event.target.value)}
                placeholder="Membership plan name"
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3"
              />
              <input
                value={form.coverImageUrl}
                onChange={(event) => updateForm('coverImageUrl', event.target.value)}
                placeholder="Series cover image URL"
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => updateForm('price', event.target.value)}
                placeholder="Pass price"
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3"
              />
              <input
                value={form.currency}
                onChange={(event) => updateForm('currency', event.target.value.toUpperCase())}
                placeholder="Currency"
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3 uppercase"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={form.discountPercent}
                onChange={(event) => updateForm('discountPercent', event.target.value)}
                placeholder="Member discount %"
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3"
              />
              <input
                type="number"
                min="0"
                max="168"
                value={form.earlyAccessHours}
                onChange={(event) => updateForm('earlyAccessHours', event.target.value)}
                placeholder="Early access hours"
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3"
              />
            </div>

            <textarea
              value={form.perks}
              onChange={(event) => updateForm('perks', event.target.value)}
              rows={2}
              placeholder="Perks (comma-separated)"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['membersOnlyBooking', 'Require membership to book series events'],
                ['allowSelfJoin', 'Let attendees join the pass themselves'],
                ['includesReplayLibrary', 'Replay library is part of the pass'],
                ['vipNetworking', 'Pass includes VIP networking treatment']
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-sand/40 px-4 py-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={Boolean(form[key])}
                    onChange={(event) => updateForm(key, event.target.checked)}
                    className="accent-reef"
                  />
                  {label}
                </label>
              ))}
            </div>

            {(error || status) && (
              <p
                className={`rounded-2xl px-4 py-3 text-sm ${
                  error
                    ? 'bg-ember/10 text-ember'
                    : status?.tone === 'success'
                      ? 'bg-reef/10 text-reef'
                      : 'bg-dusk/10 text-dusk'
                }`}
              >
                {error || status?.message}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingSeriesId ? 'Update series' : 'Create series'}
              </button>
              {editingSeriesId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-full border border-ink/12 bg-white px-5 py-3 text-sm font-semibold text-ink"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Your series</p>
              <h3 className="mt-2 font-display text-3xl text-ink">Recurring lineup</h3>
            </div>
            <p className="text-sm text-ink/50">{loading ? 'Loading...' : `${payload.series?.length || 0} series`}</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center rounded-[28px] border border-ink/10 bg-sand/40 px-6 py-14">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-reef border-t-transparent" />
            </div>
          ) : payload.series?.length ? (
            <div className="space-y-4">
              {payload.series.map((series) => {
                const availableEvents = events.filter((event) => !series.events.some((item) => item._id === event._id));
                const cloneDraft = cloneDrafts[series._id] || {
                  sourceEventId: series.events?.[0]?._id || '',
                  title: '',
                  startsAt: '',
                  endsAt: ''
                };

                return (
                  <article key={series._id} className="rounded-[28px] border border-ink/10 bg-white/90 p-5 shadow-bloom">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white"
                            style={{ backgroundColor: series.theme?.accentColor || '#1D7A85' }}
                          >
                            {series.cadenceLabel || 'Series'}
                          </span>
                          <span className="rounded-full border border-ink/10 bg-sand px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-ink/55">
                            {series.stats?.activeMembers || 0} members
                          </span>
                        </div>
                        <h4 className="mt-3 font-display text-2xl text-ink">{series.name}</h4>
                        <p className="mt-2 text-sm text-ink/62">{series.summary}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link
                          to={`/series/${series._id}`}
                          className="rounded-full border border-ink/12 bg-white px-4 py-2 text-sm font-semibold text-ink"
                        >
                          View hub
                        </Link>
                        <button
                          type="button"
                          onClick={() => setActiveSeriesCrm(series)}
                          className="rounded-full border border-dusk/15 bg-dusk/5 px-4 py-2 text-sm font-semibold text-dusk"
                        >
                          Member CRM
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSeriesId(series._id);
                            setForm(formFromSeries(series));
                          }}
                          className="rounded-full border border-ink/12 bg-sand px-4 py-2 text-sm font-semibold text-ink"
                        >
                          Edit
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[22px] border border-ink/8 bg-sand/40 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Events</p>
                        <p className="mt-2 font-display text-3xl text-ink">{series.stats?.totalEvents || 0}</p>
                      </div>
                      <div className="rounded-[22px] border border-ink/8 bg-sand/40 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Upcoming</p>
                        <p className="mt-2 font-display text-3xl text-ink">{series.stats?.upcomingEvents || 0}</p>
                      </div>
                      <div className="rounded-[22px] border border-ink/8 bg-sand/40 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Member pricing</p>
                        <p className="mt-2 font-display text-3xl text-ink">{series.membershipSettings?.discountPercent || 0}%</p>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Linked events</p>
                      {series.events?.length ? (
                        <div className="space-y-3">
                          {series.events.map((event) => (
                            <div key={event._id} className="flex flex-col gap-3 rounded-[22px] border border-ink/8 bg-sand/35 p-4 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <p className="font-semibold text-ink">{event.title}</p>
                                <p className="mt-1 text-sm text-ink/58">{formatDate(event.startsAt)}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Link
                                  to={`/events/${event._id}`}
                                  className="rounded-full border border-ink/12 bg-white px-4 py-2 text-xs font-semibold text-ink"
                                >
                                  Open event
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleDetach(series._id, event._id)}
                                  className="rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-[22px] border border-dashed border-ink/12 bg-sand/25 px-4 py-5 text-sm text-ink/55">
                          No events attached yet. Add the first one from your dashboard inventory or clone the next drop once a template exists.
                        </p>
                      )}
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-[24px] border border-ink/8 bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Attach existing event</p>
                        <div className="mt-3 flex flex-col gap-3">
                          <select
                            value={attachDrafts[series._id] || ''}
                            onChange={(event) =>
                              setAttachDrafts((current) => ({ ...current, [series._id]: event.target.value }))
                            }
                            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                          >
                            <option value="">Choose an event</option>
                            {availableEvents.map((event) => (
                              <option key={event._id} value={event._id}>
                                {event.title}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAttach(series._id)}
                            disabled={!attachDrafts[series._id]}
                            className="rounded-full border border-ink/12 bg-sand px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
                          >
                            Attach event
                          </button>
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-ink/8 bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Clone next event</p>
                        <div className="mt-3 grid gap-3">
                          <select
                            value={cloneDraft.sourceEventId}
                            onChange={(event) =>
                              setCloneDrafts((current) => ({
                                ...current,
                                [series._id]: { ...cloneDraft, sourceEventId: event.target.value }
                              }))
                            }
                            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                          >
                            <option value="">Use latest linked event</option>
                            {series.events.map((event) => (
                              <option key={event._id} value={event._id}>
                                {event.title}
                              </option>
                            ))}
                          </select>
                          <input
                            value={cloneDraft.title}
                            onChange={(event) =>
                              setCloneDrafts((current) => ({
                                ...current,
                                [series._id]: { ...cloneDraft, title: event.target.value }
                              }))
                            }
                            placeholder="Optional new event title"
                            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                          />
                          <input
                            type="datetime-local"
                            value={cloneDraft.startsAt}
                            onChange={(event) =>
                              setCloneDrafts((current) => ({
                                ...current,
                                [series._id]: { ...cloneDraft, startsAt: event.target.value }
                              }))
                            }
                            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                          />
                          <input
                            type="datetime-local"
                            value={cloneDraft.endsAt}
                            onChange={(event) =>
                              setCloneDrafts((current) => ({
                                ...current,
                                [series._id]: { ...cloneDraft, endsAt: event.target.value }
                              }))
                            }
                            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleClone(series._id)}
                            disabled={!cloneDraft.startsAt || !series.events.length}
                            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand disabled:opacity-50"
                          >
                            Clone draft
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-ink/12 bg-sand/30 px-6 py-14 text-center">
              <p className="font-display text-2xl text-ink">No series yet</p>
              <p className="mt-3 text-sm text-ink/58">
                Start one on the left, then attach a template event and use clone mode for the next drop.
              </p>
            </div>
          )}
        </section>
      </div>
      {activeSeriesCrm ? (
        <SeriesMemberCrmModal
          series={activeSeriesCrm}
          onClose={() => setActiveSeriesCrm(null)}
        />
      ) : null}
    </ModalShell>
  );
};

export default SeriesManagerModal;
