const mongoose = require('mongoose');
const { WaitlistStatus } = require('@pulseroom/common');

const waitlistEntrySchema = new mongoose.Schema(
  {
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
    userId: {
      type: String,
      required: true,
      index: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    attendee: {
      name: {
        type: String,
        required: true
      },
      email: {
        type: String,
        required: true
      }
    },
    status: {
      type: String,
      enum: Object.values(WaitlistStatus),
      default: WaitlistStatus.WAITING,
      index: true
    },
    offerToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    offerExpiresAt: Date,
    offerSentAt: Date,
    claimedAt: Date,
    fulfilledAt: Date,
    expiredAt: Date,
    cancelledAt: Date,
    claimBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking'
    },
    eventSnapshot: {
      title: String,
      startsAt: Date,
      organizerId: String,
      tierName: String,
      currency: String
    }
  },
  {
    timestamps: true
  }
);

waitlistEntrySchema.index({ eventId: 1, tierId: 1, status: 1, createdAt: 1 });
waitlistEntrySchema.index({ eventId: 1, tierId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model('WaitlistEntry', waitlistEntrySchema);
