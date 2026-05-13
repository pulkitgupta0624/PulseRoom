import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import SectionHeader from '../components/SectionHeader';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/formatters';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

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

const LEAD_STATUS_STYLES = {
  new: 'bg-sand text-ink/60',
  contacted: 'bg-sky-100 text-sky-700',
  qualified: 'bg-reef/10 text-reef',
  closed: 'bg-ink/8 text-ink/45'
};

const LEAD_STATUS_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  closed: 'Closed'
};

const createProfileDraft = (sponsor) => ({
  companyName: sponsor?.companyName || '',
  logoUrl: sponsor?.logoUrl || '',
  description: sponsor?.description || '',
  boothUrl: sponsor?.boothUrl || '',
  websiteUrl: sponsor?.websiteUrl || '',
  contactName: sponsor?.contactName || '',
  contactEmail: sponsor?.contactEmail || '',
  notes: sponsor?.notes || '',
  showOnEventPage: Boolean(sponsor?.showOnEventPage),
  showInLiveRoom: Boolean(sponsor?.showInLiveRoom),
  showInEmails: Boolean(sponsor?.showInEmails),
  featuredCallout: Boolean(sponsor?.featuredCallout)
});

const createLeadDrafts = (leads = []) =>
  leads.reduce((accumulator, lead) => {
    accumulator[lead.leadId] = {
      status: lead.status || 'new',
      followUpNotes: lead.followUpNotes || ''
    };
    return accumulator;
  }, {});

const buildLeadPipeline = (leads = []) => {
  const counts = {
    new: 0,
    contacted: 0,
    qualified: 0,
    closed: 0
  };

  leads.forEach((lead) => {
    const status = counts[lead.status] !== undefined ? lead.status : 'new';
    counts[status] += 1;
  });

  return {
    total: leads.length,
    counts
  };
};

