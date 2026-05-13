const { BookingStatus, DomainEvents } = require('@pulseroom/common');
const Booking = require('../models/Booking');
const {
  SESSION_REGISTRATION_STATUSES,
  normalizeSessionRegistrationStatus
} = require('./sessionRegistrationService');

const buildPromotableWaitlistCandidatePipeline = ({ eventId, sessionKey }) => [
  {
    $match: {
      eventId,
      status: BookingStatus.CONFIRMED
    }
  },
  {
    $sort: {
      userId: 1,
      confirmedAt: -1,
      createdAt: -1
    }
  },
  {
    $group: {
      _id: '$userId',
      booking: { $first: '$$ROOT' }
    }
  },
  {
    $replaceRoot: {
      newRoot: '$booking'
    }
  },
  {
    $unwind: '$savedAgenda.sessions'
  },
  {
    $match: {
      'savedAgenda.sessions.sessionKey': sessionKey,
      'savedAgenda.sessions.registrationStatus': SESSION_REGISTRATION_STATUSES.WAITLISTED
    }
  },
  {
    $addFields: {
      sessionWaitlistPriority: {
        $ifNull: [
          '$savedAgenda.sessions.waitlistedAt',
          {
            $ifNull: [
              '$savedAgenda.sessions.savedAt',
              '$createdAt'
            ]
          }
        ]
      }
    }
  },
  {
    $sort: {
      sessionWaitlistPriority: 1,
      confirmedAt: 1,
      createdAt: 1
    }
  },
  {
    $limit: 1
  },
  {
    $project: {
      bookingId: '$_id'
    }
  }
];

const findAgendaSession = (booking, sessionKey) =>
  (booking?.savedAgenda?.sessions || []).find((session) => session?.sessionKey === sessionKey) || null;

const publishSessionWaitlistPromotion = async ({
  eventBus,
  logger,
  promotion
}) => {
  if (!eventBus?.publish || !promotion) {
    return;
  }

  try {
    await eventBus.publish(DomainEvents.SESSION_WAITLIST_PROMOTED, promotion);
  } catch (error) {
    logger?.warn?.({
      message: 'Failed to publish session waitlist promotion',
      eventId: promotion.eventId,
      sessionKey: promotion.sessionKey,
      bookingId: promotion.bookingId,
      error: error.message
    });
  }
};

const promoteNextSessionWaitlistSeat = async ({
  eventId,
  sessionKey,
  eventTitle,
  now = new Date(),
  eventBus,
  logger
}) => {
  const [candidate] = await Booking.aggregate(
    buildPromotableWaitlistCandidatePipeline({
      eventId,
      sessionKey
    })
  );

  if (!candidate?.bookingId) {
    return null;
  }

  const updatedBooking = await Booking.findOneAndUpdate(
    {
      _id: candidate.bookingId,
      eventId,
      status: BookingStatus.CONFIRMED,
      'savedAgenda.sessions': {
        $elemMatch: {
          sessionKey,
          registrationStatus: SESSION_REGISTRATION_STATUSES.WAITLISTED
        }
      }
    },
    {
      $set: {
        'savedAgenda.sessions.$[target].registrationStatus': SESSION_REGISTRATION_STATUSES.REGISTERED,
        'savedAgenda.sessions.$[target].registeredAt': now,
        'savedAgenda.sessions.$[target].waitlistedAt': null,
        'savedAgenda.updatedAt': now
      }
    },
    {
      new: true,
      arrayFilters: [
        {
          'target.sessionKey': sessionKey,
          'target.registrationStatus': SESSION_REGISTRATION_STATUSES.WAITLISTED
        }
      ]
    }
  );

  const promotedSession = findAgendaSession(updatedBooking, sessionKey);
  if (
    !updatedBooking ||
    !promotedSession ||
    normalizeSessionRegistrationStatus(promotedSession.registrationStatus) !==
      SESSION_REGISTRATION_STATUSES.REGISTERED
  ) {
    return null;
  }

  const promotion = {
    bookingId: updatedBooking._id.toString(),
    eventId,
    eventTitle: eventTitle || updatedBooking.eventSnapshot?.title || 'your event',
    userId: updatedBooking.userId,
    attendeeEmail: updatedBooking.attendee?.email || '',
    attendeeName: updatedBooking.attendee?.name || '',
    sessionKey,
    sessionTitle: promotedSession.title || 'your session',
    sessionStartsAt: promotedSession.startsAt || null,
    roomLabel: promotedSession.roomLabel || ''
  };

  await publishSessionWaitlistPromotion({
    eventBus,
    logger,
    promotion
  });

  return promotion;
};

module.exports = {
  buildPromotableWaitlistCandidatePipeline,
  promoteNextSessionWaitlistSeat
};
