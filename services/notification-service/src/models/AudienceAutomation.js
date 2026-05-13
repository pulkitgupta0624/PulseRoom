const mongoose = require('mongoose');

const audienceAutomationSchema = new mongoose.Schema(
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
    updatedByUserId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
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
    triggerType: {
      type: String,
      enum: [
        'event_starts_24h',
        'event_starts_1h',
        'replay_ready',
        'event_completed_no_show',
        'series_membership_activated',
        'series_next_event_24h'
      ],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'paused'],
      default: 'active',
      index: true
    },
    segmentId: String,
    segmentName: String,
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
    scheduledFor: Date,
    lastTriggeredAt: Date,
    recentTriggerKeys: {
      type: [String],
      default: []
    },
    lastCampaignId: String,
    lastDispatchStatus: {
      type: String,
      enum: ['sent', 'failed']
    },
    lastDispatchError: String
  },
  {
    timestamps: true
  }
);

audienceAutomationSchema.index({ eventId: 1, organizerId: 1, updatedAt: -1 });
audienceAutomationSchema.index({ eventId: 1, triggerType: 1, status: 1, lastTriggeredAt: 1 });
audienceAutomationSchema.index({ scopeType: 1, seriesId: 1, organizerId: 1, updatedAt: -1 });
audienceAutomationSchema.index({ scopeType: 1, seriesId: 1, triggerType: 1, status: 1 });

module.exports = mongoose.model('AudienceAutomation', audienceAutomationSchema);
