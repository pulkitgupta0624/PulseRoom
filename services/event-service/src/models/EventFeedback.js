const mongoose = require('mongoose');

const sessionFeedbackSchema = new mongoose.Schema(
  {
    sessionKey: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    startsAt: Date,
    roomLabel: String,
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      default: ''
    }
  },
  { _id: false }
);

const eventFeedbackSchema = new mongoose.Schema(
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
    userId: {
      type: String,
      required: true,
      index: true
    },
    attendeeName: {
      type: String,
      required: true
    },
    attendeeEmail: {
      type: String,
      default: '',
      index: true
    },
    overallRating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    npsScore: {
      type: Number,
      required: true,
      min: 0,
      max: 10
    },
    attendAgain: {
      type: Boolean,
      default: true
    },
    highlightText: {
      type: String,
      default: ''
    },
    improvementText: {
      type: String,
      default: ''
    },
    sessionFeedback: {
      type: [sessionFeedbackSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

eventFeedbackSchema.index({ eventId: 1, userId: 1 }, { unique: true });
eventFeedbackSchema.index({ eventId: 1, createdAt: -1 });
eventFeedbackSchema.index({ organizerId: 1, createdAt: -1 });

module.exports = mongoose.model('EventFeedback', eventFeedbackSchema);
