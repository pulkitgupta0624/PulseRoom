const mongoose = require('mongoose');

const banRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    reason: {
      type: String,
      required: true
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    expiresAt: Date,
    createdBy: String
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('BanRecord', banRecordSchema);

