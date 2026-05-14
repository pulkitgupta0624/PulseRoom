const { BookingStatus } = require('@pulseroom/common');
const {
  assessBookingRisk,
  summarizeHistoricalBookings
} = require('./bookingRiskService');

describe('bookingRiskService', () => {
  test('summarizeHistoricalBookings counts confirmed, refunded, and cancelled history', () => {
    expect(
      summarizeHistoricalBookings([
        { status: BookingStatus.CONFIRMED },
        { status: BookingStatus.REFUNDED },
        { status: BookingStatus.REFUNDED },
        { status: BookingStatus.CANCELLED }
      ])
    ).toEqual({
      refundedCount: 2,
      cancelledCount: 1,
      confirmedCount: 1
    });
  });

  test('assessBookingRisk flags suspicious booking patterns', () => {
    const assessment = assessBookingRisk({
      booking: {
        attendee: {
          email: 'risk-user@mailinator.com'
        },
        quantity: 6,
        amount: 100,
        pricing: {
          reportingAmount: 100,
          reportingDiscountAmount: 60
        }
      },
      historicalSummary: {
        refundedCount: 3,
        cancelledCount: 1
      }
    });

    expect(assessment.shouldFlag).toBe(true);
    expect(assessment.severity).toBe('critical');
    expect(assessment.autoActions).toContain('manual_review');
    expect(assessment.evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Disposable email domain'),
        expect.stringContaining('Large booking quantity'),
        expect.stringContaining('refunded bookings')
      ])
    );
  });

  test('assessBookingRisk keeps healthy bookings low risk', () => {
    const assessment = assessBookingRisk({
      booking: {
        attendee: {
          email: 'attendee@example.com'
        },
        quantity: 1,
        amount: 80,
        pricing: {
          reportingAmount: 80,
          reportingDiscountAmount: 0
        }
      },
      historicalSummary: {
        refundedCount: 0,
        cancelledCount: 0
      }
    });

    expect(assessment).toMatchObject({
      severity: 'low',
      riskScore: 0,
      shouldFlag: false
    });
  });
});
