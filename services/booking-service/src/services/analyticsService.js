const { getCheckedInTicketCount } = require('./ticketService');

const DAY_MS = 24 * 60 * 60 * 1000;

const toDayKey = (value) => {
  const date = new Date(value);
  return date.toISOString().slice(0, 10);
};

const clampWindowDays = (value) => Math.max(7, Math.min(Number(value || 30), 90));

const getReportingAmount = (booking) =>
  Number(booking?.pricing?.reportingAmount ?? booking?.amount ?? 0);

const getAttendeeCount = (booking) => {
  const quantity = Number(booking?.quantity);
  if (Number.isFinite(quantity) && quantity > 0) {
    return quantity;
  }

  return Array.isArray(booking?.tickets) ? booking.tickets.length : 0;
};

const buildBookingAnalytics = ({ bookings, days = 30 }) => {
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
      attendees: 0,
      checkedIns: 0
    });
  }

  const topEvents = new Map();
  let confirmedBookings = 0;
  let revenue = 0;
  let attendees = 0;
  let checkedIns = 0;

  for (const booking of bookings) {
    const effectiveDate = booking.confirmedAt || booking.createdAt;
    const dayKey = toDayKey(effectiveDate);
    const bucket = bucketMap.get(dayKey);
    const bookingRevenue = getReportingAmount(booking);
    const attendeeCount = getAttendeeCount(booking);
    const checkedInCount = getCheckedInTicketCount(booking);

    confirmedBookings += 1;
    revenue += bookingRevenue;
    attendees += attendeeCount;
    checkedIns += checkedInCount;

    if (bucket) {
      bucket.bookings += 1;
      bucket.revenue += bookingRevenue;
      bucket.attendees += attendeeCount;
      bucket.checkedIns += checkedInCount;
    }

    const currentEvent = topEvents.get(booking.eventId) || {
      eventId: booking.eventId,
      title: booking.eventSnapshot?.title || 'Event',
      revenue: 0,
      bookings: 0,
      attendees: 0
    };
    currentEvent.revenue += bookingRevenue;
    currentEvent.bookings += 1;
    currentEvent.attendees += attendeeCount;
    topEvents.set(booking.eventId, currentEvent);
  }

  let cumulativeAttendees = 0;
  const series = orderedDays.map((key) => {
    const bucket = bucketMap.get(key);
    cumulativeAttendees += bucket.attendees;
    return {
      ...bucket,
      cumulativeAttendees
    };
  });

  return {
    windowDays,
    totals: {
      confirmedBookings,
      revenue,
      attendees,
      checkedIns
    },
    series,
    topEvents: Array.from(topEvents.values())
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 5)
  };
};

module.exports = {
  buildBookingAnalytics,
  clampWindowDays,
  getReportingAmount
};
