const mongoose = require('mongoose');

const organizerReplySchema = new mongoose.Schema(
  {
    body: {
      type: String,
      required: true
    },
    authorName: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const eventReviewSchema = new mongoose.Schema(
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
    authorName: {
      type: String,
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    reviewText: {
      type: String,
      default: ''
    },
    organizerReply: {
      type: organizerReplySchema,
      default: null
    }
  },
  {
    timestamps: true
  }
);

eventReviewSchema.index({ eventId: 1, userId: 1 }, { unique: true });
eventReviewSchema.index({ eventId: 1, createdAt: -1 });

module.exports = mongoose.model('EventReview', eventReviewSchema);
