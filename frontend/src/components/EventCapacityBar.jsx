import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';

/**
 * EventCapacityBar
 * Fetches remaining seats for a single ticket tier and renders a visual
 * progress bar.  Mount it under each tier option in EventDetailPage.
 *
 * Props:
 *   eventId      – MongoDB event _id string
 *   tierId       – tier identifier string
 *   totalQty     – tier.quantity number
 *   currency     – e.g. 'INR'
 *   pollInterval – ms between background refreshes (default 30 000)
 */
const EventCapacityBar = ({ eventId, tierId, totalQty, pollInterval = 30_000 }) => {
  const [data, setData] = useState(null); // { reserved, remaining }
  const [loading, setLoading] = useState(true);

  const fetchCapacity = useCallback(async () => {
    try {
      const res = await api.get(`/api/bookings/capacity/${eventId}`);
      const tier = res.data.data.find((t) => t.tierId === tierId);
      if (tier) {
        setData({ reserved: tier.reserved, remaining: tier.remaining });
      }
    } catch {
      /* fail silently — capacity is UI sugar, not critical */
    } finally {
      setLoading(false);
    }
  }, [eventId, tierId]);

  useEffect(() => {
    fetchCapacity();
    const id = setInterval(fetchCapacity, pollInterval);
    return () => clearInterval(id);
  }, [fetchCapacity, pollInterval]);

  if (loading || !data) {
    return (
      <div className="mt-2 h-1.5 w-full animate-pulse rounded-full bg-ink/10" />
    );
  }

  const { reserved, remaining } = data;
  const pct = Math.min(100, Math.round((reserved / totalQty) * 100));
  const isAlmostGone = remaining <= Math.max(3, Math.ceil(totalQty * 0.1));
  const isSoldOut = remaining === 0;

  const barColor = isSoldOut
    ? 'bg-ember'
    : isAlmostGone
    ? 'bg-amber-400'
    : 'bg-reef';

  return (
    <div className="mt-2 space-y-1.5">
      {/* bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* label */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink/45">
          {isSoldOut ? (
            <span className="font-semibold text-ember">Sold out</span>
          ) : (
            <>
              <span className="font-semibold text-ink">{remaining}</span>
              {' '}of {totalQty} remaining
            </>
          )}
        </span>
        {isAlmostGone && !isSoldOut && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Almost gone
          </span>
        )}
        {isSoldOut && (
          <span className="rounded-full bg-ember/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
            Sold out
          </span>
        )}
      </div>
    </div>
  );
};

export default EventCapacityBar;