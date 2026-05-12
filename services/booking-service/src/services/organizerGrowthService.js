const { BookingStatus } = require('@pulseroom/common');
const {
  buildBookingTickets,
  buildTicketNumber,
  getCheckedInTicketCount
} = require('./ticketService');

const REVENUE_MILESTONES = Object.freeze([100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000]);
const BOOKING_RATE_WINDOW_MS = 60 * 60 * 1000;

const normalizeCount = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeId = (value) => String(value || '');

const normalizeLocationLabel = (value) => {
  const label = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  return label || 'Unknown';
};

const buildLocationRegion = (location) => {
  if (!location || location === 'Unknown') {
    return 'Not shared';
  }

  const parts = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return parts[parts.length - 1] || location;
};

const getReportingAmount = (booking) =>
  normalizeCount(booking?.pricing?.reportingAmount ?? booking?.amount);

const getAttendeeCount = (booking) => {
  const quantity = normalizeCount(booking?.quantity);
  if (quantity > 0) {
    return quantity;
  }

  return Array.isArray(booking?.tickets) ? booking.tickets.length : 0;
};

const buildRate = (value, total) => {
  if (!total) {
    return 0;
  }

  return Number(((normalizeCount(value) / total) * 100).toFixed(1));
};

const buildRevenueMilestones = (revenue) => {
  const reached = REVENUE_MILESTONES.filter((milestone) => revenue >= milestone);
  const lastReached = reached[reached.length - 1] || 0;
  const next = REVENUE_MILESTONES.find((milestone) => revenue < milestone) || null;
  const progressToNext = next
    ? Number((((revenue - lastReached) / Math.max(1, next - lastReached)) * 100).toFixed(1))
    : 100;

  return {
    thresholds: REVENUE_MILESTONES,
    reached,
    lastReached,
    next,
    progressToNext: Math.max(0, Math.min(progressToNext, 100))
  };
};

const buildBookingRateSummary = (bookings, now = new Date()) => {
  const nowMs = new Date(now).getTime();
  const currentWindowStart = nowMs - BOOKING_RATE_WINDOW_MS;
  const previousWindowStart = currentWindowStart - BOOKING_RATE_WINDOW_MS;

  let currentWindowCount = 0;
  let previousWindowCount = 0;
  let lastConfirmedAt = null;

  for (const booking of bookings) {
    const confirmedAt = new Date(booking.confirmedAt || booking.createdAt).getTime();
    if (!Number.isFinite(confirmedAt)) {
      continue;
    }

    if (!lastConfirmedAt || confirmedAt > new Date(lastConfirmedAt).getTime()) {
      lastConfirmedAt = new Date(confirmedAt).toISOString();
    }

    if (confirmedAt >= currentWindowStart && confirmedAt <= nowMs) {
      currentWindowCount += 1;
      continue;
    }

    if (confirmedAt >= previousWindowStart && confirmedAt < currentWindowStart) {
      previousWindowCount += 1;
    }
  }

  const growthFactor = previousWindowCount
    ? Number((currentWindowCount / previousWindowCount).toFixed(2))
    : currentWindowCount
      ? null
      : 0;
  const doubled = previousWindowCount > 0 && currentWindowCount >= previousWindowCount * 2 && currentWindowCount >= 2;

  return {
    windowMinutes: BOOKING_RATE_WINDOW_MS / (60 * 1000),
    currentWindowCount,
    previousWindowCount,
    growthFactor,
    doubled,
    lastConfirmedAt
  };
};

const buildEventBreakdown = (events) => {
  const map = new Map();

  for (const event of events) {
    const eventId = normalizeId(event?._id || event?.eventId);
    if (!eventId) {
      continue;
    }

    map.set(eventId, {
      eventId,
      title: event?.title || 'Event',
      views: normalizeCount(event?.analytics?.views),
      bookingStarted: 0,
      confirmedBookings: 0,
      attendees: 0,
      revenue: 0
    });
  }

  return map;
};

