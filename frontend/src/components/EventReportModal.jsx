import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { api } from '../lib/api';
import { showToast } from '../features/ui/uiSlice';

const REASONS = [
  'Misleading event description',
  'Suspected scam or fraud',
  'Inappropriate or offensive content',
  'Duplicate or spam listing',
  'Copyright / IP infringement',
  'Other'
];

/**
 * EventReportModal
 * A lightweight overlay that submits a POST /api/admin/reports entry.
 * Import and render in EventDetailPage behind a "Report event" link.
 *
 * Props:
 *   eventId  – string
 *   onClose  – () => void
 */
const EventReportModal = ({ eventId, onClose }) => {
  const dispatch = useDispatch();
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/admin/reports', {
        reportType: 'event',
        targetId: eventId,
        reason: details.trim() ? `${reason}: ${details.trim()}` : reason
      });
      dispatch(showToast({ message: 'Report submitted. Our team will review it shortly.', tone: 'success' }));
      onClose();
    } catch (err) {
      dispatch(showToast({
        message: err.response?.data?.message || 'Failed to submit report.',
        tone: 'error'
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(18,18,18,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[32px] border border-ink/10 bg-white p-6 shadow-bloom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-ember">Moderation</p>
            <h2 className="mt-1 font-display text-2xl text-ink">Report this event</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-ink/40 hover:bg-sand hover:text-ink transition"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-ink/45">Reason</label>
            <div className="mt-2 grid gap-2">
              {REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                    reason === r
                      ? 'border-ember/30 bg-ember/5 text-ink'
                      : 'border-ink/10 bg-sand/50 text-ink/65 hover:border-ink/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-ember"
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-ink/45">
              Additional details <span className="normal-case text-ink/30">(optional)</span>
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Any extra context that might help our review team…"
              className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-ember"
            />
            <p className="mt-1 text-right text-xs text-ink/30">{details.length}/500</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-ink/10 bg-sand px-5 py-3 text-sm font-semibold text-ink hover:bg-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-2xl bg-ember px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 transition"
            >
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventReportModal;