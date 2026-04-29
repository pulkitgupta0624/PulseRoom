const mongoose = require('mongoose');
const { Roles } = require('@pulseroom/common');

const encryptedSecretSchema = new mongoose.Schema(
  {
    iv: String,
    content: String,
    tag: String
  },
  { _id: false }
);

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
    twoFactor: {
      enabled: {
        type: Boolean,
        default: false
      },
      secret: encryptedSecretSchema,
      backupCodeHashes: {
        type: [String],
        default: []
      },
      enabledAt: Date,
      lastUsedAt: Date,
      pendingSecret: encryptedSecretSchema,
      pendingBackupCodeHashes: {
        type: [String],
        default: []
      },
      pendingSetupAt: Date,
      loginFailedAttempts: {
        type: Number,
        default: 0
      },
      loginLockedUntil: Date
    },
    lastLoginAt: Date
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('UserCredential', userCredentialSchema);
