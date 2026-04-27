import { Link } from 'react-router-dom';
import SectionHeader from './SectionHeader';
import { api } from '../lib/api';

const TIER_META = {
  gold: {
    label: 'Gold',
    badge: 'bg-amber-100 text-amber-700 border-amber-200'
  },
  silver: {
    label: 'Silver',
    badge: 'bg-slate-100 text-slate-600 border-slate-200'
  },
  bronze: {
    label: 'Bronze',
    badge: 'bg-orange-100 text-orange-700 border-orange-200'
  },
  custom: {
    label: 'Partner',
    badge: 'bg-reef/10 text-reef border-reef/20'
  }
};

const groupSponsorsByTier = (sponsors = []) =>
  sponsors.reduce((groups, sponsor) => {
    if (!sponsor.showOnEventPage) {
      return groups;
    }

    const tier = sponsor.tier || 'custom';
    groups[tier] = groups[tier] || [];
    groups[tier].push(sponsor);
    return groups;
  }, {});

const EventSponsorSection = ({ eventId, sponsors = [], canApply = false }) => {
  const groups = groupSponsorsByTier(sponsors);
  const visibleSponsors = Object.values(groups).flat();
  const tierOrder = ['gold', 'silver', 'bronze', 'custom'].filter((tier) => groups[tier]?.length);

  if (!visibleSponsors.length && !canApply) {
    return null;
  }

  const trackSponsorClick = (sponsorId) => {
    api.post(`/api/events/${eventId}/sponsors/${sponsorId}/click`).catch(() => {});
  };

  return (
    <section className="rounded-[32px] border border-ink/10 bg-white/80 p-6 shadow-bloom">
      <SectionHeader
        eyebrow="Sponsors"
        title="Brands backing this experience"
        description={
          visibleSponsors.length
            ? 'Featured partners are visible before the event starts and during the live session.'
            : 'Sponsorship is open for this event. Secure a slot and put your brand in front of every attendee.'
        }
        actions={
          canApply ? (
            <Link
              to={`/events/${eventId}/sponsor`}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-sand transition hover:bg-ink/90"
            >
              Become a sponsor
            </Link>
          ) : null
        }
      />

      {visibleSponsors.length ? (
        <div className="mt-6 space-y-6">
          {tierOrder.map((tier) => (
            <div key={tier} className="space-y-4">
              <div className="flex items-center gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${TIER_META[tier].badge}`}>
                  {TIER_META[tier].label}
                </span>
                <p className="text-sm text-ink/50">{groups[tier].length} sponsor{groups[tier].length !== 1 ? 's' : ''}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {groups[tier].map((sponsor) => {
                  const destination = sponsor.boothUrl || sponsor.websiteUrl;
                  return (
                    <article
                      key={sponsor.sponsorId}
                      className="rounded-[28px] border border-ink/10 bg-sand/60 p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display text-2xl text-ink">{sponsor.companyName}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/40">
                            {sponsor.packageName}
                          </p>
                        </div>
                        {sponsor.featuredCallout && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                            Featured
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex h-20 items-center justify-center rounded-[24px] border border-ink/8 bg-white px-4 py-3">
                        {sponsor.logoUrl ? (
                          <img
                            src={sponsor.logoUrl}
                            alt={sponsor.companyName}
                            className="max-h-12 w-full object-contain"
                            onError={(eventInput) => {
                              eventInput.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/45">
                            {sponsor.companyName}
                          </span>
                        )}
                      </div>

                      {sponsor.description && (
                        <p className="mt-4 text-sm leading-6 text-ink/65">{sponsor.description}</p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {destination ? (
                          <a
                            href={destination}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => trackSponsorClick(sponsor.sponsorId)}
                            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand transition hover:bg-ink/90"
                          >
                            Visit booth
                          </a>
                        ) : (
                          <span className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/45">
                            Booth link coming soon
                          </span>
                        )}

                        {sponsor.websiteUrl && sponsor.websiteUrl !== destination && (
                          <a
                            href={sponsor.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/60 transition hover:bg-sand"
                          >
                            Website
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-[28px] border border-dashed border-ink/15 bg-sand/50 px-6 py-10 text-center">
          <p className="font-display text-3xl text-ink">Be the first sponsor on this event</p>
          <p className="mt-3 text-sm text-ink/55">
            Reserve a branded placement on the event page and inside the live room before the sponsor board fills up.
          </p>
        </div>
      )}
    </section>
  );
};

export default EventSponsorSection;
