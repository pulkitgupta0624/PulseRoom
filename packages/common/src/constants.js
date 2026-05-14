const Roles = Object.freeze({
  ATTENDEE: 'attendee',
  ORGANIZER: 'organizer',
  SPEAKER: 'speaker',
  MODERATOR: 'moderator',
  ADMIN: 'admin'
});

const EventTypes = Object.freeze({
  ONLINE: 'online',
  OFFLINE: 'offline',
  HYBRID: 'hybrid'
});

const EventVisibility = Object.freeze({
  PUBLIC: 'public',
  PRIVATE: 'private'
});

const PaymentStatus = Object.freeze({
  CREATED: 'created',
  REQUIRES_ACTION: 'requires_action',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REFUNDED: 'refunded'
});

const BookingStatus = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
});

const WaitlistStatus = Object.freeze({
  WAITING: 'waiting',
  OFFERED: 'offered',
  CLAIMED: 'claimed',
  FULFILLED: 'fulfilled',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
});

const NotificationChannel = Object.freeze({
  EMAIL: 'email',
  IN_APP: 'in_app',
  PUSH: 'push'
});

const DomainEvents = Object.freeze({
  USER_REGISTERED: 'user.registered',
  USER_UPDATED: 'user.updated',
  ORGANIZER_VERIFICATION_REQUESTED: 'organizer.verification.requested',
  ORGANIZER_VERIFIED: 'organizer.verified',
  EVENT_CREATED: 'event.created',
  EVENT_UPDATED: 'event.updated',
  EVENT_PUBLISHED: 'event.published',
  EVENT_COMPLETED: 'event.completed',
  SPONSOR_APPLICATION_SUBMITTED: 'sponsor.application.submitted',
  SPONSOR_APPLICATION_APPROVED: 'sponsor.application.approved',
  SPONSOR_APPLICATION_REJECTED: 'sponsor.application.rejected',
  SPONSOR_ACTIVATED: 'sponsor.activated',
  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_CHECKED_IN: 'booking.checked_in',
  BOOKING_ABANDONED: 'booking.abandoned',
  BOOKING_CANCELLED: 'booking.cancelled',
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_REFUNDED: 'payment.refunded',
  WAITLIST_JOINED: 'waitlist.joined',
  WAITLIST_SPOT_OFFERED: 'waitlist.spot.offered',
  WAITLIST_SPOT_CLAIMED: 'waitlist.spot.claimed',
  WAITLIST_SPOT_EXPIRED: 'waitlist.spot.expired',
  SESSION_WAITLIST_PROMOTED: 'session.waitlist.promoted',
  CHAT_MESSAGE_SENT: 'chat.message.sent',
  CHAT_MESSAGE_MODERATED: 'chat.message.moderated',
  POLL_CREATED: 'poll.created',
  POLL_RESPONSE: 'poll.response',
  QUESTION_POSTED: 'question.posted',
  QUESTION_UPVOTED: 'question.upvoted',
  ANNOUNCEMENT_POSTED: 'announcement.posted',
  REPLAY_AVAILABLE: 'replay.available',
  EVENT_REVIEW_SUBMITTED: 'event.review.submitted',
  EVENT_FEEDBACK_SUBMITTED: 'event.feedback.submitted',
  SERIES_MEMBERSHIP_ACTIVATED: 'series.membership.activated',
  NETWORKING_OPTED_IN: 'networking.opted_in',
  SAFETY_INCIDENT_DETECTED: 'safety.incident.detected',
  NOTIFICATION_CREATED: 'notification.created'
});

module.exports = {
  Roles,
  EventTypes,
  EventVisibility,
  PaymentStatus,
  BookingStatus,
  WaitlistStatus,
  NotificationChannel,
  DomainEvents
};
