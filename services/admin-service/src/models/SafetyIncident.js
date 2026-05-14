const mongoose = require('mongoose');

const safetyIncidentSchema = new mongoose.Schema(
  {
    incidentType: {
      type: String,
      enum: ['chat_message', 'booking'],
      required: true,
      index: true
    },
    category: {
      type: String,
      required: true,
      index: true
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true
    },
    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved'],
      default: 'open',
      index: true
    },
    sourceService: {
      type: String,
      default: ''
    },
    eventId: {
      type: String,
      index: true
    },
    organizerId: {
      type: String,
      index: true
    },
    eventTitle: {
      type: String,
      default: ''
    },
    targetId: {
      type: String,
      required: true,
      index: true
    },
    targetUserId: {
      type: String,
      index: true
    },
    summary: {
      type: String,
      required: true
    },
    detail: {
      type: String,
      default: ''
    },
    riskScore: {
      type: Number,
      default: 0
    },
    autoActions: {
      type: [String],
      default: []
    },
    evidence: {
      type: [String],
      default: []
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    detectedAt: Date,
    resolutionNotes: {
      type: String,
      default: ''
    },
    resolvedAt: Date,
    resolvedBy: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

safetyIncidentSchema.index({ eventId: 1, status: 1, createdAt: -1 });
safetyIncidentSchema.index({ severity: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('SafetyIncident', safetyIncidentSchema);
