const { clampWindowDays } = require('./analyticsService');

const DAY_MS = 24 * 60 * 60 * 1000;

const toDayKey = (value) => {
  const date = new Date(value);
  return date.toISOString().slice(0, 10);
};

const buildReferralAnalytics = ({ bookings, events, days = 30 }) => {
  const windowDays = clampWindowDays(days);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bucketMap = new Map();
  const orderedDays = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * DAY_MS);
    const key = toDayKey(date);
    orderedDays.push(key);
    bucketMap.set(key, {
      date: key,
      bookings: 0,
      revenue: 0,
      ticketsSold: 0
    });
  }

  const eventMap = new Map(
    events.map((event) => [
      event._id.toString(),
      {
        eventId: event._id.toString(),
        title: event.title,
        referralCode: event.referral?.code || null,
        referralLink: event.referralLink || null,
        linkOpens: Number(event.referral?.clicks || 0),
        referredBookings: 0,
        ticketsSold: 0,
        revenue: 0,
        conversionRate: 0,
        lastReferredAt: null
      }
    ])
  );

  let referredBookings = 0;
  let ticketsSold = 0;
  let revenue = 0;
  let linkOpens = 0;

  for (const event of eventMap.values()) {
    linkOpens += event.linkOpens;
  }

  for (const booking of bookings) {
    const effectiveDate = booking.confirmedAt || booking.createdAt;
    const dayKey = toDayKey(effectiveDate);
    const bucket = bucketMap.get(dayKey);
    const eventEntry = eventMap.get(booking.eventId) || {
      eventId: booking.eventId,
      title: booking.eventSnapshot?.title || 'Event',
      referralCode: booking.referral?.code || null,
      referralLink: null,
      linkOpens: 0,
      referredBookings: 0,
      ticketsSold: 0,
      revenue: 0,
      conversionRate: 0,
      lastReferredAt: null
    };

    referredBookings += 1;
    ticketsSold += booking.quantity || 0;
    revenue += booking.amount || 0;

    if (bucket) {
      bucket.bookings += 1;
      bucket.revenue += booking.amount || 0;
      bucket.ticketsSold += booking.quantity || 0;
    }

    eventEntry.referredBookings += 1;
    eventEntry.ticketsSold += booking.quantity || 0;
    eventEntry.revenue += booking.amount || 0;
    eventEntry.lastReferredAt =
      !eventEntry.lastReferredAt || new Date(eventEntry.lastReferredAt) < new Date(effectiveDate)
        ? effectiveDate
        : eventEntry.lastReferredAt;

    eventMap.set(booking.eventId, eventEntry);
  }

  const eventsWithMetrics = Array.from(eventMap.values())
    .map((event) => ({
      ...event,
      conversionRate: event.linkOpens > 0 ? Number(((event.referredBookings / event.linkOpens) * 100).toFixed(1)) : 0
    }))
    .sort((left, right) => {
      if (right.revenue !== left.revenue) {
        return right.revenue - left.revenue;
      }
      return right.referredBookings - left.referredBookings;
    });

  return {
    windowDays,
    totals: {
      activeReferralLinks: events.filter((event) => event.referral?.code).length,
      linkOpens,
      referredBookings,
      ticketsSold,
      revenue,
      conversionRate: linkOpens > 0 ? Number(((referredBookings / linkOpens) * 100).toFixed(1)) : 0
    },
    series: orderedDays.map((key) => bucketMap.get(key)),
    events: eventsWithMetrics
  };
};

module.exports = {
  buildReferralAnalytics
};
