jest.mock('../models/Booking', () => ({
  aggregate: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

const { BookingStatus, DomainEvents } = require('@pulseroom/common');
const Booking = require('../models/Booking');
const {
  buildPromotableWaitlistCandidatePipeline,
  promoteNextSessionWaitlistSeat
} = require('./sessionWaitlistPromotionService');

describe('sessionWaitlistPromotionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildPromotableWaitlistCandidatePipeline targets confirmed waitlisted agenda sessions', () => {
    const pipeline = buildPromotableWaitlistCandidatePipeline({
      eventId: 'event-123',
      sessionKey: 'opening-keynote'
    });

    expect(pipeline[0].$match).toEqual({
      eventId: 'event-123',
      status: BookingStatus.CONFIRMED
    });
    expect(pipeline[5].$match).toEqual({
      'savedAgenda.sessions.sessionKey': 'opening-keynote',
      'savedAgenda.sessions.registrationStatus': 'waitlisted'
    });
    expect(pipeline[7].$sort).toEqual({
      sessionWaitlistPriority: 1,
      confirmedAt: 1,
      createdAt: 1
    });
  });

  test('returns null when no promotable waitlist booking is found', async () => {
    Booking.aggregate.mockResolvedValue([]);

    const result = await promoteNextSessionWaitlistSeat({
      eventId: 'event-123',
      sessionKey: 'opening-keynote'
    });

    expect(result).toBeNull();
    expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('promotes the next waitlisted attendee and publishes an event', async () => {
    const now = new Date('2026-05-13T09:00:00.000Z');
    const eventBus = {
      publish: jest.fn().mockResolvedValue()
    };

    Booking.aggregate.mockResolvedValue([
      {
        bookingId: 'booking-7'
      }
    ]);
    Booking.findOneAndUpdate.mockResolvedValue({
      _id: 'booking-7',
      userId: 'user-7',
      attendee: {
        name: 'Riya',
        email: 'riya@example.com'
      },
      eventSnapshot: {
        title: 'Pulse Summit'
      },
      savedAgenda: {
        sessions: [
          {
            sessionKey: 'opening-keynote',
            title: 'Opening Keynote',
            roomLabel: 'Main Stage',
            startsAt: new Date('2026-05-20T10:00:00.000Z'),
            registrationStatus: 'registered',
            registeredAt: now,
            waitlistedAt: null
          }
        ]
      }
    });

    const result = await promoteNextSessionWaitlistSeat({
      eventId: 'event-123',
      sessionKey: 'opening-keynote',
      eventTitle: 'Pulse Summit',
      now,
      eventBus
    });

    expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'booking-7',
        eventId: 'event-123',
        status: BookingStatus.CONFIRMED,
        'savedAgenda.sessions': {
          $elemMatch: {
            sessionKey: 'opening-keynote',
            registrationStatus: 'waitlisted'
          }
        }
      },
      {
        $set: {
          'savedAgenda.sessions.$[target].registrationStatus': 'registered',
          'savedAgenda.sessions.$[target].registeredAt': now,
          'savedAgenda.sessions.$[target].waitlistedAt': null,
          'savedAgenda.updatedAt': now
        }
      },
      {
        new: true,
        arrayFilters: [
          {
            'target.sessionKey': 'opening-keynote',
            'target.registrationStatus': 'waitlisted'
          }
        ]
      }
    );

    expect(eventBus.publish).toHaveBeenCalledWith(
      DomainEvents.SESSION_WAITLIST_PROMOTED,
      expect.objectContaining({
        bookingId: 'booking-7',
        eventId: 'event-123',
        eventTitle: 'Pulse Summit',
        userId: 'user-7',
        attendeeEmail: 'riya@example.com',
        attendeeName: 'Riya',
        sessionKey: 'opening-keynote',
        sessionTitle: 'Opening Keynote',
        roomLabel: 'Main Stage',
        sessionStartsAt: new Date('2026-05-20T10:00:00.000Z')
      })
    );

    expect(result).toMatchObject({
      bookingId: 'booking-7',
      eventId: 'event-123',
      userId: 'user-7',
      attendeeEmail: 'riya@example.com',
      sessionTitle: 'Opening Keynote'
    });
  });

  test('keeps the promotion when event publishing fails', async () => {
    const now = new Date('2026-05-13T09:00:00.000Z');
    const eventBus = {
      publish: jest.fn().mockRejectedValue(new Error('redis offline'))
    };
    const logger = {
      warn: jest.fn()
    };

    Booking.aggregate.mockResolvedValue([
      {
        bookingId: 'booking-7'
      }
    ]);
    Booking.findOneAndUpdate.mockResolvedValue({
      _id: 'booking-7',
      userId: 'user-7',
      attendee: {
        email: 'riya@example.com'
      },
      eventSnapshot: {
        title: 'Pulse Summit'
      },
      savedAgenda: {
        sessions: [
          {
            sessionKey: 'opening-keynote',
            title: 'Opening Keynote',
            registrationStatus: 'registered'
          }
        ]
      }
    });

    const result = await promoteNextSessionWaitlistSeat({
      eventId: 'event-123',
      sessionKey: 'opening-keynote',
      eventTitle: 'Pulse Summit',
      now,
      eventBus,
      logger
    });

    expect(result).not.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Failed to publish session waitlist promotion',
        eventId: 'event-123',
        sessionKey: 'opening-keynote',
        bookingId: 'booking-7',
        error: 'redis offline'
      })
    );
  });
});
