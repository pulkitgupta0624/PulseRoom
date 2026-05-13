const mongoose = require('mongoose');
const { PaymentStatus } = require('@pulseroom/common');

const attendeeSchema = new mongoose.Schema(
  {
    name: String,
    email: String
  },
  { _id: false }
);

const seriesSnapshotSchema = new mongoose.Schema(
  {
    name: String,
    slug: String,
    planName: String
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    seriesId: {
      type: String,
      required: true,
      index: true
    },
    organizerId: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    attendee: {
      type: attendeeSchema,
      default: () => ({})
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
    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SeriesMembership'
    },
    seriesSnapshot: {
      type: seriesSnapshotSchema,
      default: () => ({})
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('SeriesMembershipPurchase', purchaseSchema);
