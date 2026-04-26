const mongoose = require('mongoose');

const chatRestrictionSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['mute', 'ban'],
      required: true
    },
    reason: String,
    expiresAt: Date,
    createdBy: String
  },
  {
    timestamps: true
  }
);

chatRestrictionSchema.index({ eventId: 1, userId: 1, type: 1 });

module.exports = mongoose.model('ChatRestriction', chatRestrictionSchema);

