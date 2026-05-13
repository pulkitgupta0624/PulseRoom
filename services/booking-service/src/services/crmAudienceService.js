const {
  SESSION_REGISTRATION_STATUSES,
  normalizeSessionRegistrationStatus
} = require('./sessionRegistrationService');
const { getCheckedInTicketCount } = require('./ticketService');

const sortBookingsByRecency = (bookings = []) =>
  [...bookings].sort((left, right) => {
    const leftTime = new Date(left?.confirmedAt || left?.createdAt || 0).getTime();
    const rightTime = new Date(right?.confirmedAt || right?.createdAt || 0).getTime();
    return rightTime - leftTime;
  });

const countAgendaSessionsByStatus = (booking, expectedStatus) =>
  (Array.isArray(booking?.savedAgenda?.sessions) ? booking.savedAgenda.sessions : []).filter(
    (session) =>
      normalizeSessionRegistrationStatus(session?.registrationStatus) === expectedStatus
  ).length;

const resolveTicketCount = (booking) => {
  const explicitQuantity = Number(booking?.quantity || 0);
  if (explicitQuantity > 0) {
    return explicitQuantity;
  }

  return Array.isArray(booking?.tickets) && booking.tickets.length ? booking.tickets.length : 1;
};

const buildCrmAudienceEntry = (booking) => {
  const ticketCount = resolveTicketCount(booking);
  const checkedInCount = getCheckedInTicketCount(booking);
  const registeredSessionCount = countAgendaSessionsByStatus(
    booking,
    SESSION_REGISTRATION_STATUSES.REGISTERED
  );
  const waitlistedSessionCount = countAgendaSessionsByStatus(
    booking,
    SESSION_REGISTRATION_STATUSES.WAITLISTED
  );

  return {
    bookingId: booking._id.toString(),
    userId: booking.userId,
    attendeeName:
      String(booking.attendee?.name || '').trim() ||
      String(booking.attendee?.email || '').trim() ||
      'Attendee',
    email: String(booking.attendee?.email || '').trim(),
    tierId: booking.tierId,
    tierName: booking.tierName || '',
    ticketCount,
    checkedInCount,
    hasCheckedIn: checkedInCount > 0,
    allTicketsCheckedIn: ticketCount > 0 && checkedInCount === ticketCount,
    confirmedAt: booking.confirmedAt || booking.createdAt || null,
    checkedInAt: booking.checkedInAt || null,
    createdAt: booking.createdAt || null,
    referralCode: String(booking.referral?.code || '').trim(),
    referredBooking: Boolean(booking.referral?.code),
    registeredSessionCount,
    waitlistedSessionCount,
    savedSessionCount: Array.isArray(booking?.savedAgenda?.sessions)
      ? booking.savedAgenda.sessions.length
      : 0
  };
};

const buildLatestBookingMapByUser = (bookings = []) => {
  const latestByUser = new Map();

  for (const booking of sortBookingsByRecency(bookings)) {
    const userId = String(booking?.userId || '').trim();
    if (!userId || latestByUser.has(userId)) {
      continue;
    }

    latestByUser.set(userId, booking);
  }

  return latestByUser;
};

const buildCrmAudienceSnapshot = (bookings = []) => {
  const audience = [...buildLatestBookingMapByUser(bookings).values()]
    .map(buildCrmAudienceEntry)
    .sort((left, right) => {
      const leftCheckedIn = left.hasCheckedIn ? 1 : 0;
      const rightCheckedIn = right.hasCheckedIn ? 1 : 0;
      if (leftCheckedIn !== rightCheckedIn) {
        return rightCheckedIn - leftCheckedIn;
      }

      const leftTime = new Date(left.confirmedAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.confirmedAt || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });

  return {
    summary: {
      audienceCount: audience.length,
      checkedInCount: audience.filter((entry) => entry.hasCheckedIn).length,
      multiTicketCount: audience.filter((entry) => entry.ticketCount > 1).length,
      referredCount: audience.filter((entry) => entry.referredBooking).length,
      reservedSessionCount: audience.filter((entry) => entry.registeredSessionCount > 0).length,
      waitlistedSessionCount: audience.filter((entry) => entry.waitlistedSessionCount > 0).length
    },
    audience
  };
};

module.exports = {
  buildCrmAudienceEntry,
  buildCrmAudienceSnapshot,
  countAgendaSessionsByStatus
};
