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

const sponsorPackageSchema = new mongoose.Schema(
  {
    packageId: {
      type: String,
      required: true
    },
    tier: {
      type: String,
      enum: ['gold', 'silver', 'bronze', 'custom'],
      default: 'custom'
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
    maxSlots: {
      type: Number,
      required: true
    },
    slotsUsed: {
      type: Number,
      default: 0
    },
    perks: {
      type: [String],
      default: []
    },
    paymentLinkUrl: String,
    paymentInstructions: String,
    isActive: {
      type: Boolean,
      default: true
    },
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
    }
  },
  { _id: false }
);

const sponsorSchema = new mongoose.Schema(
  {
    sponsorId: {
      type: String,
      required: true
    },
    applicationId: String,
    packageId: String,
    tier: {
      type: String,
      enum: ['gold', 'silver', 'bronze', 'custom'],
      default: 'custom'
    },
    packageName: {
      type: String,
      required: true
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
    contactName: String,
    contactEmail: String,
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
      default: 'pending'
    },
    approvedAt: Date,
    activatedAt: Date,
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded'],
      default: 'unpaid'
    },
    paymentId: String,
    payout: {
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
    metrics: {
      boothClicks: {
        type: Number,
        default: 0
      }
    },
    createdAt: Date,
    updatedAt: Date
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
    sponsorPackages: {
      type: [sponsorPackageSchema],
      default: []
    },
    sponsors: {
      type: [sponsorSchema],
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
    referral: {
      code: {
        type: String
      },
      discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage'
      },
      discountValue: {
        type: Number,
        default: 10
      },
      maxRedemptions: {
        type: Number,
        default: 1
      },
      redemptionsUsed: {
        type: Number,
        default: 0
      },
      status: {
        type: String,
        enum: ['active', 'redeemed', 'expired'],
        default: 'active'
      },
      generatedAt: Date,
      expiresAt: Date,
      lastRedeemedAt: Date,
      lastRedeemedByUserId: String,
      totalRedemptions: {
        type: Number,
        default: 0
      },
      totalDiscountGiven: {
        type: Number,
        default: 0
      },
      clicks: {
        type: Number,
        default: 0
      }
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
eventSchema.index({ 'referral.code': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Event', eventSchema);
