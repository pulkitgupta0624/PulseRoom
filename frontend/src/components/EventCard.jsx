import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { formatCurrency, formatDate } from '../lib/formatters';

const EventCard = ({ event, compact = false }) => {
  const lowestTier = [...(event.ticketTiers || [])].sort((left, right) => left.price - right.price)[0];
  const lowestPrice =
    typeof event.lowestPrice === 'number' ? event.lowestPrice : lowestTier?.price ?? 0;
  const lowestPriceCurrency = event.lowestPriceCurrency || lowestTier?.currency || 'INR';
  const isFree = typeof event.isFree === 'boolean'
    ? event.isFree
    : Boolean(lowestTier?.isFree || lowestPrice === 0);

  return (
    <Link
      to={`/events/${event._id}`}
      className={clsx(
        'group rounded-[28px] border border-ink/10 bg-haze/90 p-5 shadow-bloom transition duration-300 hover:-translate-y-1 hover:border-ink/20',
        compact ? 'space-y-3' : 'space-y-4'
      )}
    >
      <div className="overflow-hidden rounded-[24px] bg-gradient-to-br from-dusk to-reef p-6 text-sand">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-sand/70">{event.type}</p>
            <h3 className="mt-3 font-display text-2xl leading-tight">{event.title}</h3>
          </div>
          <span className="rounded-full border border-sand/20 px-3 py-1 text-xs uppercase tracking-[0.25em]">
            {event.status}
          </span>
        </div>
        <p className="mt-4 max-w-md text-sm text-sand/80">{event.summary}</p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(event.categories || []).map((category) => (
            <span key={category} className="rounded-full bg-reef/10 px-3 py-1 text-xs font-semibold text-reef">
              {category}
            </span>
          ))}
        </div>
        <p className="text-sm text-ink/75">{formatDate(event.startsAt)}</p>
        <p className="text-sm text-ink/75">
          {event.city ? `${event.city}, ${event.country || ''}` : event.streamUrl ? 'Live online stream' : 'Venue details on event page'}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-ink/10 pt-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink/55">From</p>
          <p className="font-display text-xl text-ink">
            {isFree ? 'Free' : formatCurrency(lowestPrice, lowestPriceCurrency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-ink/55">Attendees</p>
          <p className="font-semibold text-ink">{event.attendeesCount || 0}</p>
        </div>
      </div>
    </Link>
  );
};

export default EventCard;
