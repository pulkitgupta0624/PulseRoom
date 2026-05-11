import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip
} from 'recharts';
import SectionHeader from './SectionHeader';
import { formatCurrency, formatDate } from '../lib/formatters';

const panelClass = 'rounded-[30px] border border-ink/10 bg-white/85 p-5 shadow-bloom';
const confettiPalette = ['#0da7a2', '#ef6a4a', '#2f4f7f', '#f3c969'];

const useAnimatedNumber = (targetValue, duration = 1100) => {
  const [animatedValue, setAnimatedValue] = useState(0);
  const previousTargetRef = useRef(0);

  useEffect(() => {
    const nextTarget = Number(targetValue || 0);
    const startValue = previousTargetRef.current;
    const delta = nextTarget - startValue;

    if (!delta) {
      setAnimatedValue(nextTarget);
      return undefined;
    }

    let frameId = 0;
    const startedAt = performance.now();

    const tick = (timestamp) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setAnimatedValue(startValue + delta * eased);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    previousTargetRef.current = nextTarget;

    return () => window.cancelAnimationFrame(frameId);
  }, [duration, targetValue]);

  return animatedValue;
};

const MetricChip = ({ label, value, accent = 'text-ink' }) => (
  <div className="rounded-[22px] border border-ink/8 bg-white px-4 py-4">
    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{label}</p>
    <p className={`mt-2 font-display text-3xl ${accent}`}>{value}</p>
  </div>
);

const FunnelTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0]?.payload;
  if (!item) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3 shadow-lg">
      <p className="text-xs uppercase tracking-[0.18em] text-ink/40">{item.name}</p>
      <p className="mt-2 text-lg font-semibold text-ink">{item.value.toLocaleString()}</p>
    </div>
  );
};

