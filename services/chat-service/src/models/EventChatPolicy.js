const mongoose = require('mongoose');

const eventChatPolicySchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    slowModeSeconds: {
      type: Number,
      default: 0
    },
    updatedBy: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('EventChatPolicy', eventChatPolicySchema);
