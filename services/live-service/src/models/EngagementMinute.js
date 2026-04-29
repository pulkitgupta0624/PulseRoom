const mongoose = require('mongoose');

const engagementMinuteSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true
    },
    minuteBucket: {
      type: Date,
      required: true,
      index: true
    },
    chatMessages: {
      type: Number,
      default: 0
    },
    pollVotes: {
      type: Number,
      default: 0
    },
    reactions: {
      type: Number,
      default: 0
    },
    questions: {
      type: Number,
      default: 0
    },
    totalInteractions: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

engagementMinuteSchema.index({ eventId: 1, minuteBucket: 1 }, { unique: true });

module.exports = mongoose.model('EngagementMinute', engagementMinuteSchema);
