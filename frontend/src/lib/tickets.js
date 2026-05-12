const getBookingTickets = (booking) => {
  if (Array.isArray(booking?.tickets) && booking.tickets.length) {
    return booking.tickets;
  }

  return booking?.ticket ? [booking.ticket] : [];
};

const getBookingCheckedInCount = (booking) =>
  getBookingTickets(booking).filter((ticket) => ticket?.checkedIn).length;

const flattenBookingTickets = (bookings = []) =>
  bookings.flatMap((booking) =>
    getBookingTickets(booking).map((ticket) => ({
      booking,
      ticket
    }))
  );

export { flattenBookingTickets, getBookingCheckedInCount, getBookingTickets };
