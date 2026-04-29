const mongoose = require('mongoose');

const webhookEndpointSchema = new mongoose.Schema(
  {
    organizerId: {
      type: String,
      required: true,
      index: true
    },
    eventId: {
      type: String,
      required: true,
      index: true
    },
    targetUrl: {
      type: String,
      required: true
    },
    subscribedEvents: {
      type: [String],
      default: []
    },
    signingSecret: {
      type: String,
      required: true
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    deliveredCount: {
      type: Number,
      default: 0
    },
    failedCount: {
      type: Number,
      default: 0
    },
    lastDeliveredAt: Date,
    lastDeliveryStatusCode: Number,
    lastFailureAt: Date,
    lastFailureMessage: String
  },
  {
    timestamps: true
  }
);

webhookEndpointSchema.index({ eventId: 1, active: 1 });

module.exports = mongoose.model('WebhookEndpoint', webhookEndpointSchema);
