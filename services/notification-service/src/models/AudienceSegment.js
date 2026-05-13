const mongoose = require('mongoose');

const audienceSegmentSchema = new mongoose.Schema(
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
    updatedByUserId: String,
    name: {
      type: String,
      required: true
    },
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
    }
  },
  {
    timestamps: true
  }
);

audienceSegmentSchema.index({ eventId: 1, organizerId: 1, updatedAt: -1 });
audienceSegmentSchema.index({ scopeType: 1, seriesId: 1, organizerId: 1, updatedAt: -1 });

module.exports = mongoose.model('AudienceSegment', audienceSegmentSchema);
