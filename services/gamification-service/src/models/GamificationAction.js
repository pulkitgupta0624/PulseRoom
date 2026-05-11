const mongoose = require('mongoose');

const gamificationActionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    actionType: {
      type: String,
      required: true
    },
    ruleKey: {
      type: String,
      default: ''
    },
    dedupeKey: {
      type: String,
      required: true,
      unique: true
    },
    points: {
      type: Number,
      default: 0
    },
    occurredAt: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('GamificationAction', gamificationActionSchema);
