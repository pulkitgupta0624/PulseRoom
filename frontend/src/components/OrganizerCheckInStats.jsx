import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { flattenBookingTickets, getBookingTickets } from '../lib/tickets';

const OrganizerCheckInStats = ({ eventId, interval = 15_000 }) => {
  const [stats, setStats] = useState(null);
  const intervalRef = useRef(null);

  const load = async () => {
    try {
      const res = await api.get(`/api/bookings/event/${eventId}`);
      const bookings = res.data.data;
      const roster = flattenBookingTickets(bookings);
      const confirmedSeats = bookings
        .filter((booking) => booking.status === 'confirmed')
        .reduce((sum, booking) => sum + getBookingTickets(booking).length, 0);
      const checkedIn = roster.filter(({ ticket }) => ticket.checkedIn).length;
      const waiting = Math.max(0, confirmedSeats - checkedIn);
      setStats({ totalBookings: bookings.length, confirmedSeats, checkedIn, waiting });
    } catch {
      // Ignore transient polling errors and retry on the next interval.
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
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-[24px] bg-white/50" />
        ))}
      </div>
    );
  }

  const percent = stats.confirmedSeats > 0
    ? Math.round((stats.checkedIn / stats.confirmedSeats) * 100)
    : 0;

  const tiles = [
    { label: 'Total Bookings', value: stats.totalBookings, accent: 'text-ink' },
    { label: 'Confirmed Seats', value: stats.confirmedSeats, accent: 'text-dusk' },
    { label: 'Checked In', value: stats.checkedIn, accent: 'text-reef' },
    { label: 'Still Waiting', value: stats.waiting, accent: 'text-ember' }
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-[24px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
            <p className="text-xs uppercase tracking-[0.22em] text-ink/45">{tile.label}</p>
            <p className={`mt-2 font-display text-4xl ${tile.accent}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[24px] border border-ink/10 bg-white/80 px-5 py-4 shadow-bloom">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Check-in progress</p>
          <p className="font-display text-xl text-reef">{percent}%</p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-reef transition-all duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-ink/40">
          {stats.checkedIn} of {stats.confirmedSeats} confirmed attendees have been admitted
          {stats.waiting > 0 && ` · ${stats.waiting} still to arrive`}
        </p>
      </div>
    </div>
  );
};

export default OrganizerCheckInStats;
