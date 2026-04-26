const mongoose = require('mongoose');

const reactionCounterSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true
    },
    emoji: {
      type: String,
      required: true
    },
    count: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

reactionCounterSchema.index({ eventId: 1, emoji: 1 }, { unique: true });

module.exports = mongoose.model('ReactionCounter', reactionCounterSchema);

