import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/formatters';
import ModalShell from './ModalShell';

const toDatetimeLocal = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const pad = (item) => String(item).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const createEmptyDraft = () => ({
  code: '',
  discountType: 'percentage',
  discountValue: 20,
  maxRedemptions: 100,
  startsAt: '',
  expiresAt: '',
  appliesToTierIds: [],
  active: true
});

const normalizeDraft = (promoCode) => ({
  promoCodeId: promoCode.promoCodeId,
  code: promoCode.code || '',
  discountType: promoCode.discountType || 'percentage',
  discountValue: promoCode.discountValue ?? 0,
  maxRedemptions: promoCode.maxRedemptions ?? 1,
  startsAt: toDatetimeLocal(promoCode.startsAt),
  expiresAt: toDatetimeLocal(promoCode.expiresAt),
  appliesToTierIds: promoCode.appliesToTierIds || [],
  active: promoCode.active !== false,
  redemptionsUsed: promoCode.redemptionsUsed || 0,
  redemptionsRemaining: promoCode.redemptionsRemaining || 0,
  totalDiscountGiven: promoCode.totalDiscountGiven || 0,
  isExpired: Boolean(promoCode.isExpired)
});

const toPayload = (draft) => ({
  code: draft.code.trim(),
  discountType: draft.discountType,
  discountValue: Number(draft.discountValue || 0),
  maxRedemptions: Number(draft.maxRedemptions || 1),
  startsAt: draft.startsAt || undefined,
  expiresAt: draft.expiresAt || undefined,
  appliesToTierIds: draft.appliesToTierIds || [],
  active: Boolean(draft.active)
});

