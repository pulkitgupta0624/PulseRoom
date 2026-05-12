import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';

const INTEREST_LABELS = {
  demo: 'Book a demo',
  pricing: 'Request pricing',
  partnership: 'Explore partnership',
  content: 'Get resources',
  general: 'General interest'
};

const TIER_STYLES = {
  gold: 'bg-amber-100 text-amber-700 border-amber-200',
  silver: 'bg-slate-100 text-slate-600 border-slate-200',
  bronze: 'bg-orange-100 text-orange-700 border-orange-200',
  custom: 'bg-reef/10 text-reef border-reef/20'
};

const createInitialForm = (email = '') => ({
  fullName: '',
  workEmail: email,
  companyName: '',
  roleTitle: '',
  interestType: 'demo',
  message: ''
});

const MetricTile = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[24px] border border-ink/10 bg-white/85 px-4 py-4 shadow-bloom">
    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

const SponsorBoothPage = () => {
  const { eventId, sponsorId } = useParams();
  const { user } = useSelector((state) => state.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(() => createInitialForm());
  const viewTrackedRef = useRef(false);

  useEffect(() => {
    let active = true;

    const loadBooth = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get(`/api/events/${eventId}/sponsors/${sponsorId}/booth`);
        if (!active) {
          return;
        }

        setData(response.data.data);
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.message || 'Unable to load this sponsor booth right now.');
          setData(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadBooth();
    return () => {
      active = false;
    };
  }, [eventId, sponsorId]);

  useEffect(() => {
    if (user?.email) {
      setForm((current) => ({
        ...current,
        workEmail: current.workEmail || user.email
      }));
    }
  }, [user?.email]);

  useEffect(() => {
    if (!data || viewTrackedRef.current) {
      return;
    }

    viewTrackedRef.current = true;
    api.post(`/api/events/${eventId}/sponsors/${sponsorId}/booth-view`).catch(() => {});
  }, [data, eventId, sponsorId]);

  const sponsor = data?.sponsor;
  const event = data?.event;
  const interestOptions = data?.leadCapture?.interestOptions || [];
  const primaryCtaUrl = sponsor?.boothUrl || sponsor?.websiteUrl || '';
  const secondaryCtaUrl =
    sponsor?.websiteUrl && sponsor.websiteUrl !== primaryCtaUrl ? sponsor.websiteUrl : '';

  const tierClass = useMemo(
    () => TIER_STYLES[sponsor?.tier] || TIER_STYLES.custom,
    [sponsor?.tier]
  );

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleLeadSubmit = async (eventInput) => {
    eventInput.preventDefault();
    setSubmitting(true);
    setStatus(null);

    try {
      await api.post(`/api/events/${eventId}/sponsors/${sponsorId}/leads`, form);
      setSubmitted(true);
      setStatus({
        tone: 'success',
        message: 'Your details have been shared with the sponsor team.'
      });
      setForm((current) => ({
        ...createInitialForm(user?.email || ''),
        interestType: current.interestType
      }));
    } catch (submitError) {
      setStatus({
        tone: 'error',
        message: submitError.response?.data?.message || 'Unable to submit your details right now.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const trackOutboundClick = () => {
    api.post(`/api/events/${eventId}/sponsors/${sponsorId}/click`).catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-reef border-t-transparent" />
          <p className="text-sm text-ink/50">Loading sponsor booth...</p>
        </div>
      </div>
    );
  }

  if (!data || !sponsor || !event) {
    return (
      <div className="rounded-[32px] border border-ember/15 bg-ember/5 px-6 py-10 text-center">
        <p className="font-display text-3xl text-ink">Sponsor booth unavailable</p>
        <p className="mt-3 text-sm text-ink/55">
          {error || 'This booth is not live right now.'}
        </p>
        <Link
          to={`/events/${eventId}`}
          className="mt-6 inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-sand"
        >
          Back to event
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[36px] border border-ink/10 bg-white/85 shadow-bloom">
        <div
          className="relative overflow-hidden px-6 py-8 md:px-8 md:py-10"
          style={{
            background: event.coverImageUrl
              ? `linear-gradient(135deg, rgba(17,24,39,0.84), rgba(13,167,162,0.6)), url(${event.coverImageUrl}) center/cover`
              : 'linear-gradient(135deg, #111827 0%, #0f766e 50%, #f59e0b 100%)'
          }}
        >
          <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
            <div className="space-y-6 text-white">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${tierClass}`}>
                  {sponsor.tier}
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/75">
                  {sponsor.packageName}
                </span>
                {sponsor.featuredCallout && (
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                    Featured partner
                  </span>
                )}
                {sponsor.ownerPreview && (
                  <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                    Organizer preview
                  </span>
                )}
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-[28px] border border-white/15 bg-white/95 p-3">
                  {sponsor.logoUrl ? (
                    <img
                      src={sponsor.logoUrl}
                      alt={sponsor.companyName}
                      className="h-full w-full object-contain"
                      onError={(eventInput) => {
                        eventInput.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="font-display text-2xl text-ink">
                      {sponsor.companyName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/70">Sponsor Booth</p>
                  <h1 className="mt-2 font-display text-4xl leading-tight md:text-5xl">
                    {sponsor.companyName}
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-white/78">
                    {sponsor.description || 'Connect with the team, explore what they are building, and leave your details for a follow-up.'}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-white/12 bg-white/10 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/60">Event</p>
                  <p className="mt-2 text-sm font-semibold text-white">{event.title}</p>
                </div>
                <div className="rounded-[24px] border border-white/12 bg-white/10 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/60">Starts</p>
                  <p className="mt-2 text-sm font-semibold text-white">{formatDate(event.startsAt)}</p>
                </div>
                <div className="rounded-[24px] border border-white/12 bg-white/10 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/60">Audience</p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {event.attendeesCount || 0} attendee{event.attendeesCount === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              {sponsor.highlights?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sponsor.highlights.map((highlight) => (
                    <span
                      key={highlight}
                      className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/82"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {primaryCtaUrl && (
                  <a
                    href={primaryCtaUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={trackOutboundClick}
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-sand"
                  >
                    {sponsor.boothUrl ? 'Book a demo' : 'Visit website'}
                  </a>
                )}
                {secondaryCtaUrl && (
                  <a
                    href={secondaryCtaUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={trackOutboundClick}
                    className="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/18"
                  >
                    Visit website
                  </a>
                )}
                <Link
                  to={`/events/${eventId}`}
                  className="rounded-full border border-white/20 bg-black/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/20"
                >
                  Back to event
                </Link>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/15 bg-white/92 p-5 shadow-bloom backdrop-blur">
              <p className="text-xs uppercase tracking-[0.22em] text-reef">Lead Capture</p>
              <h2 className="mt-2 font-display text-3xl text-ink">Meet the sponsor team</h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                Share what you are interested in and the sponsor team can follow up after the event.
              </p>

              {submitted && (
                <div className="mt-4 rounded-[24px] border border-reef/20 bg-reef/8 px-4 py-4">
                  <p className="font-semibold text-reef">Details sent successfully.</p>
                  <p className="mt-1 text-sm text-ink/60">
                    If you want to send another request later, you can update the form again.
                  </p>
                </div>
              )}

              {status && (
                <p
                  className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                    status.tone === 'error' ? 'bg-ember/10 text-ember' : 'bg-reef/10 text-reef'
                  }`}
                >
                  {status.message}
                </p>
              )}

              <form onSubmit={handleLeadSubmit} className="mt-5 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={form.fullName}
                    onChange={(eventInput) => updateField('fullName', eventInput.target.value)}
                    placeholder="Full name"
                    className="rounded-2xl border border-ink/10 bg-sand/65 px-4 py-3 text-sm outline-none focus:border-reef"
                    required
                  />
                  <input
                    type="email"
                    value={form.workEmail}
                    onChange={(eventInput) => updateField('workEmail', eventInput.target.value)}
                    placeholder="Work email"
                    className="rounded-2xl border border-ink/10 bg-sand/65 px-4 py-3 text-sm outline-none focus:border-reef"
                    required
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={form.companyName}
                    onChange={(eventInput) => updateField('companyName', eventInput.target.value)}
                    placeholder="Company"
                    className="rounded-2xl border border-ink/10 bg-sand/65 px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                  <input
                    value={form.roleTitle}
                    onChange={(eventInput) => updateField('roleTitle', eventInput.target.value)}
                    placeholder="Role / title"
                    className="rounded-2xl border border-ink/10 bg-sand/65 px-4 py-3 text-sm outline-none focus:border-reef"
                  />
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">
                    What are you here for?
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {interestOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => updateField('interestType', option)}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                          form.interestType === option
                            ? 'border-reef/35 bg-reef/10 text-reef'
                            : 'border-ink/10 bg-white text-ink/55 hover:border-reef/20 hover:text-reef'
                        }`}
                      >
                        {INTEREST_LABELS[option] || option}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={form.message}
                  onChange={(eventInput) => updateField('message', eventInput.target.value)}
                  rows={4}
                  placeholder="Optional message. Tell the sponsor team what you want to discuss."
                  className="w-full rounded-2xl border border-ink/10 bg-sand/65 px-4 py-3 text-sm outline-none focus:border-reef"
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-sand transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Sending...' : 'Share my details'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {sponsor.ownerPreview && sponsor.metrics && (
        <section className="grid gap-4 md:grid-cols-3">
          <MetricTile label="Booth Views" value={sponsor.metrics.boothViews || 0} />
          <MetricTile label="Outbound Clicks" value={sponsor.metrics.boothClicks || 0} accent="text-dusk" />
          <MetricTile label="Leads Captured" value={sponsor.metrics.leadsCaptured || 0} accent="text-reef" />
        </section>
      )}
    </div>
  );
};

export default SponsorBoothPage;
