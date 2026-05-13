const mongoose = require('mongoose');

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
