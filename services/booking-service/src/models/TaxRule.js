const mongoose = require('mongoose');

const taxRuleSchema = new mongoose.Schema(
  {
    country: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    label: {
      type: String,
      required: true,
      trim: true
    },
    rate: {
      type: Number,
      required: true,
      min: 0
    },
    registrationNumber: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('TaxRule', taxRuleSchema);
