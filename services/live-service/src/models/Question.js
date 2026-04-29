const mongoose = require('mongoose');

const authorSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    role: {
      type: String,
      required: true
    },
    badge: String,
    isSpeaker: {
      type: Boolean,
      default: false
    },
    speakerTitle: String,
    speakerCompany: String
  },
  { _id: false }
);

const replySchema = new mongoose.Schema(
  {
    replyId: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    parentReplyId: {
      type: String,
      default: null
    },
    body: {
      type: String,
      required: true
    },
    hidden: {
      type: Boolean,
      default: false
    },
    author: {
      type: authorSchema,
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
    author: {
      type: authorSchema,
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
    createdByRole: String,
    pinnedAt: Date,
    pinnedBy: String,
    replies: {
      type: [replySchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Question', questionSchema);
