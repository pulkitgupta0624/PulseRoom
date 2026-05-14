const mongoose = require('mongoose');

const messageModerationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['visible', 'flagged', 'hidden'],
      default: 'visible'
    },
    category: {
      type: String,
      default: ''
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    },
    riskScore: {
      type: Number,
      default: 0
    },
    evidence: {
      type: [String],
      default: []
    }
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    roomType: {
      type: String,
      enum: ['event', 'private'],
      required: true,
      index: true
    },
    roomId: {
      type: String,
      required: true,
      index: true
    },
    eventId: {
      type: String,
      index: true
    },
    senderId: {
      type: String,
      required: true,
      index: true
    },
    senderRole: String,
    recipientId: String,
    body: {
      type: String,
      required: true
    },
    moderation: {
      type: messageModerationSchema,
      default: () => ({})
    },
    deletedAt: Date
  },
  {
    timestamps: true
  }
);

messageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
