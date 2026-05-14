import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { formatCurrency, formatDate } from '../lib/formatters';
import { parseCssVariablesBlob } from '../lib/eventTheme';
import OrganizerBadge from './OrganizerBadge';

const MotionLink = motion.create(Link);

const EventCard = ({ event, compact = false }) => {
  const lowestTier = [...(event.ticketTiers || [])].sort((left, right) => left.price - right.price)[0];
  const lowestPrice =
    typeof event.lowestPrice === 'number' ? event.lowestPrice : lowestTier?.price ?? 0;
  const lowestPriceCurrency = event.lowestPriceCurrency || lowestTier?.currency || 'INR';
  const isFree = typeof event.isFree === 'boolean'
    ? event.isFree
    : Boolean(lowestTier?.isFree || lowestPrice === 0);
  const themeStyles = parseCssVariablesBlob(event?.pageTheme?.cssVariables);
  const heroBackground = event?.coverImageUrl
    ? `linear-gradient(135deg, rgba(18,18,18,0.28), rgba(18,18,18,0.1)), url(${event.coverImageUrl})`
    : `linear-gradient(135deg, ${event?.pageTheme?.primaryColor || '#21484c'}, ${event?.pageTheme?.accentColor || '#b45309'})`;

  return (
    <MotionLink
      to={`/events/${event._id}`}
      layoutId={`event-card-${event._id}`}
      whileHover={{ y: -6, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className={clsx(
        'group rounded-[28px] border border-ink/10 bg-haze/90 p-5 shadow-bloom transition duration-300 hover:border-ink/20',
        compact ? 'space-y-3' : 'space-y-4'
      )}
    >
      <motion.div
        layoutId={`event-card-hero-${event._id}`}
        className="overflow-hidden rounded-[24px] border border-white/10 bg-cover bg-center p-6 text-sand"
        style={{
          ...themeStyles,
          background: heroBackground,
          fontFamily: 'var(--event-body-font)'
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-sand/70">{event.type}</p>
            {event.series?.name ? (
              <p className="mt-2 text-xs uppercase tracking-[0.22em] text-sand/70">
                {event.series.name}
              </p>
            ) : null}
            <h3
              className="mt-3 text-2xl leading-tight"
              style={{ fontFamily: 'var(--event-heading-font)' }}
            >
              {event.title}
            </h3>
          </div>
          <span className="rounded-full border border-sand/20 px-3 py-1 text-xs uppercase tracking-[0.25em]">
            {event.status}
          </span>
        </div>
        <p className="mt-4 max-w-md text-sm text-sand/80">{event.summary}</p>
      </motion.div>

      <div className="space-y-2">
        {event.organizerId && (
          <div className="flex items-center gap-3">
            <OrganizerBadge organizerId={event.organizerId} size="sm" />
          </div>
        )}
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
    </MotionLink>
  );
};

export default EventCard;
