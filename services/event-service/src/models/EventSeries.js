const mongoose = require('mongoose');

const membershipSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true
    },
    allowSelfJoin: {
      type: Boolean,
      default: true
    },
    planName: {
      type: String,
      default: 'Series Pass'
    },
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
      default: 24
    },
    includesReplayLibrary: {
      type: Boolean,
      default: true
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

const seriesThemeSchema = new mongoose.Schema(
  {
    accentColor: {
      type: String,
      default: '#1D7A85'
    },
    coverImageUrl: String
  },
  { _id: false }
);

const eventSeriesSchema = new mongoose.Schema(
  {
    organizerId: {
      type: String,
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    summary: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    cadenceLabel: {
      type: String,
      default: ''
    },
    categories: {
      type: [String],
      default: []
    },
    tags: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true
    },
    membershipSettings: {
      type: membershipSettingsSchema,
      default: () => ({})
    },
    theme: {
      type: seriesThemeSchema,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

eventSeriesSchema.index({
  name: 'text',
  summary: 'text',
  description: 'text',
  tags: 'text'
});

module.exports = mongoose.model('EventSeries', eventSeriesSchema);
