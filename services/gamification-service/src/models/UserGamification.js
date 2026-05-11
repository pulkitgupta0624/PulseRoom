const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    perkUnlocks: {
      type: [String],
      default: []
    },
    awardedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const recentActivitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['points', 'badge', 'milestone'],
      default: 'points'
    },
    actionKey: String,
    badgeKey: String,
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    points: {
      type: Number,
      default: 0
    },
    occurredAt: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { _id: false }
);

const statsSchema = new mongoose.Schema(
  {
    confirmedBookings: {
      type: Number,
      default: 0
    },
    earlyBookings: {
      type: Number,
      default: 0
    },
    attendedEvents: {
      type: Number,
      default: 0
    },
    reviewsSubmitted: {
      type: Number,
      default: 0
    },
    networkingOptIns: {
      type: Number,
      default: 0
    },
    questionsAsked: {
      type: Number,
      default: 0
    },
    topQuestions: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const userGamificationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    totalPoints: {
      type: Number,
      default: 0
    },
    lifetimePoints: {
      type: Number,
      default: 0
    },
    stats: {
      type: statsSchema,
      default: () => ({})
    },
    badges: {
      type: [badgeSchema],
      default: []
    },
    recentActivity: {
      type: [recentActivitySchema],
      default: []
    },
    lastActiveAt: Date
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('UserGamification', userGamificationSchema);
