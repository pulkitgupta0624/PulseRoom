const mongoose = require('mongoose');
const { BookingStatus } = require('@pulseroom/common');

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    eventId: {
      type: String,
      required: true,
      index: true
    },
    tierId: {
      type: String,
      required: true,
      index: true
    },
    tierName: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'INR'
    },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PENDING,
      index: true
    },
    reservationExpiresAt: {
      type: Date,
      index: true
    },
    attendee: {
      name: String,
      email: String
    },
    referral: {
      code: {
        type: String,
        index: true
      },
      referrerUserId: {
        type: String,
        index: true
      },
      discountType: String,
      discountValue: Number,
      originalAmount: Number,
      discountAmount: Number,
      finalAmount: Number,
      trackedAt: Date
    },
    eventSnapshot: {
      title: String,
      startsAt: Date,
      organizerId: String
    },
    invoice: {
      invoiceNumber: String,
      issuedAt: Date
    },
    qrCodeToken: {
      type: String,
      index: true,
      sparse: true,
      unique: true
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
    },
    sourceWaitlistEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WaitlistEntry'
    },
    confirmedAt: Date,
    checkedInAt: Date,
    checkedInBy: String,
    cancelledAt: Date,
    refundedAt: Date
  },
  {
    timestamps: true
  }
);

bookingSchema.index({ eventId: 1, tierId: 1, status: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
