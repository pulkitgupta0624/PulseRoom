const { BookingStatus } = require('@pulseroom/common');

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'yopmail.com'
]);

const categorizeSeverity = (riskScore) => {
  if (riskScore >= 85) {
    return 'critical';
  }
  if (riskScore >= 65) {
    return 'high';
  }
  if (riskScore >= 40) {
    return 'medium';
  }
  return 'low';
};

const summarizeHistoricalBookings = (bookings = []) =>
  (Array.isArray(bookings) ? bookings : []).reduce(
    (summary, booking) => {
      if (booking.status === BookingStatus.REFUNDED) {
        summary.refundedCount += 1;
      }
      if (booking.status === BookingStatus.CANCELLED) {
        summary.cancelledCount += 1;
      }
      if (booking.status === BookingStatus.CONFIRMED) {
        summary.confirmedCount += 1;
      }
      return summary;
    },
    {
      refundedCount: 0,
      cancelledCount: 0,
      confirmedCount: 0
    }
  );

const assessBookingRisk = ({ booking, historicalSummary = {} }) => {
  const evidence = [];
  const autoActions = [];
  let riskScore = 0;

  const attendeeEmail = String(booking?.attendee?.email || '').trim().toLowerCase();
  const emailDomain = attendeeEmail.split('@')[1] || '';

  if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
    evidence.push(`Disposable email domain detected: ${emailDomain}`);
    riskScore += 45;
  }

  if (Number(booking?.quantity || 0) >= 5) {
    evidence.push(`Large booking quantity: ${booking.quantity} tickets`);
    riskScore += 25;
  }

  if (Number(historicalSummary.refundedCount || 0) >= 2) {
    evidence.push(`User has ${historicalSummary.refundedCount} refunded bookings on record`);
    riskScore += 30;
  }

  if (Number(historicalSummary.cancelledCount || 0) >= 3) {
    evidence.push(`User has ${historicalSummary.cancelledCount} cancelled bookings on record`);
    riskScore += 15;
  }

  const reportedAmount = Number(booking?.pricing?.reportingDiscountAmount || 0);
  const bookingAmount = Number(booking?.pricing?.reportingAmount || booking?.amount || 0);
  if (reportedAmount > 0 && bookingAmount > 0 && reportedAmount / bookingAmount >= 0.5) {
    evidence.push('High discount ratio detected on this booking');
    riskScore += 15;
  }

  const severity = categorizeSeverity(riskScore);
  if (severity !== 'low') {
    autoActions.push('manual_review');
  }

  return {
    category: 'booking_risk',
    severity,
    riskScore,
    evidence,
    autoActions,
    shouldFlag: severity !== 'low'
  };
};

module.exports = {
  DISPOSABLE_EMAIL_DOMAINS,
  assessBookingRisk,
  summarizeHistoricalBookings
};
