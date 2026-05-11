const mongoose = require('mongoose');

const recordingClipSchema = new mongoose.Schema(
  {
    clipId: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    startOffsetSeconds: {
      type: Number,
      required: true,
      min: 0
    },
    endOffsetSeconds: {
      type: Number,
      required: true,
      min: 0
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: 0
    },
    playbackUrl: {
      type: String,
      required: true
    },
    createdBy: String,
    createdAt: Date,
    updatedAt: Date
  },
  { _id: false }
);

const recordingSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['idle', 'uploading', 'ready', 'failed'],
      default: 'idle'
    },
    sessionId: String,
    provider: {
      type: String,
      default: 'cloudinary'
    },
    publicId: String,
    assetId: String,
    resourceType: String,
    format: String,
    mimeType: String,
    originalUrl: String,
    playbackUrl: String,
    bytes: {
      type: Number,
      default: 0
    },
    durationSeconds: {
      type: Number,
      default: 0
    },
    uploadedChunks: {
      type: Number,
      default: 0
    },
    startedAt: Date,
    readyAt: Date,
    failedAt: Date,
    error: String,
    trim: {
      startOffsetSeconds: {
        type: Number,
        default: 0
      },
      endOffsetSeconds: Number,
      updatedAt: Date,
      updatedBy: String
    },
    clips: {
      type: [recordingClipSchema],
      default: []
    }
  },
  { _id: false }
);

const streamSessionSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    broadcasterId: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['idle', 'live', 'ended'],
      default: 'idle',
      index: true
    },
    viewerCount: {
      type: Number,
      default: 0
    },
    recordingUrl: String,
    recording: {
      type: recordingSchema,
      default: () => ({})
    },
    startedAt: Date,
    endedAt: Date
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('StreamSession', streamSessionSchema);
