const mongoose = require('mongoose');

const moderationReportSchema = new mongoose.Schema(
  {
    reportType: {
      type: String,
      enum: ['user', 'event', 'message'],
      required: true,
      index: true
    },
    targetId: {
      type: String,
      required: true,
      index: true
    },
    reporterId: {
      type: String,
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved'],
      default: 'open'
    },
    resolutionNotes: String
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('ModerationReport', moderationReportSchema);

