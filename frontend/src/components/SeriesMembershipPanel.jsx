import { Link } from 'react-router-dom';
import { formatCurrency } from '../lib/formatters';

const resolveSeriesId = (series) => series?.seriesId || series?._id || '';

const resolveSeriesAccent = (series) =>
  series?.accentColor || series?.theme?.accentColor || '#1D7A85';

const resolveSeriesCover = (series) =>
  series?.coverImageUrl || series?.theme?.coverImageUrl || '';

const SeriesMembershipPanel = ({
  series,
  joining = false,
  onJoin = null,
  status = null,
  showJoinAction = true,
  compact = false
}) => {
  if (!series) {
    return null;
  }

  const seriesId = resolveSeriesId(series);
  const membershipSettings = series.membershipSettings || {};
  const viewerMembership = series.viewerMembership || null;
  const planName = viewerMembership?.perks?.planName || membershipSettings.planName || series.planName || 'Series Pass';
  const perks = viewerMembership?.perks?.perks?.length
    ? viewerMembership.perks.perks
    : membershipSettings.perks || [];
  const accentColor = resolveSeriesAccent(series);
  const accentStyles = {
    borderColor: `${accentColor}2E`,
    background: `linear-gradient(135deg, ${accentColor}14, rgba(255,255,255,0.96))`
  };
  const coverImageUrl = resolveSeriesCover(series);
  const canJoin = Boolean(
    showJoinAction &&
      !viewerMembership &&
      membershipSettings.enabled &&
      membershipSettings.allowSelfJoin !== false &&
      onJoin
  );

  return (
    <section className="overflow-hidden rounded-[28px] border shadow-bloom" style={accentStyles}>
      {coverImageUrl && !compact && (
        <div className="h-36 w-full overflow-hidden">
          <img src={coverImageUrl} alt={series.name} className="h-full w-full object-cover" />
        </div>
      )}

      <div className={compact ? 'space-y-4 p-5' : 'space-y-5 p-6'}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white"
                style={{ backgroundColor: accentColor }}
              >
                {series.cadenceLabel || 'Series'}
              </span>
              {viewerMembership ? (
                <span className="rounded-full border border-reef/20 bg-reef/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-reef">
                  {planName} active
                </span>
              ) : membershipSettings.membersOnlyBooking ? (
                <span className="rounded-full border border-dusk/20 bg-dusk/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-dusk">
                  Members-only booking
                </span>
              ) : null}
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Recurring series</p>
              <h3 className={compact ? 'mt-2 font-display text-2xl text-ink' : 'mt-2 font-display text-3xl text-ink'}>
                {series.name}
              </h3>
              {series.summary ? (
                <p className="mt-2 max-w-2xl text-sm text-ink/68">{series.summary}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {seriesId ? (
              <Link
                to={`/series/${seriesId}`}
                className="rounded-full border border-ink/12 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sand"
              >
                View series
              </Link>
            ) : null}
            {canJoin ? (
              <button
                type="button"
                onClick={onJoin}
                disabled={joining}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ backgroundColor: accentColor }}
              >
                {joining ? 'Joining...' : `Join ${planName}`}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-ink/8 bg-white/85 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Member discount</p>
            <p className="mt-2 font-display text-3xl text-ink">
              {membershipSettings.discountPercent > 0 ? `${membershipSettings.discountPercent}%` : 'None'}
            </p>
          </div>
          <div className="rounded-[22px] border border-ink/8 bg-white/85 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Early access</p>
            <p className="mt-2 font-display text-3xl text-ink">
              {membershipSettings.earlyAccessHours > 0 ? `${membershipSettings.earlyAccessHours}h` : 'Live'}
            </p>
          </div>
          <div className="rounded-[22px] border border-ink/8 bg-white/85 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Pass value</p>
            <p className="mt-2 font-display text-3xl text-ink">
              {Number(membershipSettings.price || 0) > 0
                ? formatCurrency(membershipSettings.price, membershipSettings.currency || 'INR')
                : 'Free'}
            </p>
          </div>
        </div>

        {perks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {perks.map((perk) => (
              <span key={perk} className="rounded-full border border-ink/10 bg-white/80 px-3 py-1 text-xs text-ink/65">
                {perk}
              </span>
            ))}
          </div>
        ) : null}

        {status ? (
          <p
            className={`rounded-2xl px-4 py-3 text-sm ${
              status.tone === 'success'
                ? 'bg-reef/10 text-reef'
                : status.tone === 'error'
                  ? 'bg-ember/10 text-ember'
                  : 'bg-dusk/10 text-dusk'
            }`}
          >
            {status.message}
          </p>
        ) : null}
      </div>
    </section>
  );
};

export default SeriesMembershipPanel;
