const mongoose = require('mongoose');
const { BookingStatus } = require('@pulseroom/common');

const savedAgendaSessionSchema = new mongoose.Schema(
  {
    sessionKey: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: String,
    startsAt: Date,
    endsAt: Date,
    roomLabel: String,
    speakerNames: {
      type: [String],
      default: []
    },
    savedAt: Date
  },
  { _id: false }
);

const bookingTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true
    },
    position: {
      type: Number,
      required: true
    },
    attendee: {
      name: String,
      email: String
    },
    qrCodeToken: {
      type: String,
      index: true,
      sparse: true,
      unique: true
    },
    assignedAt: Date,
    transferredAt: Date,
    checkedInAt: Date,
    checkedInBy: String
  },
  { _id: false }
);

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
    pricing: {
      baseCurrency: String,
      settlementCurrency: String,
      exchangeRate: Number,
      reportingCurrency: String,
      reportingExchangeRate: Number,
      baseUnitAmount: Number,
      unitAmount: Number,
      baseSubtotal: Number,
      subtotal: Number,
      baseDiscountAmount: Number,
      discountAmount: Number,
      baseTaxableAmount: Number,
      taxableAmount: Number,
      taxCountry: String,
      taxLabel: String,
      taxRate: Number,
      baseTaxAmount: Number,
      taxAmount: Number,
      baseTotal: Number,
      total: Number,
      registrationNumber: String,
      reportingAmount: Number,
      reportingDiscountAmount: Number
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
    tickets: {
      type: [bookingTicketSchema],
      default: []
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
      baseOriginalAmount: Number,
      baseDiscountAmount: Number,
      reportingDiscountAmount: Number,
      trackedAt: Date
    },
    promoCode: {
      promoCodeId: {
        type: String,
        index: true
      },
      code: {
        type: String,
        index: true
      },
      discountType: String,
      discountValue: Number,
      originalAmount: Number,
      discountAmount: Number,
      finalAmount: Number,
      baseOriginalAmount: Number,
      baseDiscountAmount: Number,
      reportingDiscountAmount: Number,
      reservedAt: Date,
      releasedAt: Date
    },
    eventSnapshot: {
      title: String,
      startsAt: Date,
      organizerId: String
    },
    savedAgenda: {
      sessions: {
        type: [savedAgendaSessionSchema],
        default: []
      },
      updatedAt: Date
    },
    invoice: {
      invoiceNumber: String,
      issuedAt: Date
    },
    qrCodeToken: String,
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
