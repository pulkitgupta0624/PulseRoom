import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import SectionHeader from '../components/SectionHeader';
import QRCodeTicket from '../components/QRCodeTicket';
import TicketDownloadButton from '../components/TicketDownloadButton';   // ← NEW
import { fetchMyBookings, requestRefund } from '../features/bookings/bookingsSlice';
import { formatCurrency, formatDate } from '../lib/formatters';

const STATUS_STYLES = {
  confirmed: 'bg-reef/10 text-reef',
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-ink/8 text-ink/45',
  refunded: 'bg-ember/10 text-ember'
};

const BookingsPage = () => {
  const dispatch = useDispatch();
  const { list, loading, error, refundingId } = useSelector((state) => state.bookings);

  useEffect(() => {
    dispatch(fetchMyBookings());
  }, [dispatch]);

  const handleRefund = (bookingId) => {
    if (window.confirm('Are you sure you want to refund this booking? This action cannot be undone.')) {
      dispatch(requestRefund(bookingId));
    }
  };

  const upcoming = list.filter(
    (booking) =>
      booking.status === 'confirmed' && new Date(booking.eventSnapshot?.startsAt) > new Date()
  );
  const past = list.filter(
    (booking) =>
      booking.status !== 'confirmed' || new Date(booking.eventSnapshot?.startsAt) <= new Date()
  );

  return (
    <div className="space-y-10">
      <SectionHeader
        eyebrow="Attendee"
        title="My tickets"
        description="Your booking history, QR entry passes, invoices, and refund controls in one place."
      />

      {loading && <p className="text-sm text-ink/50">Loading your bookings...</p>}

      {error && (
        <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
      )}

      {!loading && list.length === 0 && (
        <div className="rounded-[32px] border border-ink/10 bg-white/80 p-10 text-center shadow-bloom">
          <p className="font-display text-2xl text-ink">No tickets yet</p>
          <p className="mt-3 text-sm text-ink/60">Browse events and grab your first ticket.</p>
          <Link to="/" className="mt-6 inline-flex rounded-full bg-ink px-5 py-3 font-semibold text-sand">
            Browse events
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-2xl text-ink">Upcoming events</h2>
          <div className="space-y-4">
            {upcoming.map((booking) => (
              <BookingCard
                key={booking._id}
                booking={booking}
                onRefund={handleRefund}
                refundingId={refundingId}
              />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-2xl text-ink">Past and cancelled</h2>
          <div className="space-y-4">
            {past.map((booking) => (
              <BookingCard
                key={booking._id}
                booking={booking}
                onRefund={handleRefund}
                refundingId={refundingId}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const BookingCard = ({ booking, onRefund, refundingId }) => {
  const canRefund = booking.status === 'confirmed';
  const isRefunding = refundingId === booking._id;

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
      <div className="grid gap-5 lg:grid-cols-[1fr,280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl text-ink">{booking.eventSnapshot?.title || 'Event'}</h3>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                STATUS_STYLES[booking.status] || 'bg-ink/8 text-ink/60'
              }`}
            >
              {booking.status}
            </span>
            {booking.ticket?.checkedIn && (
              <span className="rounded-full bg-dusk/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-dusk">
                checked in
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-ink/60">
            <span>{formatDate(booking.eventSnapshot?.startsAt)}</span>
            <span>{booking.tierName} x {booking.quantity}</span>
            <span className="font-semibold text-ink">{formatCurrency(booking.amount, booking.currency)}</span>
          </div>

          {booking.invoice?.invoiceNumber && (
            <p className="text-xs uppercase tracking-[0.2em] text-ink/40">
              Invoice: {booking.invoice.invoiceNumber} · Issued {formatDate(booking.invoice.issuedAt)}
            </p>
          )}

          {booking.attendee?.name && (
            <p className="text-xs text-ink/45">
              Attendee: {booking.attendee.name} · {booking.attendee.email}
            </p>
          )}

          {booking.ticket?.checkedInAt && (
            <p className="text-xs text-dusk">Checked in on {formatDate(booking.ticket.checkedInAt)}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Link
              to={`/events/${booking.eventId}`}
              className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-sm font-medium text-ink hover:bg-white"
            >
              View event
            </Link>
            {booking.status === 'confirmed' && (
              <Link
                to={`/events/${booking.eventId}/live`}
                className="rounded-full bg-reef px-4 py-2 text-sm font-semibold text-white"
              >
                Enter room
              </Link>
            )}
            {/* ── Download PNG ticket ── */}
            <TicketDownloadButton booking={booking} />   {/* ← NEW */}

            {canRefund && (
              <button
                type="button"
                onClick={() => onRefund(booking._id)}
                disabled={isRefunding}
                className="rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-medium text-ember hover:bg-ember/10 disabled:opacity-50"
              >
                {isRefunding ? 'Processing...' : 'Refund'}
              </button>
            )}
          </div>
        </div>

        <QRCodeTicket
          value={booking.ticket?.qrCodeValue}
          checkedIn={booking.ticket?.checkedIn}
          checkedInAt={booking.ticket?.checkedInAt}
        />
      </div>
    </div>
  );
};

export default BookingsPage;