const SponsorPortalPage = () => {
  const { eventId, sponsorId } = useParams();
  const [searchParams] = useSearchParams();
  const accessToken = searchParams.get('access') || '';

  const [loading, setLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingLeadId, setSavingLeadId] = useState('');
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(null);
  const [profileDraft, setProfileDraft] = useState(createProfileDraft());
  const [leadDrafts, setLeadDrafts] = useState({});

  const requestConfig = accessToken
    ? {
        params: {
          access: accessToken
        }
      }
    : {};

  const loadPortal = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(
        `/api/events/${eventId}/sponsors/${sponsorId}/portal`,
        requestConfig
      );
      const nextData = response.data.data;
      setData(nextData);
      setProfileDraft(createProfileDraft(nextData.sponsor));
      setLeadDrafts(createLeadDrafts(nextData.leads || []));
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Unable to load the sponsor workspace right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortal();
  }, [eventId, sponsorId, accessToken]);

  const updateProfile = (key, value) => {
    setProfileDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  const updateLeadDraft = (leadId, key, value) => {
    setLeadDrafts((current) => ({
      ...current,
      [leadId]: {
        ...(current[leadId] || {
          status: 'new',
          followUpNotes: ''
        }),
        [key]: value
      }
    }));
  };

  const handleLogoUpload = async (eventInput) => {
    const file = eventInput.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingLogo(true);
    setStatus(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/api/uploads/sponsor-logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      updateProfile('logoUrl', response.data.data.url);
    } catch (uploadError) {
      setError(uploadError.response?.data?.message || 'Unable to upload sponsor logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveProfile = async (eventInput) => {
    eventInput.preventDefault();
    setSavingProfile(true);
    setStatus(null);
    setError(null);

    try {
      await api.patch(
        `/api/events/${eventId}/sponsors/${sponsorId}/portal`,
        {
          companyName: profileDraft.companyName,
          logoUrl: profileDraft.logoUrl,
          description: profileDraft.description,
          boothUrl: profileDraft.boothUrl,
          websiteUrl: profileDraft.websiteUrl,
          contactName: profileDraft.contactName,
          contactEmail: profileDraft.contactEmail,
          notes: profileDraft.notes,
          showOnEventPage: profileDraft.showOnEventPage,
          showInLiveRoom: profileDraft.showInLiveRoom,
          showInEmails: profileDraft.showInEmails,
          featuredCallout: profileDraft.featuredCallout
        },
        requestConfig
      );
      setStatus({
        tone: 'success',
        message: 'Sponsor workspace updated.'
      });
      await loadPortal();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to save sponsor details.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveLead = async (leadId) => {
    const draft = leadDrafts[leadId];
    if (!draft) {
      return;
    }

    setSavingLeadId(leadId);
    setStatus(null);
    setError(null);

    try {
      const response = await api.patch(
        `/api/events/${eventId}/sponsors/${sponsorId}/portal/leads/${leadId}`,
        {
          status: draft.status,
          followUpNotes: draft.followUpNotes
        },
        requestConfig
      );
      const updatedLead = response.data.data;

      setLeadDrafts((current) => ({
        ...current,
        [leadId]: {
          status: updatedLead.status || 'new',
          followUpNotes: updatedLead.followUpNotes || ''
        }
      }));
      setData((current) => {
        if (!current) {
          return current;
        }

        const nextLeads = (current.leads || []).map((lead) =>
          lead.leadId === leadId ? updatedLead : lead
        );

        return {
          ...current,
          leads: nextLeads,
          leadPipeline: buildLeadPipeline(nextLeads)
        };
      });
      setStatus({
        tone: 'success',
        message: 'Lead status updated.'
      });
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Unable to update lead status.');
    } finally {
      setSavingLeadId('');
    }
  };

  const handleExportLeads = () => {
    const query = accessToken ? `?access=${encodeURIComponent(accessToken)}` : '';
    window.open(
      `${API_BASE_URL}/api/events/${eventId}/sponsors/${sponsorId}/portal/leads.csv${query}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-reef border-t-transparent" />
          <p className="text-sm text-ink/50">Loading sponsor workspace...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="Sponsor Workspace"
          title="Sponsor access unavailable"
          description="This workspace link may be incomplete, expired, or no longer active for the event."
        />
        {error && (
          <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
        )}
      </div>
    );
  }

  const sponsor = data.sponsor || {};
  const event = data.event || {};
  const sponsorPackage = data.package || null;
  const links = data.links || {};
  const leadPipeline = data.leadPipeline || buildLeadPipeline(data.leads || []);

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Sponsor Workspace"
        title={sponsor.companyName || 'Sponsor portal'}
        description="Update booth assets, keep contact details fresh, and work incoming leads without waiting on the organizer."
      />

      {error && (
        <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
      )}

      {status && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${
            status.tone === 'success' ? 'bg-reef/10 text-reef' : 'bg-ember/10 text-ember'
          }`}
        >
          {status.message}
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
          <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Application status</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                STATUS_STYLES[sponsor.status] || STATUS_STYLES.pending
              }`}
            >
              {sponsor.status || 'pending'}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                PAYMENT_STYLES[sponsor.paymentStatus] || PAYMENT_STYLES.unpaid
              }`}
            >
              {sponsor.paymentStatus || 'unpaid'}
            </span>
          </div>
          <p className="mt-4 text-sm text-ink/60">
            {sponsor.packageName || sponsorPackage?.name || 'Sponsor package'}
          </p>
          <p className="mt-1 font-display text-3xl text-ink">
            {formatCurrency(sponsor.price || sponsorPackage?.price || 0, sponsor.currency || sponsorPackage?.currency || 'INR')}
          </p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
          <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Booth views</p>
          <p className="mt-3 font-display text-4xl text-ink">{sponsor.metrics?.boothViews || 0}</p>
          <p className="mt-2 text-sm text-ink/55">People who opened your booth placement.</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
          <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Booth clicks</p>
          <p className="mt-3 font-display text-4xl text-dusk">{sponsor.metrics?.boothClicks || 0}</p>
          <p className="mt-2 text-sm text-ink/55">Outbound clicks to your CTA or website.</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
          <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Captured leads</p>
          <p className="mt-3 font-display text-4xl text-reef">{leadPipeline.total || 0}</p>
          <p className="mt-2 text-sm text-ink/55">Attendees who shared their details with you.</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <form
          onSubmit={handleSaveProfile}
          className="rounded-[32px] border border-ink/10 bg-white/82 p-6 shadow-bloom"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-reef">Brand setup</p>
              <h2 className="mt-1 font-display text-3xl text-ink">Sponsor profile</h2>
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-sand transition hover:bg-ink/90 disabled:opacity-60"
            >
              {savingProfile ? 'Saving...' : 'Save workspace'}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <input
              value={profileDraft.companyName}
              onChange={(eventInput) => updateProfile('companyName', eventInput.target.value)}
              placeholder="Company name"
              className="w-full rounded-2xl border border-ink/10 bg-sand/55 px-4 py-3 outline-none focus:border-reef"
            />

            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={profileDraft.contactName}
                onChange={(eventInput) => updateProfile('contactName', eventInput.target.value)}
                placeholder="Contact name"
                className="rounded-2xl border border-ink/10 bg-sand/55 px-4 py-3 outline-none focus:border-reef"
              />
              <input
                type="email"
                value={profileDraft.contactEmail}
                onChange={(eventInput) => updateProfile('contactEmail', eventInput.target.value)}
                placeholder="Contact email"
                className="rounded-2xl border border-ink/10 bg-sand/55 px-4 py-3 outline-none focus:border-reef"
              />
            </div>

            <div className="rounded-[24px] border border-ink/10 bg-sand/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Logo</p>
                  <p className="text-xs text-ink/45">
                    Keep your booth card fresh with the latest brand mark.
                  </p>
                </div>
                <label className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sand">
                  {uploadingLogo ? 'Uploading...' : 'Upload logo'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
              </div>
              {profileDraft.logoUrl && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
                  <img
                    src={profileDraft.logoUrl}
                    alt="Sponsor logo"
                    className="h-14 w-14 rounded-2xl bg-sand p-2 object-contain"
                  />
                  <p className="min-w-0 truncate text-sm text-ink/55">{profileDraft.logoUrl}</p>
                </div>
              )}
            </div>

            <input
              type="url"
              value={profileDraft.websiteUrl}
              onChange={(eventInput) => updateProfile('websiteUrl', eventInput.target.value)}
              placeholder="Website URL"
              className="w-full rounded-2xl border border-ink/10 bg-sand/55 px-4 py-3 outline-none focus:border-reef"
            />

            <input
              type="url"
              value={profileDraft.boothUrl}
              onChange={(eventInput) => updateProfile('boothUrl', eventInput.target.value)}
              placeholder="Primary CTA / demo booking URL"
              className="w-full rounded-2xl border border-ink/10 bg-sand/55 px-4 py-3 outline-none focus:border-reef"
            />

            <textarea
              value={profileDraft.description}
              onChange={(eventInput) => updateProfile('description', eventInput.target.value)}
              rows={4}
              placeholder="Short booth pitch attendees should see"
              className="w-full rounded-2xl border border-ink/10 bg-sand/55 px-4 py-3 outline-none focus:border-reef"
            />

            <textarea
              value={profileDraft.notes}
              onChange={(eventInput) => updateProfile('notes', eventInput.target.value)}
              rows={3}
              placeholder="Internal note or setup message for the organizer"
              className="w-full rounded-2xl border border-ink/10 bg-sand/55 px-4 py-3 outline-none focus:border-reef"
            />

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-sand/50 px-4 py-3 text-sm text-ink/65">
                <input
                  type="checkbox"
                  checked={profileDraft.showOnEventPage}
                  onChange={(eventInput) => updateProfile('showOnEventPage', eventInput.target.checked)}
                />
                Show on event page
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-sand/50 px-4 py-3 text-sm text-ink/65">
                <input
                  type="checkbox"
                  checked={profileDraft.showInLiveRoom}
                  onChange={(eventInput) => updateProfile('showInLiveRoom', eventInput.target.checked)}
                />
                Show in live room
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-sand/50 px-4 py-3 text-sm text-ink/65">
                <input
                  type="checkbox"
                  checked={profileDraft.showInEmails}
                  onChange={(eventInput) => updateProfile('showInEmails', eventInput.target.checked)}
                />
                Show in event emails
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-sand/50 px-4 py-3 text-sm text-ink/65">
                <input
                  type="checkbox"
                  checked={profileDraft.featuredCallout}
                  onChange={(eventInput) => updateProfile('featuredCallout', eventInput.target.checked)}
                />
                Featured callout
              </label>
            </div>
          </div>
        </form>

        <div className="space-y-5">
          <section className="rounded-[32px] border border-ink/10 bg-white/82 p-6 shadow-bloom">
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Event snapshot</p>
            <h2 className="mt-2 font-display text-3xl text-ink">{event.title}</h2>
            <p className="mt-3 text-sm leading-6 text-ink/60">{event.summary}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] bg-sand/65 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Starts</p>
                <p className="mt-2 text-sm font-semibold text-ink">{formatDate(event.startsAt)}</p>
              </div>
              <div className="rounded-[24px] bg-sand/65 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Format</p>
                <p className="mt-2 text-sm font-semibold capitalize text-ink">{event.type}</p>
              </div>
              <div className="rounded-[24px] bg-sand/65 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Audience</p>
                <p className="mt-2 text-sm font-semibold text-ink">{event.attendeesCount || 0} attendees</p>
              </div>
              <div className="rounded-[24px] bg-sand/65 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Location</p>
                <p className="mt-2 text-sm font-semibold text-ink">
                  {[event.city, event.country].filter(Boolean).join(' · ') || 'Online'}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={links.eventUrl || `/events/${eventId}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white"
              >
                Event page
              </a>
              {links.boothPageUrl && (
                <a
                  href={links.boothPageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white"
                >
                  Public booth
                </a>
              )}
              <Link
                to={`/events/${eventId}`}
                className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand transition hover:bg-ink/90"
              >
                View event in app
              </Link>
            </div>
          </section>

          <section className="rounded-[32px] border border-ink/10 bg-white/82 p-6 shadow-bloom">
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Package details</p>
            <h2 className="mt-2 font-display text-3xl text-ink">{sponsorPackage?.name || sponsor.packageName}</h2>
            {sponsorPackage?.description && (
              <p className="mt-3 text-sm leading-6 text-ink/60">{sponsorPackage.description}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {(sponsorPackage?.perks || []).map((perk) => (
                <span key={perk} className="rounded-full border border-ink/10 bg-sand px-3 py-1 text-xs text-ink/55">
                  {perk}
                </span>
              ))}
            </div>

            {(sponsorPackage?.paymentLinkUrl || sponsorPackage?.paymentInstructions) && (
              <div className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Payment details</p>
                {sponsorPackage?.paymentInstructions && (
                  <p className="mt-3 text-sm leading-6 text-amber-900/80">
                    {sponsorPackage.paymentInstructions}
                  </p>
                )}
                {sponsorPackage?.paymentLinkUrl && (
                  <a
                    href={sponsorPackage.paymentLinkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand transition hover:bg-ink/90"
                  >
                    Complete payment
                  </a>
                )}
              </div>
            )}

            {(sponsor.approvedAt || sponsor.activatedAt) && (
              <div className="mt-5 space-y-2 text-sm text-ink/55">
                {sponsor.approvedAt && <p>Approved {formatDate(sponsor.approvedAt)}</p>}
                {sponsor.activatedAt && <p>Activated {formatDate(sponsor.activatedAt)}</p>}
              </div>
            )}
          </section>
        </div>
      </section>

      <section className="rounded-[32px] border border-ink/10 bg-white/82 p-6 shadow-bloom">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-reef">Lead pipeline</p>
            <h2 className="mt-1 font-display text-3xl text-ink">Sponsor inbox</h2>
          </div>
          <button
            type="button"
            onClick={handleExportLeads}
            className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white"
          >
            Export CSV
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {['new', 'contacted', 'qualified', 'closed'].map((statusKey) => (
            <div key={statusKey} className="rounded-[24px] bg-sand/65 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">
                {LEAD_STATUS_LABELS[statusKey]}
              </p>
              <p className="mt-2 font-display text-3xl text-ink">
                {leadPipeline.counts?.[statusKey] || 0}
              </p>
            </div>
          ))}
        </div>

        {!data.leads?.length ? (
          <div className="mt-6 rounded-[26px] border border-dashed border-ink/12 bg-sand/45 px-6 py-12 text-center">
            <p className="font-display text-3xl text-ink">No leads yet</p>
            <p className="mt-3 text-sm text-ink/55">
              Once attendees share their details from your booth, this workspace will turn into a real pipeline.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {data.leads.map((lead) => {
              const draft = leadDrafts[lead.leadId] || {
                status: lead.status || 'new',
                followUpNotes: lead.followUpNotes || ''
              };

              return (
                <article key={lead.leadId} className="rounded-[26px] border border-ink/10 bg-sand/50 p-5">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-2xl text-ink">{lead.fullName}</h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                            LEAD_STATUS_STYLES[lead.status] || LEAD_STATUS_STYLES.new
                          }`}
                        >
                          {LEAD_STATUS_LABELS[lead.status] || lead.status}
                        </span>
                        <span className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs text-ink/50">
                          {lead.interestType}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink/60">
                        <a href={`mailto:${lead.workEmail}`} className="font-medium text-reef hover:underline">
                          {lead.workEmail}
                        </a>
                        {lead.companyName && <span>{lead.companyName}</span>}
                        {lead.roleTitle && <span>{lead.roleTitle}</span>}
                      </div>

                      {lead.message && (
                        <p className="mt-3 text-sm leading-6 text-ink/70">{lead.message}</p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink/45">
                        <span>Captured {formatDate(lead.createdAt)}</span>
                        {lead.lastContactedAt && <span>Last contacted {formatDate(lead.lastContactedAt)}</span>}
                      </div>
                    </div>

                    <div className="w-full max-w-xl space-y-3">
                      <select
                        value={draft.status}
                        onChange={(eventInput) => updateLeadDraft(lead.leadId, 'status', eventInput.target.value)}
                        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="qualified">Qualified</option>
                        <option value="closed">Closed</option>
                      </select>

                      <textarea
                        value={draft.followUpNotes}
                        onChange={(eventInput) =>
                          updateLeadDraft(lead.leadId, 'followUpNotes', eventInput.target.value)
                        }
                        rows={4}
                        placeholder="Add follow-up notes, handoff details, or next steps"
                        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none focus:border-reef"
                      />

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveLead(lead.leadId)}
                          disabled={savingLeadId === lead.leadId}
                          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand transition hover:bg-ink/90 disabled:opacity-60"
                        >
                          {savingLeadId === lead.leadId ? 'Saving...' : 'Save lead'}
                        </button>
                        <a
                          href={`mailto:${lead.workEmail}?subject=${encodeURIComponent(`Follow-up from ${sponsor.companyName || lead.sponsorCompanyName}`)}`}
                          className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sand"
                        >
                          Email lead
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default SponsorPortalPage;
