import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/formatters';

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-sky-100 text-sky-700',
  active: 'bg-reef/10 text-reef',
  rejected: 'bg-ink/8 text-ink/45'
};

const PAYMENT_STYLES = {
  unpaid: 'bg-amber-100 text-amber-700',
  paid: 'bg-reef/10 text-reef',
  refunded: 'bg-ember/10 text-ember'
};

const createEmptyPackageDraft = () => ({
  name: '',
  tier: 'gold',
  description: '',
  price: 0,
  currency: 'INR',
  maxSlots: 1,
  perksText: 'Logo on event page, Live room placement',
  paymentLinkUrl: '',
  paymentInstructions: '',
  isActive: true,
  showOnEventPage: true,
  showInLiveRoom: true,
  showInEmails: false,
  featuredCallout: false
});

const normalizePackageDraft = (pkg) => ({
  ...pkg,
  perksText: (pkg.perks || []).join(', ')
});

const toPackagePayload = (draft) => ({
  name: draft.name.trim(),
  tier: draft.tier,
  description: draft.description?.trim() || '',
  price: Number(draft.price || 0),
  currency: (draft.currency || 'INR').toUpperCase(),
  maxSlots: Number(draft.maxSlots || 1),
  perks: (draft.perksText || '')
    .split(',')
    .map((perk) => perk.trim())
    .filter(Boolean),
  paymentLinkUrl: draft.paymentLinkUrl?.trim() || '',
  paymentInstructions: draft.paymentInstructions?.trim() || '',
  isActive: Boolean(draft.isActive),
  showOnEventPage: Boolean(draft.showOnEventPage),
  showInLiveRoom: Boolean(draft.showInLiveRoom),
  showInEmails: Boolean(draft.showInEmails),
  featuredCallout: Boolean(draft.featuredCallout)
});

