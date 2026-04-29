const {
  buildBookingConfirmedUpdate,
  buildPaymentRefundedUpdate,
  normalizePositiveNumber
} = require('./eventCounterService');

describe('eventCounterService', () => {
  it('increments attendees by booking quantity when a booking is confirmed', () => {
    expect(
      buildBookingConfirmedUpdate({
        quantity: 3,
        amount: 1500
      })
    ).toEqual({
      $inc: {
        attendeesCount: 3,
        'analytics.bookings': 1,
        'analytics.revenue': 1500
      }
    });
  });

  it('rolls back attendees by refunded booking quantity', () => {
    expect(
      buildPaymentRefundedUpdate({
        quantity: 3,
        amount: 1500
      })
    ).toEqual({
      $inc: {
        attendeesCount: -3,
        'analytics.revenue': -1500
      }
    });
  });

  it('falls back to one attendee for malformed quantity payloads', () => {
    expect(normalizePositiveNumber('not-a-number')).toBe(1);
    expect(buildPaymentRefundedUpdate({ quantity: 'not-a-number' }).$inc.attendeesCount).toBe(-1);
  });
});
