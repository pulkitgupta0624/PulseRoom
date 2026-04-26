import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SectionHeader from '../components/SectionHeader';
import CameraQrScanner from '../components/CameraQrScanner';
import OrganizerCheckInStats from '../components/OrganizerCheckInStats';   // ← NEW
import { api } from '../lib/api';
import { formatDate } from '../lib/formatters';

const parseTicketPayload = (value) => {
  try {
    const parsed = JSON.parse(value);
    if (parsed?.type !== 'pulseroom-ticket') return null;
    return parsed;
  } catch {
    return null;
  }
};

const CheckInPage = () => {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [manualPayload, setManualPayload] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [eventRes, bookingsRes] = await Promise.all([
        api.get(`/api/events/${eventId}`),
        api.get(`/api/bookings/event/${eventId}`)
      ]);
      setEvent(eventRes.data.data);
      setBookings(bookingsRes.data.data);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error.response?.data?.message || 'Unable to load the event check-in desk.'
      });
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const processPayload = useCallback(async (rawValue) => {
    const parsed = parseTicketPayload(rawValue);
    if (!parsed) {
      setFeedback({ tone: 'error', message: 'That QR code is not a PulseRoom ticket.' });
      return;
    }
    if (parsed.eventId !== eventId) {
      setFeedback({ tone: 'error', message: 'This ticket belongs to a different event.' });
      return;
    }

    setCheckingIn(true);
    try {
      const response = await api.post(`/api/bookings/${parsed.bookingId}/check-in`, {
        token: parsed.token
      });
      const { booking, alreadyCheckedIn } = response.data.data;
      setFeedback({
        tone: alreadyCheckedIn ? 'info' : 'success',
        message: alreadyCheckedIn
          ? `${booking.attendee?.name || 'Attendee'} was already checked in.`
          : `${booking.attendee?.name || 'Attendee'} checked in successfully.`,
        booking
      });
      await loadData();
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error.response?.data?.message || 'Check-in failed.'
      });
    } finally {
      setCheckingIn(false);
    }
  }, [eventId, loadData]);

  const recentCheckIns = useMemo(
    () => bookings
      .filter((booking) => booking.ticket?.checkedInAt)
      .sort((left, right) => new Date(right.ticket.checkedInAt) - new Date(left.ticket.checkedInAt))
      .slice(0, 8),
    [bookings]
  );

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Venue Desk"
        title={event ? `${event.title} check-in` : 'Check-in desk'}
        description="Scan attendee QR codes and mark tickets as checked in in real time."
      />

      {/*
        OrganizerCheckInStats replaces the three hand-rolled stat tiles that were
        here before. It polls /api/bookings/event/:id every 15 s and shows a
        progress bar — no prop drilling needed.
      */}
      <OrganizerCheckInStats eventId={eventId} />   {/* ← NEW */}

      <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-4">
          <CameraQrScanner onScanSuccess={processPayload} />

          <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
            <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Manual fallback</p>
            <p className="mt-2 text-sm text-ink/60">
              If the camera is blocked, paste the QR payload and process it manually.
            </p>
            <textarea
              value={manualPayload}
              onChange={(eventInput) => setManualPayload(eventInput.target.value)}
              rows={4}
              placeholder='{"type":"pulseroom-ticket",...}'
              className="mt-4 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-reef"
            />
            <button
              type="button"
              onClick={() => processPayload(manualPayload)}
              disabled={!manualPayload.trim() || checkingIn}
              className="mt-4 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-sand disabled:opacity-60"
            >
              {checkingIn ? 'Checking in...' : 'Process ticket'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {feedback && (
            <div
              className={`rounded-[28px] border px-5 py-5 shadow-bloom ${
                feedback.tone === 'error'
                  ? 'border-ember/20 bg-ember/5'
                  : feedback.tone === 'info'
                    ? 'border-dusk/20 bg-dusk/5'
                    : 'border-reef/20 bg-reef/5'
              }`}
            >
              <p
                className={`font-display text-2xl ${
                  feedback.tone === 'error' ? 'text-ember' : feedback.tone === 'info' ? 'text-dusk' : 'text-reef'
                }`}
              >
                {feedback.tone === 'error' ? 'Scan issue' : feedback.tone === 'info' ? 'Already checked in' : 'Check-in complete'}
              </p>
              <p className="mt-2 text-sm text-ink/70">{feedback.message}</p>
              {feedback.booking && (
                <div className="mt-4 rounded-2xl bg-white/80 p-4">
                  <p className="font-semibold text-ink">{feedback.booking.attendee?.name}</p>
                  <p className="mt-1 text-sm text-ink/55">{feedback.booking.attendee?.email}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink/40">
                    {feedback.booking.bookingNumber} · {feedback.booking.tierName}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Recent check-ins</p>
                <p className="mt-1 text-sm text-ink/60">Latest attendees admitted to the venue.</p>
              </div>
              <Link
                to={`/events/${eventId}`}
                className="rounded-full border border-ink/10 bg-sand px-4 py-2 text-xs font-semibold text-ink"
              >
                Event page
              </Link>
            </div>

            {loading ? (
              <div className="mt-6 flex items-center justify-center py-10">
                <div className="h-8 w-8 rounded-full border-2 border-reef border-t-transparent animate-spin" />
              </div>
            ) : recentCheckIns.length ? (
              <div className="mt-5 space-y-3">
                {recentCheckIns.map((booking) => (
                  <div key={booking._id} className="rounded-2xl bg-sand/65 px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-ink">{booking.attendee?.name}</p>
                        <p className="mt-1 text-sm text-ink/55">{booking.attendee?.email}</p>
                        <p className="mt-2 text-xs text-ink/40">{booking.bookingNumber} · {booking.tierName}</p>
                      </div>
                      <span className="rounded-full bg-reef/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-reef">
                        {formatDate(booking.ticket.checkedInAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 rounded-2xl bg-sand/65 px-4 py-8 text-center text-sm text-ink/55">
                No one has been checked in yet.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default CheckInPage;