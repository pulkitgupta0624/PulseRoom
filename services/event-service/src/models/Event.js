const mongoose = require('mongoose');
const { EventTypes, EventVisibility } = require('@pulseroom/common');

const speakerSchema = new mongoose.Schema(
  {
    userId: String,
    name: {
      type: String,
      required: true
    },
    title: String,
    company: String,
    bio: String,
    avatarUrl: String
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    description: String,
    startsAt: {
      type: Date,
      required: true
    },
    endsAt: {
      type: Date,
      required: true
    },
    roomLabel: String,
    capacity: Number,
    speakerNames: {
      type: [String],
      default: []
    }
  },
  { _id: false }
);

const ticketTierSchema = new mongoose.Schema(
  {
    tierId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: String,
    price: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    quantity: {
      type: Number,
      required: true
    },
    perks: {
      type: [String],
      default: []
    },
    saleStart: Date,
    saleEnd: Date,
    isFree: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    organizerId: {
      type: String,
      required: true,
      index: true
    },
    title: {
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
      required: true
    },
    coverImageUrl: String,
    type: {
      type: String,
      enum: Object.values(EventTypes),
      required: true,
      index: true
    },
    visibility: {
      type: String,
      enum: Object.values(EventVisibility),
      default: EventVisibility.PUBLIC,
      index: true
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'cancelled', 'completed'],
      default: 'draft',
      index: true
    },
    timezone: {
      type: String,
      default: 'Asia/Calcutta'
    },
    startsAt: {
      type: Date,
      required: true,
      index: true
    },
    endsAt: {
      type: Date,
      required: true
    },
    venueName: String,
    venueAddress: String,
    city: String,
    country: String,
    streamUrl: String,
    organizerSignatureName: String,
    categories: {
      type: [String],
      default: [],
      index: true
    },
    tags: {
      type: [String],
      default: [],
      index: true
    },
    speakers: {
      type: [speakerSchema],
      default: []
    },
    sessions: {
      type: [sessionSchema],
      default: []
    },
    ticketTiers: {
      type: [ticketTierSchema],
      default: []
    },
    featured: {
      type: Boolean,
      default: false
    },
    allowsChat: {
      type: Boolean,
      default: true
    },
    allowsQa: {
      type: Boolean,
      default: true
    },
    liveStatus: {
      type: String,
      enum: ['scheduled', 'live', 'ended'],
      default: 'scheduled',
      index: true
    },
    attendeesCount: {
      type: Number,
      default: 0
    },
    analytics: {
      views: {
        type: Number,
        default: 0
      },
      bookings: {
        type: Number,
        default: 0
      },
      revenue: {
        type: Number,
        default: 0
      }
    }
  },
  {
    timestamps: true
  }
);

eventSchema.index({
  title: 'text',
  summary: 'text',
  description: 'text',
  categories: 'text',
  tags: 'text'
});

module.exports = mongoose.model('Event', eventSchema);