const SponsorManagerModal = ({ event, onClose, onUpdated }) => {
  const [loading, setLoading] = useState(true);
  const [savingPackageId, setSavingPackageId] = useState(null);
  const [actionSponsorId, setActionSponsorId] = useState(null);
  const [error, setError] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [data, setData] = useState({
    sponsorPackages: [],
    sponsors: [],
    applications: [],
    totals: {},
    applicationLink: ''
  });
  const [packageDrafts, setPackageDrafts] = useState([]);
  const [newPackage, setNewPackage] = useState(createEmptyPackageDraft());

  const refreshData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/events/${event._id}/sponsors/manage`);
      const nextData = response.data.data;
      setData(nextData);
      setPackageDrafts((nextData.sponsorPackages || []).map(normalizePackageDraft));
      onUpdated?.();
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Unable to load sponsor manager.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [event._id]);

  useEffect(() => {
    const handler = (keyboardEvent) => keyboardEvent.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const sponsorById = useMemo(
    () =>
      (data.sponsors || []).reduce((accumulator, sponsor) => {
        accumulator[sponsor.sponsorId] = sponsor;
        return accumulator;
      }, {}),
    [data.sponsors]
  );

  const updatePackageDraft = (packageId, key, value) => {
    setPackageDrafts((current) =>
      current.map((draft) => (draft.packageId === packageId ? { ...draft, [key]: value } : draft))
    );
  };

  const updateNewPackage = (key, value) => {
    setNewPackage((current) => ({ ...current, [key]: value }));
  };

  const handleCopyLink = async () => {
    if (!data.applicationLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(data.applicationLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleCreatePackage = async () => {
    setSavingPackageId('new');
    setError(null);

    try {
      await api.post(`/api/events/${event._id}/sponsor-packages`, toPackagePayload(newPackage));
      setNewPackage(createEmptyPackageDraft());
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to create sponsor package.');
    } finally {
      setSavingPackageId(null);
    }
  };

  const handleSavePackage = async (packageId) => {
    const draft = packageDrafts.find((item) => item.packageId === packageId);
    if (!draft) {
      return;
    }

    setSavingPackageId(packageId);
    setError(null);

    try {
      await api.patch(`/api/events/${event._id}/sponsor-packages/${packageId}`, toPackagePayload(draft));
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save sponsor package.');
    } finally {
      setSavingPackageId(null);
    }
  };

  const handleDeletePackage = async (packageId) => {
    setSavingPackageId(packageId);
    setError(null);

    try {
      await api.delete(`/api/events/${event._id}/sponsor-packages/${packageId}`);
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to delete sponsor package.');
    } finally {
      setSavingPackageId(null);
    }
  };

  const handleApplicationAction = async (sponsorId, payload) => {
    setActionSponsorId(sponsorId);
    setError(null);

    try {
      await api.patch(`/api/events/${event._id}/sponsors/${sponsorId}`, payload);
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to update sponsor application.');
    } finally {
      setActionSponsorId(null);
    }
  };

  const handleRemoveSponsor = async (sponsorId) => {
    setActionSponsorId(sponsorId);
    setError(null);

    try {
      await api.delete(`/api/events/${event._id}/sponsors/${sponsorId}`);
      await refreshData();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to remove sponsor.');
    } finally {
      setActionSponsorId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(18,18,18,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-bloom"
        onClick={(eventInput) => eventInput.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-ink/10 bg-white px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-reef">Sponsor Manager</p>
            <h2 className="mt-1 font-display text-3xl text-ink">{event.title}</h2>
            <p className="mt-2 text-sm text-ink/55">
              Create packages, review sponsor applications, and activate paid placements.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
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
              <section className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
                <div className="rounded-[28px] border border-ink/10 bg-sand/60 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Public sponsor page</p>
                  <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
                    <input
                      readOnly
                      value={data.applicationLink || ''}
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-sand"
                      >
                        {copiedLink ? 'Copied' : 'Copy'}
                      </button>
                      {data.applicationLink && (
                        <a
                          href={data.applicationLink}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-sand transition hover:bg-ink/90"
                        >
                          Open
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Pending</p>
                    <p className="mt-2 font-display text-3xl text-ink">{data.totals?.pendingApplications || 0}</p>
                  </div>
                  <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Active Sponsors</p>
                    <p className="mt-2 font-display text-3xl text-reef">{data.totals?.activeSponsors || 0}</p>
                  </div>
                  <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Sponsor Revenue</p>
                    <p className="mt-2 font-display text-2xl text-ink">
                      {formatCurrency(data.totals?.sponsorRevenue || 0)}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-ink/8 bg-white px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Booth Clicks</p>
                    <p className="mt-2 font-display text-3xl text-dusk">{data.totals?.boothClicks || 0}</p>
                  </div>
                </div>
              </section>

              {error && (
                <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
              )}

              <section className="space-y-4 rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Sponsor packages</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Offer tiers</h3>
                  </div>
                  <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                    {packageDrafts.length} package{packageDrafts.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {packageDrafts.map((pkg) => (
                    <div key={pkg.packageId} className="rounded-[24px] border border-ink/10 bg-sand/60 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          value={pkg.name}
                          onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'name', eventInput.target.value)}
                          placeholder="Package name"
                          className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                        />
                        <select
                          value={pkg.tier}
                          onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'tier', eventInput.target.value)}
                          className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm focus:border-reef"
                        >
                          <option value="gold">Gold</option>
                          <option value="silver">Silver</option>
                          <option value="bronze">Bronze</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>

                      <textarea
                        value={pkg.description || ''}
                        onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'description', eventInput.target.value)}
                        rows={2}
                        placeholder="Short pitch for this package"
                        className="mt-3 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                      />

                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <input
                          type="number"
                          min="0"
                          value={pkg.price}
                          onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'price', eventInput.target.value)}
                          placeholder="Price"
                          className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                        />
                        <input
                          value={pkg.currency}
                          onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'currency', eventInput.target.value.toUpperCase())}
                          placeholder="Currency"
                          className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                        />
                        <input
                          type="number"
                          min="1"
                          value={pkg.maxSlots}
                          onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'maxSlots', eventInput.target.value)}
                          placeholder="Max slots"
                          className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                        />
                      </div>

                      <input
                        value={pkg.perksText}
                        onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'perksText', eventInput.target.value)}
                        placeholder="Perks (comma-separated)"
                        className="mt-3 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                      />
                      <input
                        value={pkg.paymentLinkUrl || ''}
                        onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'paymentLinkUrl', eventInput.target.value)}
                        placeholder="Manual payment link (optional)"
                        className="mt-3 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                      />
                      <textarea
                        value={pkg.paymentInstructions || ''}
                        onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'paymentInstructions', eventInput.target.value)}
                        rows={2}
                        placeholder="Manual payment instructions for approval email"
                        className="mt-3 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                      />

                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink/65">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pkg.isActive}
                            onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'isActive', eventInput.target.checked)}
                          />
                          Active
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pkg.showOnEventPage}
                            onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'showOnEventPage', eventInput.target.checked)}
                          />
                          Event page
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pkg.showInLiveRoom}
                            onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'showInLiveRoom', eventInput.target.checked)}
                          />
                          Live room
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pkg.showInEmails}
                            onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'showInEmails', eventInput.target.checked)}
                          />
                          Emails
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pkg.featuredCallout}
                            onChange={(eventInput) => updatePackageDraft(pkg.packageId, 'featuredCallout', eventInput.target.checked)}
                          />
                          Featured
                        </label>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-ink/45">
                          {pkg.slotsUsed || 0} / {pkg.maxSlots} slots used
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeletePackage(pkg.packageId)}
                            disabled={savingPackageId === pkg.packageId}
                            className="rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:opacity-60"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSavePackage(pkg.packageId)}
                            disabled={savingPackageId === pkg.packageId}
                            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand transition hover:bg-ink/90 disabled:opacity-60"
                          >
                            {savingPackageId === pkg.packageId ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="rounded-[24px] border border-dashed border-ink/15 bg-sand/50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">New package</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <input
                        value={newPackage.name}
                        onChange={(eventInput) => updateNewPackage('name', eventInput.target.value)}
                        placeholder="Package name"
                        className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                      />
                      <select
                        value={newPackage.tier}
                        onChange={(eventInput) => updateNewPackage('tier', eventInput.target.value)}
                        className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm focus:border-reef"
                      >
                        <option value="gold">Gold</option>
                        <option value="silver">Silver</option>
                        <option value="bronze">Bronze</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <textarea
                      value={newPackage.description}
                      onChange={(eventInput) => updateNewPackage('description', eventInput.target.value)}
                      rows={2}
                      placeholder="Short pitch for this package"
                      className="mt-3 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                    />
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <input
                        type="number"
                        min="0"
                        value={newPackage.price}
                        onChange={(eventInput) => updateNewPackage('price', eventInput.target.value)}
                        placeholder="Price"
                        className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                      />
                      <input
                        value={newPackage.currency}
                        onChange={(eventInput) => updateNewPackage('currency', eventInput.target.value.toUpperCase())}
                        placeholder="Currency"
                        className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                      />
                      <input
                        type="number"
                        min="1"
                        value={newPackage.maxSlots}
                        onChange={(eventInput) => updateNewPackage('maxSlots', eventInput.target.value)}
                        placeholder="Max slots"
                        className="rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                      />
                    </div>
                    <input
                      value={newPackage.perksText}
                      onChange={(eventInput) => updateNewPackage('perksText', eventInput.target.value)}
                      placeholder="Perks (comma-separated)"
                      className="mt-3 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                    />
                    <input
                      value={newPackage.paymentLinkUrl}
                      onChange={(eventInput) => updateNewPackage('paymentLinkUrl', eventInput.target.value)}
                      placeholder="Manual payment link (optional)"
                      className="mt-3 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                    />
                    <textarea
                      value={newPackage.paymentInstructions}
                      onChange={(eventInput) => updateNewPackage('paymentInstructions', eventInput.target.value)}
                      rows={2}
                      placeholder="Manual payment instructions for approval email"
                      className="mt-3 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-reef"
                    />
                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink/65">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newPackage.showOnEventPage}
                          onChange={(eventInput) => updateNewPackage('showOnEventPage', eventInput.target.checked)}
                        />
                        Event page
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newPackage.showInLiveRoom}
                          onChange={(eventInput) => updateNewPackage('showInLiveRoom', eventInput.target.checked)}
                        />
                        Live room
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newPackage.showInEmails}
                          onChange={(eventInput) => updateNewPackage('showInEmails', eventInput.target.checked)}
                        />
                        Emails
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newPackage.featuredCallout}
                          onChange={(eventInput) => updateNewPackage('featuredCallout', eventInput.target.checked)}
                        />
                        Featured
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreatePackage}
                      disabled={savingPackageId === 'new'}
                      className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-sand transition hover:bg-ink/90 disabled:opacity-60"
                    >
                      {savingPackageId === 'new' ? 'Creating...' : 'Create package'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="space-y-4 rounded-[28px] border border-ink/10 bg-white/80 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Applications</p>
                    <h3 className="mt-1 font-display text-2xl text-ink">Review sponsors</h3>
                  </div>
                  <span className="rounded-full bg-sand px-3 py-1 text-xs text-ink/45">
                    {data.applications?.length || 0} application{data.applications?.length === 1 ? '' : 's'}
                  </span>
                </div>

                {!data.applications?.length ? (
                  <div className="rounded-[24px] bg-sand/50 px-5 py-10 text-center">
                    <p className="text-sm text-ink/50">No sponsor applications yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {data.applications.map((application) => {
                      const relatedSponsor = sponsorById[application.sponsorId];
                      const currency = application.currency || 'INR';
                      return (
                        <article key={application._id} className="rounded-[24px] border border-ink/10 bg-sand/55 p-5">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-display text-2xl text-ink">{application.companyName}</h4>
                                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${STATUS_STYLES[application.status] || STATUS_STYLES.pending}`}>
                                  {application.status}
                                </span>
                                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${PAYMENT_STYLES[application.paymentStatus] || PAYMENT_STYLES.unpaid}`}>
                                  {application.paymentStatus}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-ink/55">
                                {application.packageName} · {formatCurrency(application.price || 0, currency)}
                              </p>
                              <p className="mt-2 text-sm text-ink/60">
                                {application.contactName} · {application.contactEmail}
                              </p>
                              {application.description && (
                                <p className="mt-3 text-sm leading-6 text-ink/70">{application.description}</p>
                              )}

                              <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink/45">
                                <span className="rounded-full border border-ink/10 bg-white px-3 py-1">
                                  Platform fee {formatCurrency(application.payout?.platformFeeAmount || 0, currency)}
                                </span>
                                <span className="rounded-full border border-ink/10 bg-white px-3 py-1">
                                  Organizer net {formatCurrency(application.payout?.organizerNetAmount || 0, currency)}
                                </span>
                                <span className="rounded-full border border-ink/10 bg-white px-3 py-1">
                                  Booth clicks {relatedSponsor?.metrics?.boothClicks || 0}
                                </span>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {(application.boothUrl || application.websiteUrl) && (
                                  <a
                                    href={application.boothUrl || application.websiteUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/60 transition hover:bg-sand"
                                  >
                                    Preview booth
                                  </a>
                                )}
                                {application.logoUrl && (
                                  <a
                                    href={application.logoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/60 transition hover:bg-sand"
                                  >
                                    View logo
                                  </a>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 lg:w-[260px] lg:justify-end">
                              {application.status !== 'active' && application.status !== 'rejected' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleApplicationAction(application.sponsorId, {
                                      status: 'approved',
                                      paymentStatus: application.paymentStatus || 'unpaid'
                                    })
                                  }
                                  disabled={actionSponsorId === application.sponsorId}
                                  className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-60"
                                >
                                  Approve
                                </button>
                              )}
                              {application.status !== 'active' && application.status !== 'rejected' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleApplicationAction(application.sponsorId, {
                                      status: 'active',
                                      paymentStatus: 'paid'
                                    })
                                  }
                                  disabled={actionSponsorId === application.sponsorId}
                                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand transition hover:bg-ink/90 disabled:opacity-60"
                                >
                                  Activate
                                </button>
                              )}
                              {application.status !== 'rejected' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleApplicationAction(application.sponsorId, {
                                      status: 'rejected',
                                      paymentStatus: application.paymentStatus
                                    })
                                  }
                                  disabled={actionSponsorId === application.sponsorId}
                                  className="rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:opacity-60"
                                >
                                  Reject
                                </button>
                              )}
                              {application.status === 'active' && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSponsor(application.sponsorId)}
                                  disabled={actionSponsorId === application.sponsorId}
                                  className="rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:opacity-60"
                                >
                                  Remove sponsor
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SponsorManagerModal;
