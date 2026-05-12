const mongoose = require('mongoose');

const sponsorLeadSchema = new mongoose.Schema(
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
    sponsorId: {
      type: String,
      required: true,
      index: true
    },
    sponsorCompanyName: {
      type: String,
      required: true
    },
    eventTitle: {
      type: String,
      required: true
    },
    attendeeUserId: {
      type: String,
      default: ''
    },
    fullName: {
      type: String,
      required: true
    },
    workEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    companyName: {
      type: String,
      default: ''
    },
    roleTitle: {
      type: String,
      default: ''
    },
    interestType: {
      type: String,
      enum: ['demo', 'pricing', 'partnership', 'content', 'general'],
      default: 'general'
    },
    message: {
      type: String,
      default: ''
    },
    source: {
      type: String,
      enum: ['booth_page'],
      default: 'booth_page'
    }
  },
  {
    timestamps: true
  }
);

sponsorLeadSchema.index({ eventId: 1, sponsorId: 1, createdAt: -1 });
sponsorLeadSchema.index({ sponsorId: 1, createdAt: -1 });

module.exports = mongoose.model('SponsorLead', sponsorLeadSchema);