const PromoCodeEditor = ({ draft, tiers, onChange }) => {
  const toggleTier = (tierId) => {
    const nextTierIds = draft.appliesToTierIds.includes(tierId)
      ? draft.appliesToTierIds.filter((item) => item !== tierId)
      : [...draft.appliesToTierIds, tierId];
    onChange('appliesToTierIds', nextTierIds);
  };

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={draft.code}
          onChange={(event) => onChange('code', event.target.value.toUpperCase())}
          placeholder="EARLYBIRD20"
          className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
        />
        <select
          value={draft.discountType}
          onChange={(event) => onChange('discountType', event.target.value)}
          className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm focus:border-reef"
        >
          <option value="percentage">Percentage discount</option>
          <option value="fixed">Fixed discount</option>
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input
          type="number"
          min="1"
          max={draft.discountType === 'percentage' ? '100' : undefined}
          value={draft.discountValue}
          onChange={(event) => onChange('discountValue', event.target.value)}
          placeholder="Discount value"
          className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
        />
        <input
          type="number"
          min="1"
          value={draft.maxRedemptions}
          onChange={(event) => onChange('maxRedemptions', event.target.value)}
          placeholder="Usage cap"
          className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
        />
        <input
          type="datetime-local"
          value={draft.startsAt}
          onChange={(event) => onChange('startsAt', event.target.value)}
          className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
        />
        <input
          type="datetime-local"
          value={draft.expiresAt}
          onChange={(event) => onChange('expiresAt', event.target.value)}
          className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Applies to tiers</p>
        <div className="flex flex-wrap gap-2">
          {tiers.map((tier) => {
            const selected = draft.appliesToTierIds.includes(tier.tierId);
            return (
              <button
                key={tier.tierId}
                type="button"
                onClick={() => toggleTier(tier.tierId)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  selected
                    ? 'bg-reef text-white'
                    : 'border border-ink/10 bg-white text-ink/60'
                }`}
              >
                {tier.name}
              </button>
            );
          })}
          {tiers.length > 0 && (
            <button
              type="button"
              onClick={() => onChange('appliesToTierIds', [])}
              className="rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-medium text-ink/60"
            >
              All tiers
            </button>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink/65">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(event) => onChange('active', event.target.checked)}
        />
        Active
      </label>
    </>
  );
};

const PromoCodeManagerModal = ({ event, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [promoCodes, setPromoCodes] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [newDraft, setNewDraft] = useState(createEmptyDraft());
  const [savingId, setSavingId] = useState(null);

  const refreshData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/events/${event._id}/promo-codes/manage`);
      const nextCodes = response.data.data || [];
      setPromoCodes(nextCodes);
      setDrafts(nextCodes.map(normalizeDraft));
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Unable to load promo codes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [event._id]);

  const updateDraft = (promoCodeId, key, value) => {
    setDrafts((current) =>
      current.map((draft) => (draft.promoCodeId === promoCodeId ? { ...draft, [key]: value } : draft))
    );
  };

  const handleCreate = async () => {
    setSavingId('new');
    setError(null);

    try {
      await api.post(`/api/events/${event._id}/promo-codes`, toPayload(newDraft));
      setNewDraft(createEmptyDraft());
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to create promo code.');
    } finally {
      setSavingId(null);
    }
  };

  const handleSave = async (promoCodeId) => {
    const draft = drafts.find((item) => item.promoCodeId === promoCodeId);
    if (!draft) {
      return;
    }

    setSavingId(promoCodeId);
    setError(null);

    try {
      await api.patch(`/api/events/${event._id}/promo-codes/${promoCodeId}`, toPayload(draft));
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save promo code.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (promoCodeId) => {
    setSavingId(promoCodeId);
    setError(null);

    try {
      await api.delete(`/api/events/${event._id}/promo-codes/${promoCodeId}`);
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to delete promo code.');
    } finally {
      setSavingId(null);
    }
  };

  const totalRedemptions = promoCodes.reduce(
    (sum, promoCode) => sum + Number(promoCode.redemptionsUsed || 0),
    0
  );
  const totalDiscountGiven = promoCodes.reduce(
    (sum, promoCode) => sum + Number(promoCode.totalDiscountGiven || 0),
    0
  );

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="promo-manager-title"
      panelClassName="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-ink/10 bg-white px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-dusk">Promo Codes</p>
            <h2 id="promo-manager-title" className="mt-1 font-display text-3xl text-ink">{event.title}</h2>
            <p className="mt-2 text-sm text-ink/55">
              Create targeted discounts with usage caps, scheduling, and per-tier control.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close promo code manager"
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
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-dusk border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Codes</p>
                  <p className="mt-2 font-display text-3xl text-ink">{promoCodes.length}</p>
                </div>
                <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Redemptions</p>
                  <p className="mt-2 font-display text-3xl text-reef">{totalRedemptions}</p>
                </div>
                <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Discount Given</p>
                  <p className="mt-2 font-display text-2xl text-ink">{formatCurrency(totalDiscountGiven)}</p>
                </div>
              </section>

              {error && (
                <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
              )}

              <section className="space-y-4 rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Create promo code</p>
                  <h3 className="mt-1 font-display text-2xl text-ink">Launch a new discount</h3>
                </div>

                <PromoCodeEditor draft={newDraft} tiers={event.ticketTiers || []} onChange={(key, value) => setNewDraft((current) => ({ ...current, [key]: value }))} />

                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={savingId === 'new'}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-sand disabled:opacity-60"
                >
                  {savingId === 'new' ? 'Creating...' : 'Create promo code'}
                </button>
              </section>

              <section className="space-y-4 rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Existing promos</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Manage active offers</h3>
                  </div>
                  <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                    {promoCodes.length} code{promoCodes.length === 1 ? '' : 's'}
                  </span>
                </div>

                {!promoCodes.length ? (
                  <div className="rounded-[24px] bg-sand/50 px-5 py-10 text-center">
                    <p className="text-sm text-ink/50">No promo codes yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {drafts.map((draft) => (
                      <article key={draft.promoCodeId} className="rounded-[24px] border border-ink/10 bg-sand/55 p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${draft.active ? 'bg-reef/10 text-reef' : 'bg-ink/8 text-ink/45'}`}>
                            {draft.active ? 'Active' : 'Paused'}
                          </span>
                          {draft.isExpired && (
                            <span className="rounded-full bg-ember/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ember">
                              Expired
                            </span>
                          )}
                          <span className="rounded-full border border-ink/10 bg-white px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-ink/45">
                            {draft.redemptionsUsed} used / {draft.maxRedemptions} cap
                          </span>
                        </div>

                        <div className="mt-4">
                          <PromoCodeEditor
                            draft={draft}
                            tiers={event.ticketTiers || []}
                            onChange={(key, value) => updateDraft(draft.promoCodeId, key, value)}
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3 text-sm text-ink/55">
                          <span>Remaining: {draft.redemptionsRemaining}</span>
                          <span>Discount given: {formatCurrency(draft.totalDiscountGiven || 0)}</span>
                          {draft.expiresAt && <span>Expires: {formatDate(draft.expiresAt)}</span>}
                        </div>

                        <div className="mt-5 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleDelete(draft.promoCodeId)}
                            disabled={savingId === draft.promoCodeId}
                            className="rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember disabled:opacity-60"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSave(draft.promoCodeId)}
                            disabled={savingId === draft.promoCodeId}
                            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand disabled:opacity-60"
                          >
                            {savingId === draft.promoCodeId ? 'Saving...' : 'Save changes'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
    </ModalShell>
  );
};

export default PromoCodeManagerModal;
