import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/formatters';

const STATUS_STYLES = {
  confirmed: 'bg-reef/10 text-reef',
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-ink/8 text-ink/45',
  refunded: 'bg-ember/10 text-ember'
};

const EventBookingsModal = ({ event, onClose }) => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get(`/api/bookings/event/${event._id}`);
        setBookings(response.data.data);
      } catch (loadError) {
        setError(loadError.response?.data?.message || 'Failed to load bookings');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [event._id]);

  useEffect(() => {
    const handler = (keyboardEvent) => keyboardEvent.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = bookings.filter((booking) => {
    const query = search.toLowerCase();
    return (
      !query ||
      booking.attendee?.name?.toLowerCase().includes(query) ||
      booking.attendee?.email?.toLowerCase().includes(query) ||
      booking.tierName?.toLowerCase().includes(query) ||
      booking.bookingNumber?.toLowerCase().includes(query)
    );
  });

  const totalRevenue = bookings
    .filter((booking) => booking.status === 'confirmed')
    .reduce((sum, booking) => sum + booking.amount, 0);
  const confirmedCount = bookings.filter((booking) => booking.status === 'confirmed').length;
  const checkedInCount = bookings.filter((booking) => booking.ticket?.checkedIn).length;
  const currency = bookings[0]?.currency || 'INR';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(18,18,18,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-[32px] border border-ink/10 bg-white shadow-bloom"
        onClick={(eventInput) => eventInput.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-6 py-4 rounded-t-[32px]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-reef">Attendee Roster</p>
            <h2 className="mt-1 font-display text-2xl text-ink">{event.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/events/${event._id}/check-in`}
              className="rounded-full border border-dusk/20 bg-dusk/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-dusk"
            >
              Open scanner
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-ink/50 hover:bg-sand/80 hover:text-ink"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-ink/8 bg-sand/40 px-6 py-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Total Bookings</p>
            <p className="mt-1 font-display text-2xl text-ink">{bookings.length}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Confirmed</p>
            <p className="mt-1 font-display text-2xl text-reef">{confirmedCount}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Checked In</p>
            <p className="mt-1 font-display text-2xl text-dusk">{checkedInCount}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Revenue</p>
            <p className="mt-1 font-display text-2xl text-ink">{formatCurrency(totalRevenue, currency)}</p>
          </div>
        </div>

        <div className="border-b border-ink/8 px-6 py-3">
          <input
            value={search}
            onChange={(eventInput) => setSearch(eventInput.target.value)}
            placeholder="Search by name, email, tier or booking number..."
            className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-2.5 text-sm outline-none focus:border-reef"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="h-6 w-6 rounded-full border-2 border-reef border-t-transparent animate-spin" />
            </div>
          )}

          {!loading && error && (
            <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-ink/50">
                {search ? 'No bookings match your search.' : 'No bookings yet for this event.'}
              </p>
            </div>
          )}

          {filtered.map((booking) => (
            <div key={booking._id} className="rounded-[20px] border border-ink/10 bg-sand/60 p-4">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-ink">{booking.attendee?.name || 'Guest'}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] ${
                      STATUS_STYLES[booking.status] || 'bg-ink/8 text-ink/50'
                    }`}
                  >
                    {booking.status}
                  </span>
                  {booking.ticket?.checkedIn && (
                    <span className="rounded-full bg-dusk/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] text-dusk">
                      checked in
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink/60">{booking.attendee?.email || 'No attendee email'}</p>
                <div className="flex flex-wrap gap-3 text-xs text-ink/45">
                  <span className="font-mono">#{booking.bookingNumber}</span>
                  <span>{booking.tierName} x {booking.quantity}</span>
                  <span className="font-semibold text-ink">{formatCurrency(booking.amount, booking.currency)}</span>
                  <span>{formatDate(booking.createdAt)}</span>
                </div>
                {booking.invoice?.invoiceNumber && (
                  <p className="text-xs text-ink/40">
                    Invoice {booking.invoice.invoiceNumber} · issued {formatDate(booking.invoice.issuedAt)}
                  </p>
                )}
                {booking.ticket?.checkedInAt && (
                  <p className="text-xs text-dusk">Checked in {formatDate(booking.ticket.checkedInAt)}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-b-[32px] border-t border-ink/8 bg-white px-6 py-4">
          <p className="text-xs text-ink/40">
            Showing {filtered.length} of {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
};

export default EventBookingsModal;
