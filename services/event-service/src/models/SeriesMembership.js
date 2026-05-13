const mongoose = require('mongoose');

const membershipPerksSchema = new mongoose.Schema(
  {
    planName: String,
    price: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    discountPercent: {
      type: Number,
      default: 0
    },
    earlyAccessHours: {
      type: Number,
      default: 0
    },
    includesReplayLibrary: {
      type: Boolean,
      default: false
    },
    vipNetworking: {
      type: Boolean,
      default: false
    },
    membersOnlyBooking: {
      type: Boolean,
      default: false
    },
    perks: {
      type: [String],
      default: []
    }
  },
  { _id: false }
);

const seriesMembershipSchema = new mongoose.Schema(
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
      name: String,
      email: String
    },
    status: {
      type: String,
      enum: ['active', 'cancelled'],
      default: 'active',
      index: true
    },
    source: {
      type: String,
      enum: ['self_join', 'organizer_grant'],
      default: 'self_join'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastUsedAt: Date,
    perks: {
      type: membershipPerksSchema,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

seriesMembershipSchema.index({ seriesId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('SeriesMembership', seriesMembershipSchema);
