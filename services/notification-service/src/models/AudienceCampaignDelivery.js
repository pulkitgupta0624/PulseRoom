const mongoose = require('mongoose');

const audienceCampaignDeliverySchema = new mongoose.Schema(
  {
    campaignId: {
      type: String,
      required: true,
      index: true
    },
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
    userId: {
      type: String,
      required: true,
      index: true
    },
    email: String,
    channel: {
      type: String,
      enum: ['in_app', 'email'],
      required: true,
      index: true
    },
    notificationId: String,
    trackingToken: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    ctaUrl: String,
    deliveredAt: Date,
    openedAt: Date,
    clickedAt: Date,
    failedAt: Date,
    failureReason: String
  },
  {
    timestamps: true
  }
);

audienceCampaignDeliverySchema.index({ campaignId: 1, channel: 1, createdAt: -1 });
audienceCampaignDeliverySchema.index({ userId: 1, eventId: 1, createdAt: -1 });

module.exports = mongoose.model('AudienceCampaignDelivery', audienceCampaignDeliverySchema);