const buildOrganizerGrowthDashboard = ({
  events = [],
  bookings = [],
  userLocations = [],
  reportingCurrency = 'USD',
  now = new Date()
}) => {
  const confirmedBookings = bookings.filter((booking) => booking.status === BookingStatus.CONFIRMED);
  const eventBreakdown = buildEventBreakdown(events);
  const locationByUserId = new Map(
    userLocations.map((item) => [normalizeId(item.userId), normalizeLocationLabel(item.location)])
  );
  const geographyMap = new Map();

  let pageViews = 0;
  for (const event of events) {
    pageViews += normalizeCount(event?.analytics?.views);
  }

  for (const booking of bookings) {
    const eventId = normalizeId(booking.eventId);
    if (!eventId) {
      continue;
    }

    if (!eventBreakdown.has(eventId)) {
      eventBreakdown.set(eventId, {
        eventId,
        title: booking.eventSnapshot?.title || 'Event',
        views: 0,
        bookingStarted: 0,
        confirmedBookings: 0,
        attendees: 0,
        revenue: 0
      });
    }

    eventBreakdown.get(eventId).bookingStarted += 1;
  }

  let revenue = 0;
  let attendees = 0;
  let checkedIns = 0;

  for (const booking of confirmedBookings) {
    const eventId = normalizeId(booking.eventId);
    const quantity = getAttendeeCount(booking);
    const reportingAmount = getReportingAmount(booking);
    const eventMetrics = eventBreakdown.get(eventId);
    const checkedInCount = getCheckedInTicketCount(booking);

    revenue += reportingAmount;
    attendees += quantity;
    checkedIns += checkedInCount;

    if (eventMetrics) {
      eventMetrics.confirmedBookings += 1;
      eventMetrics.attendees += quantity;
      eventMetrics.revenue += reportingAmount;
    }

    const location = locationByUserId.get(normalizeId(booking.userId)) || 'Unknown';
    const region = buildLocationRegion(location);
    const currentLocation = geographyMap.get(location) || {
      location,
      region,
      attendees: 0,
      bookings: 0,
      revenue: 0
    };

    currentLocation.attendees += quantity;
    currentLocation.bookings += 1;
    currentLocation.revenue += reportingAmount;
    geographyMap.set(location, currentLocation);
  }

  const geography = Array.from(geographyMap.values()).sort((left, right) => right.attendees - left.attendees);
  const maxLocationAttendees = geography[0]?.attendees || 0;
  const funnel = {
    pageViews,
    bookingStarted: bookings.length,
    confirmedBookings: confirmedBookings.length,
    viewToStartRate: buildRate(bookings.length, pageViews),
    startToConfirmRate: buildRate(confirmedBookings.length, bookings.length),
    viewToConfirmRate: buildRate(confirmedBookings.length, pageViews)
  };

  return {
    currency: reportingCurrency,
    summary: {
      activeEvents: events.length,
      pageViews,
      bookingStarted: bookings.length,
      confirmedBookings: confirmedBookings.length,
      revenue,
      attendees,
      checkedIns
    },
    funnel,
    milestones: buildRevenueMilestones(revenue),
    bookingRate: buildBookingRateSummary(confirmedBookings, now),
    geography: geography.slice(0, 12).map((item) => ({
      ...item,
      share: buildRate(item.attendees, Math.max(1, attendees)),
      intensity: maxLocationAttendees ? Number((item.attendees / maxLocationAttendees).toFixed(2)) : 0
    })),
    topLocation: geography[0]
      ? {
          location: geography[0].location,
          attendees: geography[0].attendees,
          region: geography[0].region
        }
      : null,
    recentBookings: [...confirmedBookings]
      .sort((left, right) => {
        const rightTime = new Date(right.confirmedAt || right.createdAt).getTime();
        const leftTime = new Date(left.confirmedAt || left.createdAt).getTime();
        return rightTime - leftTime;
      })
      .slice(0, 10)
      .map((booking) => ({
        bookingId: booking._id?.toString?.() || normalizeId(booking._id),
        bookingNumber: booking.bookingNumber,
        eventId: booking.eventId,
        eventTitle: booking.eventSnapshot?.title || 'Event',
        attendeeName:
          buildBookingTickets(booking)[0]?.attendee?.name || booking.attendee?.name || 'Guest',
        attendeeEmail:
          buildBookingTickets(booking)[0]?.attendee?.email || booking.attendee?.email || '',
        attendeeLocation: locationByUserId.get(normalizeId(booking.userId)) || 'Unknown',
        quantity: getAttendeeCount(booking),
        reportingAmount: getReportingAmount(booking),
        confirmedAt: booking.confirmedAt || booking.createdAt
      })),
    eventBreakdown: Array.from(eventBreakdown.values())
      .map((event) => ({
        ...event,
        viewToStartRate: buildRate(event.bookingStarted, event.views),
        startToConfirmRate: buildRate(event.confirmedBookings, event.bookingStarted)
      }))
      .sort((left, right) => right.revenue - left.revenue || right.confirmedBookings - left.confirmedBookings)
  };
};

