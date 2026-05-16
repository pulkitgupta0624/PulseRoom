const { serializeBooking, syncBookingTickets } = require('./ticketService');

describe('ticketService', () => {
  it('creates one seat record per ticket and serializes unique QR payloads', () => {
    const booking = {
      _id: 'booking-1',
      eventId: 'event-1',
      bookingNumber: 'BK-101',
      quantity: 2,
      attendee: {
        name: 'Alex',
        email: 'alex@example.com'
      },
      qrCodeToken: 'legacy-token',
      confirmedAt: '2026-05-01T10:05:00.000Z',
      tickets: []
    };

    const { changed } = syncBookingTickets(booking, { assignTokens: true });
    expect(changed).toBe(true);
    expect(booking.tickets).toHaveLength(2);
    expect(booking.tickets[0].qrCodeToken).toBe('legacy-token');
    expect(booking.tickets[1].qrCodeToken).toEqual(expect.any(String));
    expect(booking.tickets[1].qrCodeToken).not.toBe('legacy-token');

    const serialized = serializeBooking(booking);
    expect(serialized.ticketCount).toBe(2);
    expect(serialized.ticket.ticketNumber).toBe('BK-101-01');
    expect(JSON.parse(serialized.tickets[1].qrCodeValue)).toMatchObject({
      bookingId: 'booking-1',
      eventId: 'event-1',
      ticketNumber: 'BK-101-02',
      token: booking.tickets[1].qrCodeToken
    });
  });

  it('treats migrated legacy group bookings as fully checked in when the old aggregate flag was set', () => {
    const serialized = serializeBooking({
      _id: 'booking-2',
      eventId: 'event-2',
      bookingNumber: 'BK-102',
      quantity: 3,
      attendee: {
        name: 'Taylor',
        email: 'taylor@example.com'
      },
      qrCodeToken: 'legacy-group-token',
      checkedInAt: '2026-05-01T12:00:00.000Z'
    });

    expect(serialized.ticketCount).toBe(3);
    expect(serialized.checkedInTicketCount).toBe(3);
    expect(serialized.allTicketsCheckedIn).toBe(true);
  });

  it('cleans up legacy null booking-level qr tokens instead of persisting duplicate nulls', () => {
    const booking = {
      _id: 'booking-3',
      eventId: 'event-3',
      bookingNumber: 'BK-103',
      quantity: 1,
      attendee: {
        name: 'Jordan',
        email: 'jordan@example.com'
      },
      qrCodeToken: null,
      tickets: []
    };

    const { changed } = syncBookingTickets(booking);

    expect(changed).toBe(true);
    expect(booking.qrCodeToken).toBeUndefined();

    const serialized = serializeBooking(booking);
    expect(serialized.ticket.qrCodeValue).toBeNull();
  });

  it('leaves pending ticket qr tokens unset until payment is confirmed', () => {
    const booking = {
      _id: 'booking-4',
      eventId: 'event-4',
      bookingNumber: 'BK-104',
      quantity: 2,
      attendee: {
        name: 'Casey',
        email: 'casey@example.com'
      },
      tickets: []
    };

    syncBookingTickets(booking, { assignTokens: false });

    expect(booking.tickets[0].qrCodeToken).toBeUndefined();
    expect(booking.tickets[1].qrCodeToken).toBeUndefined();
    expect(JSON.stringify(booking.tickets)).not.toContain('qrCodeToken');

    const serialized = serializeBooking(booking);
    expect(serialized.tickets[0].qrCodeValue).toBeNull();
    expect(serialized.tickets[1].qrCodeValue).toBeNull();
  });
});
