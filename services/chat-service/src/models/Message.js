const mongoose = require('mongoose');

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
    deletedAt: Date
  },
  {
    timestamps: true
  }
);

messageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);

