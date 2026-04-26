const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    votes: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const responseSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true
    },
    optionId: {
      type: String,
      required: true
    }
  },
  { _id: false }
);

const pollSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true
    },
    question: {
      type: String,
      required: true
    },
    options: {
      type: [optionSchema],
      default: []
    },
    responses: {
      type: [responseSchema],
      default: []
    },
    status: {
      type: String,
      enum: ['draft', 'live', 'closed'],
      default: 'live'
    },
    createdBy: String
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Poll', pollSchema);

