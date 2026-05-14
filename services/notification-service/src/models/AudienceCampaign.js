const mongoose = require('mongoose');

const recipientOverrideSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true
    },
    attendeeName: String,
    email: String,
    tierName: String,
    ticketCount: Number,
    referredBooking: Boolean,
    hasCheckedIn: Boolean,
    registeredSessionCount: Number,
    waitlistedSessionCount: Number,
    isNetworkingOptedIn: Boolean,
    isNoShow: Boolean,
    ctaUrl: String,
    ctaLabel: String
  },
  { _id: false }
);

const journeyMetaSchema = new mongoose.Schema(
  {
    goalType: String,
    targetEventId: String,
    targetEventTitle: String,
    targetEventStartsAt: Date,
    stopOnGoal: {
      type: Boolean,
      default: true
    },
    resendEnabled: {
      type: Boolean,
      default: false
    },
    resendDelayHours: Number,
    touchIndex: {
      type: Number,
      default: 0
    },
    parentCampaignId: String
  },
  { _id: false }
);

const journeySkippedRecipientSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true
    },
    attendeeName: String,
    email: String,
    reason: {
      type: String,
      required: true
    },
    reasonLabel: String,
    touchIndex: {
      type: Number,
      default: 0
    },
    campaignId: String,
    skippedAt: Date
  },
  { _id: false }
);

const journeyRecipientsSchema = new mongoose.Schema(
  {
    matchedRecipients: {
      type: [recipientOverrideSchema],
      default: []
    },
    skippedRecipients: {
      type: [journeySkippedRecipientSchema],
      default: []
    }
  },
  { _id: false }
);

const variantMetaSchema = new mongoose.Schema(
  {
    experimentEnabled: {
      type: Boolean,
      default: false
    },
    variantKey: String,
    variantLabel: String,
    autoWinnerEnabled: {
      type: Boolean,
      default: false
    },
    winnerVariantKey: String,
    winnerSelected: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

const audienceCampaignSchema = new mongoose.Schema(
  {
    scopeType: {
      type: String,
      enum: ['event', 'series'],
      default: 'event',
      index: true
    },
    eventId: {
      type: String,
      required: true,
      index: true
    },
    seriesId: {
      type: String,
      default: '',
      index: true
    },
    organizerId: {
      type: String,
      required: true,
      index: true
    },
    createdByUserId: {
      type: String,
      required: true
    },
    segmentId: String,
    segmentName: String,
    title: {
      type: String,
      required: true
    },
    body: {
      type: String,
      required: true
    },
    channel: {
      type: String,
      enum: ['in_app', 'email', 'both'],
      default: 'both'
    },
    sourceType: {
      type: String,
      enum: ['manual', 'automation'],
      default: 'manual',
      index: true
    },
    automationId: String,
    automationName: String,
    triggerType: String,
    status: {
      type: String,
      enum: ['queued', 'scheduled', 'sending', 'sent', 'failed'],
      default: 'queued',
      index: true
    },
    scheduledFor: Date,
    filters: {
      search: {
        type: String,
        default: ''
      },
      checkedIn: {
        type: String,
        default: 'all'
      },
      networking: {
        type: String,
        default: 'all'
      },
      sessionState: {
        type: String,
        default: 'all'
      },
      ticketType: {
        type: String,
        default: 'all'
      },
      referral: {
        type: String,
        default: 'all'
      },
      source: {
        type: String,
        default: 'all'
      },
      joinedWindow: {
        type: String,
        default: 'all'
      },
      planType: {
        type: String,
        default: 'all'
      },
      replayAccess: {
        type: String,
        default: 'all'
      },
      vipNetworking: {
        type: String,
        default: 'all'
      }
    },
    recipientCount: {
      type: Number,
      default: 0
    },
    recipientOverrides: {
      type: [recipientOverrideSchema],
      default: []
    },
    journeyMeta: {
      type: journeyMetaSchema,
      default: null
    },
    journeyRecipients: {
      type: journeyRecipientsSchema,
      default: null
    },
    variantMeta: {
      type: variantMetaSchema,
      default: null
    },
    inAppRecipientCount: {
      type: Number,
      default: 0
    },
    emailRecipientCount: {
      type: Number,
      default: 0
    },
    sentAt: Date,
    dispatchError: String
  },
  {
    timestamps: true
  }
);

audienceCampaignSchema.index({ eventId: 1, organizerId: 1, createdAt: -1 });
audienceCampaignSchema.index({ eventId: 1, organizerId: 1, status: 1, scheduledFor: 1 });
audienceCampaignSchema.index({ scopeType: 1, seriesId: 1, organizerId: 1, createdAt: -1 });
audienceCampaignSchema.index({ scopeType: 1, seriesId: 1, organizerId: 1, status: 1, scheduledFor: 1 });

module.exports = mongoose.model('AudienceCampaign', audienceCampaignSchema);
