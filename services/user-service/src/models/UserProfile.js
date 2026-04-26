const mongoose = require('mongoose');
const { Roles } = require('@pulseroom/common');

const userProfileSchema = new mongoose.Schema(
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
      index: true,
      lowercase: true
    },
    displayName: {
      type: String,
      required: true,
      trim: true
    },
    bio: {
      type: String,
      default: ''
    },
    avatarUrl: String,
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
    verifiedOrganizer: {
      type: Boolean,
      default: false,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    interests: {
      type: [String],
      default: []
    },
    followingOrganizerIds: {
      type: [String],
      default: []
    },
    followersCount: {
      type: Number,
      default: 0
    },
    socialLinks: {
      website: String,
      linkedin: String,
      twitter: String
    },
    organizerProfile: {
      companyName: String,
      website: String,
      supportEmail: String
    },
    location: String,
    lastSeenAt: Date
  },
  {
    timestamps: true
  }
);

userProfileSchema.index({ displayName: 'text', bio: 'text', interests: 'text' });
userProfileSchema.index({ followingOrganizerIds: 1 });

module.exports = mongoose.model('UserProfile', userProfileSchema);
