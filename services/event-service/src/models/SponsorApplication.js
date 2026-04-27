const mongoose = require('mongoose');

const revenueBreakdownSchema = new mongoose.Schema(
  {
    grossAmount: {
      type: Number,
      default: 0
    },
    platformFeePercent: {
      type: Number,
      default: 5
    },
    platformFeeAmount: {
      type: Number,
      default: 0
    },
    organizerNetAmount: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const sponsorApplicationSchema = new mongoose.Schema(
  {
    sponsorId: {
      type: String,
      required: true,
      index: true
    },
    eventId: {
      type: String,
      required: true,
      index: true
    },
    organizerId: {
      type: String,
      required: true,
      index: true
    },
    eventTitle: {
      type: String,
      required: true
    },
    packageId: {
      type: String,
      required: true
    },
    packageName: {
      type: String,
      required: true
    },
    tier: {
      type: String,
      enum: ['gold', 'silver', 'bronze', 'custom'],
      default: 'custom'
    },
    price: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    companyName: {
      type: String,
      required: true
    },
    logoUrl: String,
    description: String,
    boothUrl: String,
    websiteUrl: String,
    contactName: {
      type: String,
      required: true
    },
    contactEmail: {
      type: String,
      required: true,
      index: true
    },
    notes: String,
    showOnEventPage: {
      type: Boolean,
      default: true
    },
    showInLiveRoom: {
      type: Boolean,
      default: true
    },
    showInEmails: {
      type: Boolean,
      default: false
    },
    featuredCallout: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'active', 'rejected'],
      default: 'pending',
      index: true
    },
    approvedAt: Date,
    approvedBy: String,
    rejectedAt: Date,
    rejectedBy: String,
    activatedAt: Date,
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded'],
      default: 'unpaid',
      index: true
    },
    paymentId: String,
    payout: {
      type: revenueBreakdownSchema,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

sponsorApplicationSchema.index({ eventId: 1, status: 1, createdAt: -1 });
sponsorApplicationSchema.index({ eventId: 1, sponsorId: 1 }, { unique: true });

module.exports = mongoose.model('SponsorApplication', sponsorApplicationSchema);
