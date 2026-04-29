const mongoose = require('mongoose');

const participantSnapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true
    },
    displayName: String,
    email: String,
    avatarUrl: String,
    location: String,
    role: String,
    interests: {
      type: [String],
      default: []
    }
  },
  { _id: false }
);

const networkingMatchSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true
    },
    organizerId: {
      type: String,
      required: true,
      index: true
    },
    pairKey: {
      type: String,
      required: true
    },
    participantUserIds: {
      type: [String],
      required: true,
      index: true
    },
    participants: {
      type: [participantSnapshotSchema],
      default: []
    },
    sharedInterests: {
      type: [String],
      default: []
    },
    score: {
      type: Number,
      default: 0
    },
    summary: {
      type: String,
      default: ''
    },
    introEmailSentAt: Date,
    generatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

networkingMatchSchema.index({ eventId: 1, pairKey: 1 }, { unique: true });

module.exports = mongoose.model('NetworkingMatch', networkingMatchSchema);
