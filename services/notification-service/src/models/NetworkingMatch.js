const mongoose = require('mongoose');

const availabilitySlotSchema = new mongoose.Schema(
  {
    startsAt: {
      type: Date,
      required: true
    },
    endsAt: {
      type: Date,
      required: true
    }
  },
  { _id: false }
);

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
    },
    networkingProfile: {
      meetingGoal: {
        type: String,
        default: ''
      },
      canHelpWith: {
        type: [String],
        default: []
      },
      lookingFor: {
        type: [String],
        default: []
      },
      availabilityNote: {
        type: String,
        default: ''
      },
      availabilitySlots: {
        type: [availabilitySlotSchema],
        default: []
      }
    }
  },
  { _id: false }
);

const participantStatusSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true
    },
    decision: {
      type: String,
      enum: ['pending', 'accepted', 'skipped'],
      default: 'pending'
    },
    decidedAt: Date
  },
  { _id: false }
);

const networkingMeetingSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['none', 'proposed', 'confirmed', 'declined', 'cancelled'],
      default: 'none'
    },
    startsAt: Date,
    endsAt: Date,
    note: {
      type: String,
      default: ''
    },
    proposedByUserId: String,
    proposedAt: Date,
    respondedByUserId: String,
    respondedAt: Date,
    confirmedAt: Date,
    declinedAt: Date,
    cancelledAt: Date,
    cancelledByUserId: String
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
    sharedIntentTags: {
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
    introMessages: {
      type: Map,
      of: String,
      default: {}
    },
    participantStatuses: {
      type: [participantStatusSchema],
      default: []
    },
    meeting: {
      type: networkingMeetingSchema,
      default: () => ({})
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
