const crypto = require('crypto');

const buildTicketToken = () => crypto.randomBytes(18).toString('hex');
const buildTicketId = () => `tkt_${crypto.randomBytes(8).toString('hex')}`;

const normalizeText = (value) => String(value || '').trim();
const normalizePersistedQrCodeToken = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const normalizeAttendee = (attendee = {}, fallback = {}) => ({
  name: normalizeText(attendee?.name || fallback?.name),
  email: normalizeText(attendee?.email || fallback?.email)
});

const resolveTicketQuantity = (booking) => {
  const quantity = Number(booking?.quantity);
  if (Number.isInteger(quantity) && quantity > 0) {
    return quantity;
  }

  const existingCount = Array.isArray(booking?.tickets) ? booking.tickets.length : 0;
  return existingCount > 0 ? existingCount : 1;
};

const buildBookingTickets = (booking, { assignTokens = false } = {}) => {
  const quantity = resolveTicketQuantity(booking);
  const existingTickets = Array.isArray(booking?.tickets) ? booking.tickets : [];
  const defaultAttendee = normalizeAttendee(booking?.attendee);
  const legacyCheckedInAt = existingTickets.length === 0 ? booking?.checkedInAt || null : null;
  const legacyCheckedInBy = existingTickets.length === 0 ? booking?.checkedInBy || null : null;
  const assignmentTime = booking?.confirmedAt || booking?.createdAt || null;

  return Array.from({ length: quantity }, (_, index) => {
    const existingTicket = existingTickets[index] || {};
    const hasAssignedAttendee = Boolean(defaultAttendee.name || defaultAttendee.email);
    const qrCodeToken =
      normalizePersistedQrCodeToken(existingTicket.qrCodeToken) ||
      (index === 0 ? normalizePersistedQrCodeToken(booking?.qrCodeToken) : undefined) ||
      (assignTokens ? buildTicketToken() : undefined);

    const nextTicket = {
      ticketId: existingTicket.ticketId || buildTicketId(),
      position: index + 1,
      attendee: normalizeAttendee(existingTicket.attendee, defaultAttendee),
      assignedAt:
        existingTicket.assignedAt || (hasAssignedAttendee ? assignmentTime : null),
      transferredAt: existingTicket.transferredAt || null,
      checkedInAt: existingTicket.checkedInAt || legacyCheckedInAt,
      checkedInBy: existingTicket.checkedInBy || legacyCheckedInBy
    };

    if (qrCodeToken) {
      nextTicket.qrCodeToken = qrCodeToken;
    }

    return nextTicket;
  });
};

const getCheckedInTicketCount = (booking) => {
  if (Array.isArray(booking?.tickets) && booking.tickets.length) {
    return booking.tickets.filter((ticket) => ticket?.checkedInAt).length;
  }

  return booking?.checkedInAt ? resolveTicketQuantity(booking) : 0;
};

const getFirstCheckedInTicket = (tickets = []) =>
  [...tickets]
    .filter((ticket) => ticket?.checkedInAt)
    .sort((left, right) => new Date(left.checkedInAt) - new Date(right.checkedInAt))[0] || null;

const hydrateBookingTickets = (booking, options = {}) => {
  const raw = typeof booking?.toObject === 'function' ? booking.toObject() : booking;
  const tickets = buildBookingTickets(raw, options);
  const primaryTicket = tickets[0] || null;
  const firstCheckedInTicket = getFirstCheckedInTicket(tickets);

  return {
    ...raw,
    tickets,
    qrCodeToken: primaryTicket?.qrCodeToken || raw?.qrCodeToken || null,
    checkedInAt: firstCheckedInTicket?.checkedInAt || raw?.checkedInAt || null,
    checkedInBy: firstCheckedInTicket?.checkedInBy || raw?.checkedInBy || null
  };
};

