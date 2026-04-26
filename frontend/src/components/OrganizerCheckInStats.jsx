import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/**
 * OrganizerCheckInStats
 * A live-updating stats ring shown at the top of the check-in desk.
 * Polls every `interval` ms so the desk organiser always sees fresh numbers
 * without needing a full page refresh.
 *
 * Props:
 *   eventId   – string
 *   interval  – polling interval ms (default 15 000)
 */
const OrganizerCheckInStats = ({ eventId, interval = 15_000 }) => {
  const [stats, setStats] = useState(null);
  const intervalRef = useRef(null);

  const load = async () => {
    try {
      const res = await api.get(`/api/bookings/event/${eventId}`);
      const bookings = res.data.data;
      const confirmed = bookings.filter((b) => b.status === 'confirmed').length;
      const checkedIn = bookings.filter((b) => b.ticket?.checkedIn).length;
      const waiting = Math.max(0, confirmed - checkedIn);
      setStats({ total: bookings.length, confirmed, checkedIn, waiting });
    } catch {
      /* silently retry */
    }
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, interval);
    return () => clearInterval(intervalRef.current);
  }, [eventId, interval]);

  if (!stats) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[24px] bg-white/50" />
        ))}
      </div>
    );
  }

  const pct = stats.confirmed > 0
    ? Math.round((stats.checkedIn / stats.confirmed) * 100)
    : 0;

  const tiles = [
    { label: 'Total Bookings', value: stats.total, accent: 'text-ink' },
    { label: 'Confirmed', value: stats.confirmed, accent: 'text-dusk' },
    { label: 'Checked In', value: stats.checkedIn, accent: 'text-reef' },
    { label: 'Still Waiting', value: stats.waiting, accent: 'text-ember' }
  ];

  return (
    <div className="space-y-4">
      {/* metric tiles */}
      <div className="grid gap-4 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[24px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
            <p className="text-xs uppercase tracking-[0.22em] text-ink/45">{t.label}</p>
            <p className={`mt-2 font-display text-4xl ${t.accent}`}>{t.value}</p>
          </div>
        ))}
      </div>

      {/* progress bar */}
      <div className="rounded-[24px] border border-ink/10 bg-white/80 px-5 py-4 shadow-bloom">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Check-in progress</p>
          <p className="font-display text-xl text-reef">{pct}%</p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-reef transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-ink/40">
          {stats.checkedIn} of {stats.confirmed} confirmed attendees have been admitted
          {stats.waiting > 0 && ` · ${stats.waiting} still to arrive`}
        </p>
      </div>
    </div>
  );
};

export default OrganizerCheckInStats;