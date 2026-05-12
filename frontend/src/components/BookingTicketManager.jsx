import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateBookingTicket } from '../features/bookings/bookingsSlice';
import { formatDate } from '../lib/formatters';
import { getBookingCheckedInCount, getBookingTickets } from '../lib/tickets';
import QRCodeTicket from './QRCodeTicket';
import TicketDownloadButton from './TicketDownloadButton';

const buildDrafts = (booking) =>
  Object.fromEntries(
    getBookingTickets(booking).map((ticket) => [
      ticket.ticketId,
      {
        name: ticket.attendee?.name || '',
        email: ticket.attendee?.email || ''
      }
    ])
  );

const BookingTicketManager = ({ booking }) => {
  const dispatch = useDispatch();
  const { updatingTicketId } = useSelector((state) => state.bookings);
  const tickets = getBookingTickets(booking);
  const checkedInCount = getBookingCheckedInCount(booking);
  const eventStarted = booking.eventSnapshot?.startsAt
    ? new Date(booking.eventSnapshot.startsAt) <= new Date()
    : false;
  const canManageTickets =
    ['pending', 'confirmed'].includes(booking.status) && !eventStarted;
  const [drafts, setDrafts] = useState(() => buildDrafts(booking));
  const [editingTicketId, setEditingTicketId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setDrafts(buildDrafts(booking));
  }, [booking]);

  const handleChange = (ticketId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [ticketId]: {
        ...current[ticketId],
        [field]: value
      }
    }));
  };

  const handleSubmit = async (ticket) => {
    const draft = drafts[ticket.ticketId] || { name: '', email: '' };
    const attendee = {
      name: draft.name.trim(),
      email: draft.email.trim()
    };

    if (!attendee.name || !attendee.email) {
      setFeedback({
        tone: 'error',
        message: 'Every transferred ticket needs an attendee name and email.'
      });
      return;
    }

    const unchanged =
      attendee.name === (ticket.attendee?.name || '').trim() &&
      attendee.email.toLowerCase() === (ticket.attendee?.email || '').trim().toLowerCase();
    if (unchanged) {
      setEditingTicketId(null);
      setFeedback(null);
      return;
    }

    try {
      await dispatch(
        updateBookingTicket({
          bookingId: booking._id,
          ticketId: ticket.ticketId,
          attendee
        })
      ).unwrap();
      setEditingTicketId(null);
      setFeedback({
        tone: 'success',
        message: `${ticket.ticketNumber || `Ticket ${ticket.position}`} reassigned successfully.`
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error || 'Unable to reassign this ticket right now.'
      });
    }
  };

  if (!tickets.length) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-[24px] border border-ink/10 bg-sand/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Ticket holders</p>
          <p className="mt-1 text-sm text-ink/60">
            {checkedInCount} of {tickets.length} ticket{tickets.length !== 1 ? 's' : ''} checked in
          </p>
        </div>
        {tickets.length > 1 && canManageTickets && (
          <p className="text-xs text-ink/45">
            Assign each seat before event start so every guest has their own QR.
          </p>
        )}
      </div>

      {feedback && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${
            feedback.tone === 'error'
              ? 'bg-ember/10 text-ember'
              : 'bg-reef/10 text-reef'
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div className="space-y-4">
        {tickets.map((ticket) => {
          const isEditing = editingTicketId === ticket.ticketId;
          const isSaving = updatingTicketId === ticket.ticketId;
          const draft = drafts[ticket.ticketId] || { name: '', email: '' };
          const canEditThisTicket = canManageTickets && !ticket.checkedIn;

          return (
            <article
              key={ticket.ticketId || ticket.ticketNumber}
              className="rounded-[22px] border border-ink/10 bg-white/85 p-4"
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">
                      {ticket.ticketNumber || `Ticket ${ticket.position}`}
                    </p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                        ticket.checkedIn
                          ? 'bg-reef/10 text-reef'
                          : 'bg-dusk/10 text-dusk'
                      }`}
                    >
                      {ticket.checkedIn ? 'Checked in' : 'Ready'}
                    </span>
                    {ticket.transferredAt && (
                      <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink/55">
                        transferred
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-sm text-ink/65">
                    <p className="font-medium text-ink">
                      {ticket.attendee?.name || 'Unassigned ticket'}
                    </p>
                    <p>{ticket.attendee?.email || 'Add an attendee to finish the transfer.'}</p>
                    {ticket.transferredAt && (
                      <p className="text-xs text-ink/45">
                        Last reassigned on {formatDate(ticket.transferredAt)}
                      </p>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="grid gap-3 rounded-[20px] border border-ink/10 bg-sand/55 p-4 md:grid-cols-2">
                      <label className="space-y-2 text-sm text-ink/65">
                        <span className="block text-xs uppercase tracking-[0.18em] text-ink/45">
                          Attendee name
                        </span>
                        <input
                          value={draft.name}
                          onChange={(event) =>
                            handleChange(ticket.ticketId, 'name', event.target.value)
                          }
                          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-reef"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-ink/65">
                        <span className="block text-xs uppercase tracking-[0.18em] text-ink/45">
                          Attendee email
                        </span>
                        <input
                          type="email"
                          value={draft.email}
                          onChange={(event) =>
                            handleChange(ticket.ticketId, 'email', event.target.value)
                          }
                          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-reef"
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                        <button
                          type="button"
                          onClick={() => handleSubmit(ticket)}
                          disabled={isSaving}
                          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand disabled:opacity-60"
                        >
                          {isSaving ? 'Saving...' : 'Save ticket holder'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTicketId(null);
                            setDrafts(buildDrafts(booking));
                            setFeedback(null);
                          }}
                          className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {canEditThisTicket && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTicketId(ticket.ticketId);
                            setFeedback(null);
                          }}
                          className="rounded-full border border-dusk/20 bg-dusk/5 px-4 py-2 text-sm font-medium text-dusk hover:bg-dusk/10"
                        >
                          {ticket.attendee?.email ? 'Transfer ticket' : 'Assign attendee'}
                        </button>
                      )}
                      <TicketDownloadButton booking={booking} ticket={ticket} />
                    </div>
                  )}
                </div>

                {booking.status === 'confirmed' && ticket.qrCodeValue ? (
                  <QRCodeTicket
                    title={ticket.ticketNumber || `Ticket ${ticket.position}`}
                    value={ticket.qrCodeValue}
                    checkedIn={ticket.checkedIn}
                    checkedInAt={ticket.checkedInAt}
                  />
                ) : (
                  <div className="rounded-[24px] border border-ink/10 bg-white/70 p-4 text-sm text-ink/55">
                    <p className="text-xs uppercase tracking-[0.22em] text-ink/45">QR access</p>
                    <p className="mt-2">
                      {booking.status === 'pending'
                        ? 'Ticket QR codes will appear once payment clears.'
                        : 'This ticket no longer has an active entry QR.'}
                    </p>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default BookingTicketManager;