const syncBookingTickets = (booking, options = {}) => {
  const next = hydrateBookingTickets(booking, options);
  const previousTickets = JSON.stringify(
    (Array.isArray(booking?.tickets) ? booking.tickets : []).map((ticket) =>
      typeof ticket?.toObject === 'function' ? ticket.toObject() : ticket
    )
  );
  const nextTickets = JSON.stringify(next.tickets);
  const previousPersistedQrToken = normalizePersistedQrCodeToken(booking?.qrCodeToken);
  const nextPersistedQrToken = normalizePersistedQrCodeToken(next.qrCodeToken);
  const previousQrToken = String(previousPersistedQrToken || '');
  const nextQrToken = String(nextPersistedQrToken || '');
  const previousCheckedInAt = booking?.checkedInAt ? new Date(booking.checkedInAt).toISOString() : '';
  const nextCheckedInAt = next.checkedInAt ? new Date(next.checkedInAt).toISOString() : '';
  const previousCheckedInBy = String(booking?.checkedInBy || '');
  const nextCheckedInBy = String(next.checkedInBy || '');
  const needsLegacyQrCleanup =
    (booking?.qrCodeToken === null || booking?.qrCodeToken === '') &&
    nextPersistedQrToken === undefined;
  const changed =
    previousTickets !== nextTickets ||
    previousQrToken !== nextQrToken ||
    previousCheckedInAt !== nextCheckedInAt ||
    previousCheckedInBy !== nextCheckedInBy ||
    needsLegacyQrCleanup;

  if (booking && typeof booking.set === 'function') {
    booking.set('tickets', next.tickets);
    booking.set('qrCodeToken', nextPersistedQrToken);
    booking.set('checkedInAt', next.checkedInAt);
    booking.set('checkedInBy', next.checkedInBy);
  } else if (booking && typeof booking === 'object') {
    booking.tickets = next.tickets;
    booking.qrCodeToken = nextPersistedQrToken;
    booking.checkedInAt = next.checkedInAt;
    booking.checkedInBy = next.checkedInBy;
  }

  return {
    changed,
    booking: next
  };
};

const findTicketById = (booking, ticketId) =>
  (Array.isArray(booking?.tickets) ? booking.tickets : []).find(
    (ticket) => String(ticket.ticketId) === String(ticketId)
  ) || null;

const findTicketByToken = (booking, token) =>
  (Array.isArray(booking?.tickets) ? booking.tickets : []).find(
    (ticket) => ticket?.qrCodeToken && String(ticket.qrCodeToken) === String(token)
  ) || null;

const buildTicketNumber = (booking, ticket) =>
  `${booking.bookingNumber}-${String(ticket.position || 1).padStart(2, '0')}`;

const buildQrCodeValue = (booking, ticket) =>
  JSON.stringify({
    type: 'pulseroom-ticket',
    bookingId: booking._id.toString(),
    eventId: booking.eventId,
    bookingNumber: booking.bookingNumber,
    ticketId: ticket.ticketId,
    ticketNumber: buildTicketNumber(booking, ticket),
    token: ticket.qrCodeToken
  });

const serializeTicket = (booking, ticket) => ({
  ticketId: ticket.ticketId,
  position: ticket.position,
  ticketNumber: buildTicketNumber(booking, ticket),
  attendee: ticket.attendee || {},
  qrCodeValue: ticket.qrCodeToken ? buildQrCodeValue(booking, ticket) : null,
  checkedIn: Boolean(ticket.checkedInAt),
  checkedInAt: ticket.checkedInAt || null,
  assignedAt: ticket.assignedAt || null,
  transferredAt: ticket.transferredAt || null
});

const serializeBooking = (booking) => {
  const raw = hydrateBookingTickets(booking);
  const tickets = raw.tickets.map((ticket) => serializeTicket(raw, ticket));
  const checkedInTicketCount = tickets.filter((ticket) => ticket.checkedIn).length;

  return {
    ...raw,
    tickets,
    ticket: tickets[0] || null,
    checkedInTicketCount,
    ticketCount: tickets.length,
    allTicketsCheckedIn: tickets.length > 0 && checkedInTicketCount === tickets.length
  };
};

module.exports = {
  buildBookingTickets,
  buildQrCodeValue,
  buildTicketId,
  buildTicketNumber,
  buildTicketToken,
  findTicketById,
  findTicketByToken,
  getCheckedInTicketCount,
  hydrateBookingTickets,
  serializeBooking,
  syncBookingTickets
};
