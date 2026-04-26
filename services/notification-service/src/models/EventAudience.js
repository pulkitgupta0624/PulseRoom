const mongoose = require('mongoose');

const eventAudienceSchema = new mongoose.Schema(
  {
    eventId: {
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
    attendeeName: String,
    organizerId: String,
    eventTitle: String,
    eventStartsAt: Date
  },
  {
    timestamps: true
  }
);

eventAudienceSchema.index({ eventId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('EventAudience', eventAudienceSchema);
