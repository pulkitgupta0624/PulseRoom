import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/formatters';
import { flattenBookingTickets, getBookingTickets } from '../lib/tickets';
import ModalShell from './ModalShell';

const STATUS_STYLES = {
  confirmed: 'bg-reef/10 text-reef',
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-ink/8 text-ink/45',
  refunded: 'bg-ember/10 text-ember'
};

const EventBookingsModal = ({ event, onClose, onExport, exportLoading = false }) => {
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

  const roster = flattenBookingTickets(bookings);
  const filtered = roster.filter(({ booking, ticket }) => {
    const query = search.toLowerCase().trim();
    if (!query) {
      return true;
    }

    return (
      ticket.attendee?.name?.toLowerCase().includes(query) ||
      ticket.attendee?.email?.toLowerCase().includes(query) ||
      booking.attendee?.name?.toLowerCase().includes(query) ||
      booking.attendee?.email?.toLowerCase().includes(query) ||
      booking.tierName?.toLowerCase().includes(query) ||
      booking.bookingNumber?.toLowerCase().includes(query) ||
      ticket.ticketNumber?.toLowerCase().includes(query)
    );
  });

  const totalRevenue = bookings
    .filter((booking) => booking.status === 'confirmed')
    .reduce((sum, booking) => sum + Number(booking.pricing?.reportingAmount ?? booking.amount ?? 0), 0);
  const confirmedTicketCount = bookings
    .filter((booking) => booking.status === 'confirmed')
    .reduce((sum, booking) => sum + getBookingTickets(booking).length, 0);
  const checkedInCount = roster.filter(({ ticket }) => ticket.checkedIn).length;
  const currency = bookings[0]?.pricing?.reportingCurrency || bookings[0]?.currency || 'USD';

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="event-bookings-title"
      panelClassName="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-[32px] border border-ink/10 bg-white shadow-bloom"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-[32px] border-b border-ink/10 bg-white px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-reef">Attendee Roster</p>
          <h2 id="event-bookings-title" className="mt-1 font-display text-2xl text-ink">
            {event.title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              disabled={exportLoading}
              className="rounded-full border border-ink/15 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink disabled:opacity-60"
            >
              {exportLoading ? 'Exporting...' : 'Export CSV'}
            </button>
          )}
          <Link
            to={`/events/${event._id}/check-in`}
            className="rounded-full border border-dusk/20 bg-dusk/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-dusk"
          >
            Open scanner
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close attendee roster"
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
          <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Confirmed Seats</p>
          <p className="mt-1 font-display text-2xl text-reef">{confirmedTicketCount}</p>
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
          placeholder="Search by attendee, email, tier, booking number, or ticket number..."
          className="w-full rounded-2xl border border-ink/10 bg-sand px-4 py-2.5 text-sm outline-none focus:border-reef"
        />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-reef border-t-transparent" />
          </div>
        )}

        {!loading && error && (
          <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm text-ink/50">
              {search ? 'No ticket holders match your search.' : 'No bookings yet for this event.'}
            </p>
          </div>
        )}

        {filtered.map(({ booking, ticket }) => (
          <div
            key={`${booking._id}-${ticket.ticketId || ticket.ticketNumber}`}
            className="rounded-[20px] border border-ink/10 bg-sand/60 p-4"
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink">{ticket.attendee?.name || 'Guest'}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] ${
                    STATUS_STYLES[booking.status] || 'bg-ink/8 text-ink/50'
                  }`}
                >
                  {booking.status}
                </span>
                {ticket.checkedIn && (
                  <span className="rounded-full bg-dusk/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] text-dusk">
                    checked in
                  </span>
                )}
                {booking.promoCode?.code && (
                  <span className="rounded-full bg-dusk/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] text-dusk">
                    promo {booking.promoCode.code}
                  </span>
                )}
                {booking.referral?.code && (
                  <span className="rounded-full bg-reef/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] text-reef">
                    referral {booking.referral.code}
                  </span>
                )}
              </div>
              <p className="text-sm text-ink/60">
                {ticket.attendee?.email || 'No attendee email'}
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-ink/45">
                <span className="font-mono">#{booking.bookingNumber}</span>
                <span className="font-mono">{ticket.ticketNumber}</span>
                <span>{booking.tierName}</span>
                <span className="font-semibold text-ink">{formatCurrency(booking.amount, booking.currency)}</span>
                <span>{formatDate(booking.createdAt)}</span>
              </div>
              {booking.attendee?.email && booking.attendee.email !== ticket.attendee?.email && (
                <p className="text-xs text-ink/45">
                  Booking contact: {booking.attendee.name || 'Guest'} · {booking.attendee.email}
                </p>
              )}
              {(booking.promoCode?.discountAmount || booking.referral?.discountAmount) && (
                <p className="text-xs text-ink/45">
                  Saved{' '}
                  {formatCurrency(
                    booking.promoCode?.discountAmount || booking.referral?.discountAmount || 0,
                    booking.currency
                  )}{' '}
                  via {booking.promoCode?.code ? `promo code ${booking.promoCode.code}` : `referral ${booking.referral.code}`}
                </p>
              )}
              {booking.invoice?.invoiceNumber && (
                <p className="text-xs text-ink/40">
                  Invoice {booking.invoice.invoiceNumber} · issued {formatDate(booking.invoice.issuedAt)}
                </p>
              )}
              {ticket.transferredAt && (
                <p className="text-xs text-ink/45">
                  Reassigned on {formatDate(ticket.transferredAt)}
                </p>
              )}
              {ticket.checkedInAt && (
                <p className="text-xs text-dusk">Checked in {formatDate(ticket.checkedInAt)}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-b-[32px] border-t border-ink/8 bg-white px-6 py-4">
        <p className="text-xs text-ink/40">
          Showing {filtered.length} of {roster.length} ticket holder{roster.length !== 1 ? 's' : ''}
        </p>
      </div>
    </ModalShell>
  );
};

export default EventBookingsModal;
