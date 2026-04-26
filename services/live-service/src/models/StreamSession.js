const mongoose = require('mongoose');

const streamSessionSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    broadcasterId: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['idle', 'live', 'ended'],
      default: 'idle',
      index: true
    },
    viewerCount: {
      type: Number,
      default: 0
    },
    startedAt: Date,
    endedAt: Date
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('StreamSession', streamSessionSchema);
