import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SectionHeader from '../components/SectionHeader';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/formatters';

const createInitialForm = () => ({
  packageId: '',
  companyName: '',
  logoUrl: '',
  description: '',
  boothUrl: '',
  websiteUrl: '',
  contactName: '',
  contactEmail: '',
  notes: ''
});

const SponsorApplicationPage = () => {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [packages, setPackages] = useState([]);
  const [form, setForm] = useState(createInitialForm());
  const [loading, setLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setStatus(null);

      try {
        const [eventResponse, packagesResponse] = await Promise.all([
          api.get(`/api/events/${eventId}`),
          api.get(`/api/events/${eventId}/sponsor-packages`)
        ]);
        const nextEvent = eventResponse.data.data;
        const nextPackages = packagesResponse.data.data || [];

        setEvent(nextEvent);
        setPackages(nextPackages);
        setForm((current) => ({
          ...current,
          packageId:
            current.packageId ||
            nextPackages.find((pkg) => pkg.slotsRemaining > 0)?.packageId ||
            nextPackages[0]?.packageId ||
            ''
        }));
      } catch (loadError) {
        setStatus({
          tone: 'error',
          message: loadError.response?.data?.message || 'Unable to load sponsor packages for this event.'
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [eventId]);

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.packageId === form.packageId) || packages[0],
    [packages, form.packageId]
  );

  const availablePackages = packages.filter((pkg) => pkg.slotsRemaining > 0);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleLogoUpload = async (eventInput) => {
    const file = eventInput.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingLogo(true);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/api/uploads/sponsor-logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      updateField('logoUrl', response.data.data.url);
    } catch (uploadError) {
      setStatus({
        tone: 'error',
        message: uploadError.response?.data?.message || 'Unable to upload sponsor logo.'
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (eventInput) => {
    eventInput.preventDefault();
    setSubmitting(true);
    setStatus(null);

    try {
      const response = await api.post(`/api/events/${eventId}/sponsors/apply`, {
        packageId: form.packageId,
        companyName: form.companyName,
        logoUrl: form.logoUrl,
        description: form.description,
        boothUrl: form.boothUrl,
        websiteUrl: form.websiteUrl,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        notes: form.notes
      });

      setSuccess(response.data.data);
      setForm({
        ...createInitialForm(),
        packageId: availablePackages[0]?.packageId || packages[0]?.packageId || ''
      });
    } catch (submitError) {
      setStatus({
        tone: 'error',
        message: submitError.response?.data?.message || 'Unable to submit sponsor application.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-reef border-t-transparent" />
          <p className="text-sm text-ink/50">Loading sponsor packages...</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="rounded-[32px] border border-ember/15 bg-ember/5 px-6 py-8 text-center">
        <p className="font-display text-3xl text-ink">Sponsor page unavailable</p>
        <p className="mt-3 text-sm text-ink/55">
          This event could not be loaded or is not accepting sponsor applications right now.
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="space-y-8">
        <section className="rounded-[36px] border border-reef/15 bg-white/85 p-8 shadow-bloom">
          <p className="text-xs uppercase tracking-[0.28em] text-reef">Application submitted</p>
          <h1 className="mt-3 font-display text-4xl text-ink">Your sponsor request is in review</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink/70">
            We&apos;ve recorded your sponsor application for <strong>{event.title}</strong>. The organizer has been notified,
            and your confirmation email is on the way.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] bg-sand p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Sponsor ID</p>
              <p className="mt-2 font-mono text-sm text-ink">{success.sponsorId}</p>
            </div>
            <div className="rounded-[24px] bg-sand p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Status</p>
              <p className="mt-2 font-semibold capitalize text-ink">{success.status}</p>
            </div>
            <div className="rounded-[24px] bg-sand p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Payment</p>
              <p className="mt-2 font-semibold capitalize text-ink">{success.paymentStatus}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={`/events/${eventId}`}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-sand transition hover:bg-ink/90"
            >
              Back to event
            </Link>
            <button
              type="button"
              onClick={() => setSuccess(null)}
              className="rounded-full border border-ink/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-sand"
            >
              Submit another application
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[36px] border border-ink/10 bg-white/85 shadow-bloom">
        {event.coverImageUrl && (
          <div className="relative h-56 overflow-hidden md:h-72">
            <img src={event.coverImageUrl} alt={event.title} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-white/80">Sponsor this event</p>
              <h1 className="mt-2 font-display text-4xl text-white md:text-5xl">{event.title}</h1>
            </div>
          </div>
        )}

        <div className="grid gap-8 p-6 md:grid-cols-[1.05fr,0.95fr] md:p-8">
          <div className="space-y-6">
            {!event.coverImageUrl && (
              <>
                <p className="text-xs uppercase tracking-[0.28em] text-reef">Sponsor this event</p>
                <h1 className="font-display text-4xl text-ink md:text-5xl">{event.title}</h1>
              </>
            )}

            <p className="text-base leading-7 text-ink/70">{event.summary}</p>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] bg-sand p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Starts</p>
                <p className="mt-2 font-semibold text-ink">{formatDate(event.startsAt)}</p>
              </div>
              <div className="rounded-[24px] bg-sand p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Format</p>
                <p className="mt-2 font-semibold capitalize text-ink">{event.type}</p>
              </div>
              <div className="rounded-[24px] bg-sand p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Audience</p>
                <p className="mt-2 font-semibold text-ink">{event.attendeesCount || 0} attendees</p>
              </div>
            </div>

            <SectionHeader
              eyebrow="Why sponsor"
              title="Own branded placement across the attendee journey"
              description="Approved sponsors appear on the event page before kickoff and in the live room while the event is happening."
            />

            <div className="grid gap-4 md:grid-cols-2">
              {packages.map((pkg) => (
                <label
                  key={pkg.packageId}
                  className={`block rounded-[26px] border p-5 transition ${
                    form.packageId === pkg.packageId
                      ? 'border-reef/40 bg-reef/5'
                      : 'border-ink/10 bg-sand/55'
                  } ${pkg.slotsRemaining === 0 ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-ink/45">{pkg.tier}</p>
                      <h3 className="mt-1 font-display text-2xl text-ink">{pkg.name}</h3>
                    </div>
                    <input
                      type="radio"
                      name="packageId"
                      checked={form.packageId === pkg.packageId}
                      onChange={() => updateField('packageId', pkg.packageId)}
                      disabled={pkg.slotsRemaining === 0}
                      className="mt-1 accent-reef"
                    />
                  </div>
                  <p className="mt-4 font-semibold text-ink">{formatCurrency(pkg.price, pkg.currency)}</p>
                  {pkg.description && <p className="mt-2 text-sm text-ink/60">{pkg.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(pkg.perks || []).map((perk) => (
                      <span key={perk} className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs text-ink/55">
                        {perk}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-ink/45">
                    {pkg.slotsRemaining > 0 ? `${pkg.slotsRemaining} slot${pkg.slotsRemaining === 1 ? '' : 's'} left` : 'Sold out'}
                  </p>
                </label>
              ))}
            </div>

            {!packages.length && (
              <div className="rounded-[28px] border border-dashed border-ink/15 bg-sand/50 px-6 py-10 text-center">
                <p className="font-display text-3xl text-ink">Sponsor packages are not open yet</p>
                <p className="mt-3 text-sm text-ink/55">
                  The organizer hasn&apos;t published sponsor tiers for this event yet.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-[32px] border border-ink/10 bg-sand/65 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl text-ink">Apply now</h2>
              {selectedPackage && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                  {selectedPackage.name}
                </span>
              )}
            </div>

            {availablePackages.length === 0 ? (
              <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700">
                Every sponsor package is currently full or unavailable.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <input
                  value={form.companyName}
                  onChange={(eventInput) => updateField('companyName', eventInput.target.value)}
                  placeholder="Company name"
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-reef"
                  required
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={form.contactName}
                    onChange={(eventInput) => updateField('contactName', eventInput.target.value)}
                    placeholder="Contact name"
                    className="rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-reef"
                    required
                  />
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(eventInput) => updateField('contactEmail', eventInput.target.value)}
                    placeholder="Contact email"
                    className="rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-reef"
                    required
                  />
                </div>

                <div className="rounded-[24px] border border-ink/10 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">Sponsor logo</p>
                      <p className="text-xs text-ink/45">Upload a square or transparent logo for your brand card.</p>
                    </div>
                    <label className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white">
                      {uploadingLogo ? 'Uploading...' : 'Upload logo'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                  </div>
                  {form.logoUrl && (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-sand/70 p-3">
                      <img src={form.logoUrl} alt="Sponsor logo" className="h-14 w-14 rounded-2xl bg-white p-2 object-contain" />
                      <p className="min-w-0 truncate text-sm text-ink/55">{form.logoUrl}</p>
                    </div>
                  )}
                </div>

                <input
                  type="url"
                  value={form.websiteUrl}
                  onChange={(eventInput) => updateField('websiteUrl', eventInput.target.value)}
                  placeholder="Website URL"
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-reef"
                />
                <input
                  type="url"
                  value={form.boothUrl}
                  onChange={(eventInput) => updateField('boothUrl', eventInput.target.value)}
                  placeholder="Booth / demo / Calendly URL"
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-reef"
                />
                <textarea
                  value={form.description}
                  onChange={(eventInput) => updateField('description', eventInput.target.value)}
                  rows={4}
                  placeholder="Short tagline or pitch that attendees will see"
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-reef"
                />
                <textarea
                  value={form.notes}
                  onChange={(eventInput) => updateField('notes', eventInput.target.value)}
                  rows={3}
                  placeholder="Anything the organizer should know before approval"
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none focus:border-reef"
                />

                {selectedPackage && (
                  <div className="rounded-[24px] bg-white px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Package summary</p>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="font-semibold text-ink">{selectedPackage.name}</p>
                      <p className="font-semibold text-ink">{formatCurrency(selectedPackage.price, selectedPackage.currency)}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(selectedPackage.perks || []).map((perk) => (
                        <span key={perk} className="rounded-full border border-ink/10 bg-sand px-3 py-1 text-xs text-ink/55">
                          {perk}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {status && (
                  <p className={`rounded-2xl px-4 py-3 text-sm ${status.tone === 'error' ? 'bg-ember/10 text-ember' : 'bg-reef/10 text-reef'}`}>
                    {status.message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting || !selectedPackage || availablePackages.length === 0}
                  className="w-full rounded-2xl bg-ink px-5 py-3 font-semibold text-sand transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit sponsor application'}
                </button>

                <p className="text-center text-xs text-ink/45">
                  Manual payment is supported right now. Once approved, the organizer can activate your placement after payment is confirmed.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between rounded-[28px] border border-ink/8 bg-white/60 px-5 py-4 shadow-bloom">
        <p className="text-xs text-ink/40">
          Event ID: <code className="font-mono">{eventId}</code>
        </p>
        <Link to={`/events/${eventId}`} className="text-sm font-semibold text-reef hover:underline">
          Back to event page
        </Link>
      </div>
    </div>
  );
};

export default SponsorApplicationPage;
