const mongoose = require('mongoose');
const { PaymentStatus } = require('@pulseroom/common');

const paymentSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
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
    provider: {
      type: String,
      enum: ['manual', 'stripe'],
      default: 'manual'
    },
    providerPaymentId: {
      type: String,
      index: true
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
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.CREATED,
      index: true
    },
    clientSecret: String,
    refundId: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Payment', paymentSchema);

