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

const networkingPreferencesSchema = new mongoose.Schema(
  {
    optedIn: {
      type: Boolean,
      default: false
    },
    optedInAt: Date,
    lastMatchedAt: Date,
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
  },
  { _id: false }
);

const eventAudienceSchema = new mongoose.Schema(
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
    email: String,
    attendeeName: String,
    organizerId: String,
    eventTitle: String,
    eventStartsAt: Date,
    networking: {
      type: networkingPreferencesSchema,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

eventAudienceSchema.index({ eventId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('EventAudience', eventAudienceSchema);