const LocationHeatCard = ({ item }) => {
  const intensity = Number(item.intensity || 0);
  const background = `linear-gradient(135deg, rgba(13, 167, 162, ${0.12 + intensity * 0.35}), rgba(47, 79, 127, ${0.08 + intensity * 0.22}))`;

  return (
    <div className="rounded-[22px] border border-ink/10 p-4" style={{ background }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{item.location}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">{item.region}</p>
        </div>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-ink">
          {item.share}%
        </span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Attendees</p>
          <p className="mt-1 font-display text-3xl text-ink">{item.attendees}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Bookings</p>
          <p className="mt-1 text-sm font-semibold text-ink">{item.bookings}</p>
        </div>
      </div>
    </div>
  );
};

const OrganizerGrowthDashboard = ({
  data,
  loading,
  error,
  socketConnected,
  lastRealtimeBooking,
  spikeAlert
}) => {
  const revenue = Number(data?.summary?.revenue || 0);
  const animatedRevenue = useAnimatedNumber(revenue);
  const previousRevenueRef = useRef(null);
  const [celebratedMilestone, setCelebratedMilestone] = useState(null);
  const [confettiPieces, setConfettiPieces] = useState([]);

  useEffect(() => {
    const reachedMilestones = data?.milestones?.reached || [];
    const currentRevenue = Number(data?.summary?.revenue || 0);
    const previousRevenue = previousRevenueRef.current;

    if (previousRevenue === null) {
      previousRevenueRef.current = currentRevenue;
      return undefined;
    }

    const newlyReached = reachedMilestones.filter(
      (milestone) => previousRevenue < milestone && currentRevenue >= milestone
    );

    previousRevenueRef.current = currentRevenue;
    if (!newlyReached.length) {
      return undefined;
    }

    const latestMilestone = newlyReached[newlyReached.length - 1];
    setCelebratedMilestone(latestMilestone);
    setConfettiPieces(
      Array.from({ length: 18 }, (_, index) => ({
        id: `${latestMilestone}-${index}`,
        color: confettiPalette[index % confettiPalette.length],
        x: `${Math.round(Math.random() * 220 - 110)}px`,
        y: `${120 + Math.round(Math.random() * 120)}px`,
        rotate: `${Math.round(Math.random() * 480 - 240)}deg`,
        delay: `${(index % 6) * 45}ms`
      }))
    );

    const timeoutId = window.setTimeout(() => {
      setConfettiPieces([]);
      setCelebratedMilestone(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [data?.milestones?.reached, data?.summary?.revenue]);

  const funnelData = useMemo(
    () => [
      { name: 'Page Views', value: Number(data?.funnel?.pageViews || 0), fill: '#2f4f7f' },
      { name: 'Booking Started', value: Number(data?.funnel?.bookingStarted || 0), fill: '#0da7a2' },
      { name: 'Confirmed', value: Number(data?.funnel?.confirmedBookings || 0), fill: '#ef6a4a' }
    ],
    [data]
  );

  const topEvents = (data?.eventBreakdown || []).slice(0, 5);

  return (
    <section className="space-y-6">
      <SectionHeader
        eyebrow="Growth"
        title="Realtime revenue radar"
        description="Live booking momentum, milestone revenue tracking, funnel conversion, and attendee geography across your organizer slate."
      />

      {error && (
        <p className="rounded-[22px] border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
          {error}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className={`${panelClass} relative overflow-hidden`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(13,167,162,0.16),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(239,106,74,0.18),transparent_35%)]" />
          {confettiPieces.map((piece) => (
            <span
              key={piece.id}
              className="milestone-confetti"
              style={{
                backgroundColor: piece.color,
                '--confetti-x': piece.x,
                '--confetti-y': piece.y,
                '--confetti-rotate': piece.rotate,
                animationDelay: piece.delay
              }}
            />
          ))}

          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-reef">Net ticket revenue</p>
                <p className="mt-3 font-display text-5xl text-ink">
                  {formatCurrency(animatedRevenue, data?.currency || 'USD')}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                socketConnected ? 'bg-reef/10 text-reef' : 'bg-amber-100 text-amber-700'
              }`}>
                {socketConnected ? 'Live sync on' : 'Reconnecting'}
              </span>
            </div>

            <p className="mt-4 max-w-xl text-sm text-ink/65">
              {data?.milestones?.next
                ? `${formatCurrency(data.milestones.next - revenue, data?.currency || 'USD')} left until your next revenue milestone.`
                : 'Every listed revenue milestone has been cleared.'}
            </p>

            {celebratedMilestone && (
              <div className="mt-4 inline-flex rounded-full border border-reef/20 bg-reef/10 px-4 py-2 text-sm font-semibold text-reef">
                Milestone cleared: {formatCurrency(celebratedMilestone, data?.currency || 'USD')}
              </div>
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricChip label="Page Views" value={(data?.summary?.pageViews || 0).toLocaleString()} />
              <MetricChip label="Started" value={(data?.summary?.bookingStarted || 0).toLocaleString()} accent="text-dusk" />
              <MetricChip label="Confirmed" value={(data?.summary?.confirmedBookings || 0).toLocaleString()} accent="text-reef" />
              <MetricChip label="Attendees" value={(data?.summary?.attendees || 0).toLocaleString()} accent="text-ember" />
            </div>
          </div>
        </div>

        <div className={`${panelClass} flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Booking velocity</p>
              <span className="rounded-full bg-dusk/10 px-3 py-1 text-xs font-semibold text-dusk">
                {data?.bookingRate?.windowMinutes || 60}m window
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <MetricChip label="Current Hour" value={data?.bookingRate?.currentWindowCount || 0} />
              <MetricChip label="Previous Hour" value={data?.bookingRate?.previousWindowCount || 0} accent="text-dusk" />
            </div>

            <div className="mt-5 rounded-[24px] border border-ink/10 bg-sand/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Spike detection</p>
              <p className="mt-2 text-lg font-semibold text-ink">
                {spikeAlert
                  ? `${spikeAlert.eventTitle} just doubled its booking pace.`
                  : data?.bookingRate?.doubled
                    ? 'Booking pace is currently at least 2x the previous hour.'
                    : 'No booking spikes right now.'}
              </p>
              <p className="mt-2 text-sm text-ink/60">
                {spikeAlert
                  ? `${spikeAlert.currentWindowCount} confirmations vs ${spikeAlert.previousWindowCount} in the prior hour.`
                  : data?.bookingRate?.growthFactor
                    ? `Current growth factor: ${data.bookingRate.growthFactor}x.`
                    : 'We will alert you as soon as a live conversion surge is detected.'}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-ink/10 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Live pulse</p>
            {lastRealtimeBooking ? (
              <>
                <p className="mt-2 text-lg font-semibold text-ink">
                  {lastRealtimeBooking.attendeeName} booked {lastRealtimeBooking.eventTitle}
                </p>
                <p className="mt-1 text-sm text-ink/60">
                  {formatCurrency(lastRealtimeBooking.reportingAmount || 0, data?.currency || 'USD')} • {lastRealtimeBooking.quantity || 0} attendee slot{Number(lastRealtimeBooking.quantity || 0) === 1 ? '' : 's'}
                </p>
                <p className="mt-2 text-xs text-ink/45">{formatDate(lastRealtimeBooking.confirmedAt)}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink/55">
                The newest confirmed booking will appear here the moment it lands.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <div className={panelClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Conversion funnel</p>
              <p className="mt-1 text-sm text-ink/60">Page views to started bookings to confirmed ticket sales.</p>
            </div>
            <span className="rounded-full bg-reef/10 px-3 py-1 text-xs font-semibold text-reef">
              {data?.funnel?.viewToConfirmRate || 0}% overall
            </span>
          </div>

          {loading ? (
            <div className="flex h-72 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-reef border-t-transparent" />
            </div>
          ) : (
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip content={<FunnelTooltip />} />
                  <Funnel dataKey="value" data={funnelData} isAnimationActive>
                    {funnelData.map((item) => (
                      <Cell key={item.name} fill={item.fill} />
                    ))}
                    <LabelList position="right" dataKey="name" fill="#121212" stroke="none" />
                    <LabelList position="center" dataKey="value" fill="#ffffff" stroke="none" />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-ink/8 bg-sand/60 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">View → Start</p>
              <p className="mt-2 font-display text-2xl text-ink">{data?.funnel?.viewToStartRate || 0}%</p>
            </div>
            <div className="rounded-[20px] border border-ink/8 bg-sand/60 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Start → Confirm</p>
              <p className="mt-2 font-display text-2xl text-dusk">{data?.funnel?.startToConfirmRate || 0}%</p>
            </div>
            <div className="rounded-[20px] border border-ink/8 bg-sand/60 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Checked In</p>
              <p className="mt-2 font-display text-2xl text-reef">{data?.summary?.checkedIns || 0}</p>
            </div>
          </div>
        </div>

        <div className={panelClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Attendee geography heat map</p>
              <p className="mt-1 text-sm text-ink/60">Top attendee origin points based on the profile locations shared by confirmed ticket holders.</p>
            </div>
            {data?.topLocation && (
              <span className="rounded-full bg-dusk/10 px-3 py-1 text-xs font-semibold text-dusk">
                Top source: {data.topLocation.location}
              </span>
            )}
          </div>

          {!data?.geography?.length ? (
            <p className="mt-6 rounded-[22px] bg-sand/70 px-4 py-6 text-sm text-ink/55">
              Geography signals will appear once attendees with saved profile locations start confirming bookings.
            </p>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.geography.map((item) => (
                <LocationHeatCard key={item.location} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
        <div className={panelClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Recent confirmations</p>
              <p className="mt-1 text-sm text-ink/60">Most recent confirmed bookings across your events.</p>
            </div>
            <span className="rounded-full bg-reef/10 px-3 py-1 text-xs font-semibold text-reef">
              {data?.recentBookings?.length || 0} live rows
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {(data?.recentBookings || []).map((booking) => (
              <div key={booking.bookingId} className="rounded-[22px] border border-ink/8 bg-sand/60 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{booking.attendeeName}</p>
                    <p className="mt-1 truncate text-sm text-ink/55">{booking.eventTitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-ink">
                      {formatCurrency(booking.reportingAmount || 0, data?.currency || 'USD')}
                    </p>
                    <p className="mt-1 text-xs text-ink/45">{booking.attendeeLocation}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink/45">
                  <span>{booking.bookingNumber}</span>
                  <span>{booking.quantity} attendee slot{Number(booking.quantity || 0) === 1 ? '' : 's'}</span>
                  <span>{formatDate(booking.confirmedAt)}</span>
                </div>
              </div>
            ))}

            {!data?.recentBookings?.length && (
              <p className="rounded-[22px] bg-sand/70 px-4 py-6 text-sm text-ink/55">
                Confirmed bookings will start streaming here as soon as they land.
              </p>
            )}
          </div>
        </div>

        <div className={panelClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Event growth leaderboard</p>
              <p className="mt-1 text-sm text-ink/60">Views, started bookings, confirmations, and revenue by event.</p>
            </div>
            <span className="rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
              {data?.summary?.activeEvents || 0} active rows
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {topEvents.map((event) => (
              <div key={event.eventId} className="rounded-[22px] border border-ink/8 bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{event.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">
                      {event.views} views • {event.bookingStarted} started • {event.confirmedBookings} confirmed
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-ink">
                    {formatCurrency(event.revenue || 0, data?.currency || 'USD')}
                  </p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] bg-sand/70 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-ink/45">View → Start</p>
                    <p className="mt-1 font-display text-2xl text-dusk">{event.viewToStartRate}%</p>
                  </div>
                  <div className="rounded-[18px] bg-sand/70 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-ink/45">Start → Confirm</p>
                    <p className="mt-1 font-display text-2xl text-reef">{event.startToConfirmRate}%</p>
                  </div>
                </div>
              </div>
            ))}

            {!topEvents.length && (
              <p className="rounded-[22px] bg-sand/70 px-4 py-6 text-sm text-ink/55">
                Event-level growth rows will populate once your first bookings start moving.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default OrganizerGrowthDashboard;