const escapeCsvValue = (value) => {
  const stringValue = value === null || value === undefined ? '' : String(value);
  const escaped = stringValue.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
};

const toIsoString = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const buildEventBookingsCsv = ({
  event,
  bookings = [],
  userLocations = [],
  reportingCurrency = 'USD'
}) => {
  const locationByUserId = new Map(
    userLocations.map((item) => [normalizeId(item.userId), normalizeLocationLabel(item.location)])
  );
  const rows = [
    [
      'bookingId',
      'bookingNumber',
      'ticketId',
      'ticketNumber',
      'ticketPosition',
      'status',
      'eventId',
      'eventTitle',
      'userId',
      'attendeeName',
      'attendeeEmail',
      'attendeeLocation',
      'tierId',
      'tierName',
      'quantity',
      'amount',
      'currency',
      'reportingAmount',
      'reportingCurrency',
      'promoCode',
      'promoDiscountAmount',
      'referralCode',
      'referralDiscountAmount',
      'createdAt',
      'confirmedAt',
      'checkedInAt',
      'ticketAssignedAt',
      'ticketTransferredAt',
      'cancelledAt',
      'refundedAt',
      'invoiceNumber'
    ]
  ];

  for (const booking of bookings) {
    const tickets = buildBookingTickets(booking);
    const attendeeLocation = locationByUserId.get(normalizeId(booking.userId)) || '';

    for (const ticket of tickets) {
      rows.push([
        booking._id?.toString?.() || normalizeId(booking._id),
        booking.bookingNumber,
        ticket.ticketId || '',
        buildTicketNumber(booking, ticket),
        normalizeCount(ticket.position, 1),
        booking.status,
        booking.eventId,
        event?.title || booking.eventSnapshot?.title || 'Event',
        booking.userId,
        ticket.attendee?.name || booking.attendee?.name || '',
        ticket.attendee?.email || booking.attendee?.email || '',
        attendeeLocation,
        booking.tierId,
        booking.tierName,
        normalizeCount(booking.quantity),
        normalizeCount(booking.amount),
        booking.currency || '',
        getReportingAmount(booking),
        booking.pricing?.reportingCurrency || reportingCurrency,
        booking.promoCode?.code || '',
        normalizeCount(booking.promoCode?.discountAmount),
        booking.referral?.code || '',
        normalizeCount(booking.referral?.discountAmount),
        toIsoString(booking.createdAt),
        toIsoString(booking.confirmedAt),
        toIsoString(ticket.checkedInAt || booking.checkedInAt),
        toIsoString(ticket.assignedAt),
        toIsoString(ticket.transferredAt),
        toIsoString(booking.cancelledAt),
        toIsoString(booking.refundedAt),
        booking.invoice?.invoiceNumber || ''
      ]);
    }
  }

  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
};

module.exports = {
  BOOKING_RATE_WINDOW_MS,
  REVENUE_MILESTONES,
  buildEventBookingsCsv,
  buildOrganizerGrowthDashboard,
  buildRevenueMilestones,
  normalizeLocationLabel
};
