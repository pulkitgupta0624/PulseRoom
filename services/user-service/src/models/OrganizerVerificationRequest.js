const mongoose = require('mongoose');

const organizerVerificationRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    legalName: {
      type: String,
      required: true
    },
    companyName: {
      type: String,
      required: true
    },
    website: String,
    supportEmail: String,
    documentUrls: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true
    },
    reviewedBy: String,
    reviewedAt: Date,
    notes: String
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('OrganizerVerificationRequest', organizerVerificationRequestSchema);

