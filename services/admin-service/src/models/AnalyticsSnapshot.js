const mongoose = require('mongoose');

const analyticsSnapshotSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      required: true,
      unique: true
    },
    metrics: {
      users: { type: Number, default: 0 },
      organizers: { type: Number, default: 0 },
      eventsCreated: { type: Number, default: 0 },
      eventsPublished: { type: Number, default: 0 },
      bookingsConfirmed: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      chatMessages: { type: Number, default: 0 },
      liveInteractions: { type: Number, default: 0 }
    },
    lastEventAt: Date
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('AnalyticsSnapshot', analyticsSnapshotSchema);

