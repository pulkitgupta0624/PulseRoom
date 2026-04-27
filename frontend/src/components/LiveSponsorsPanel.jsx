import { api } from '../lib/api';

const TIER_META = {
  gold: {
    label: 'Gold',
    badge: 'bg-amber-100 text-amber-700'
  },
  silver: {
    label: 'Silver',
    badge: 'bg-slate-100 text-slate-600'
  },
  bronze: {
    label: 'Bronze',
    badge: 'bg-orange-100 text-orange-700'
  },
  custom: {
    label: 'Partner',
    badge: 'bg-reef/10 text-reef'
  }
};

const groupSponsorsByTier = (sponsors = []) =>
  sponsors.reduce((groups, sponsor) => {
    if (!sponsor.showInLiveRoom) {
      return groups;
    }

    const tier = sponsor.tier || 'custom';
    groups[tier] = groups[tier] || [];
    groups[tier].push(sponsor);
    return groups;
  }, {});

const LiveSponsorsPanel = ({ eventId, sponsors = [] }) => {
  const groups = groupSponsorsByTier(sponsors);
  const tierOrder = ['gold', 'silver', 'bronze', 'custom'].filter((tier) => groups[tier]?.length);

  if (!tierOrder.length) {
    return null;
  }

  const trackSponsorClick = (sponsorId) => {
    api.post(`/api/events/${eventId}/sponsors/${sponsorId}/click`).catch(() => {});
  };

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Sponsors</p>
          <h2 className="mt-1 font-display text-2xl text-ink">In the room</h2>
        </div>
        <span className="rounded-full border border-ink/10 bg-sand px-3 py-1 text-xs text-ink/50">
          {tierOrder.reduce((count, tier) => count + groups[tier].length, 0)} live
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {tierOrder.map((tier) => (
          <div key={tier} className="space-y-3 rounded-[24px] bg-sand/60 p-4">
            <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${TIER_META[tier].badge}`}>
              {TIER_META[tier].label}
            </span>

            <div className="space-y-3">
              {groups[tier].map((sponsor) => {
                const destination = sponsor.boothUrl || sponsor.websiteUrl;
                return (
                  <div key={sponsor.sponsorId} className="rounded-2xl border border-ink/8 bg-white px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-ink/8 bg-sand px-2">
                        {sponsor.logoUrl ? (
                          <img
                            src={sponsor.logoUrl}
                            alt={sponsor.companyName}
                            className="max-h-8 w-full object-contain"
                            onError={(eventInput) => {
                              eventInput.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                            {sponsor.companyName.slice(0, 2)}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{sponsor.companyName}</p>
                        <p className="truncate text-xs text-ink/45">{sponsor.packageName}</p>
                      </div>
                    </div>

                    {destination ? (
                      <a
                        href={destination}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => trackSponsorClick(sponsor.sponsorId)}
                        className="mt-3 inline-flex rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-white"
                      >
                        Visit booth
                      </a>
                    ) : (
                      <p className="mt-3 text-xs text-ink/40">Booth link coming soon</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveSponsorsPanel;
