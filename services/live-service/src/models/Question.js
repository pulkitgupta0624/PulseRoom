const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
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
    body: {
      type: String,
      required: true
    },
    upvotes: {
      type: Number,
      default: 0
    },
    // Tracks who already upvoted so we can prevent duplicates atomically.
    voterIds: {
      type: [String],
      default: [],
      select: false          // don't leak voter IDs to clients
    },
    answered: {
      type: Boolean,
      default: false
    },
    hidden: {
      type: Boolean,
      default: false
    },
    createdByRole: String
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Question', questionSchema);