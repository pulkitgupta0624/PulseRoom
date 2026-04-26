const mongoose = require('mongoose');
const { Roles } = require('@pulseroom/common');

const userCredentialSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: Object.values(Roles),
      default: Roles.ATTENDEE,
      index: true
    },
    permissions: {
      type: [String],
      default: []
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    oauthProviders: {
      googleId: {
        type: String
      }
    },
    lastLoginAt: Date
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('UserCredential', userCredentialSchema);

