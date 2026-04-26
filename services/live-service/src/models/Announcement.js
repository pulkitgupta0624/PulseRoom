const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true
    },
    body: {
      type: String,
      required: true
    },
    createdBy: String
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Announcement', announcementSchema);

