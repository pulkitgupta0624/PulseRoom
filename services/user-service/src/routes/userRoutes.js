const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  authorize,
  decodeOptionalToken,
  sendSuccess,
  validateSchema,
  DomainEvents,
  Roles
} = require('@pulseroom/common');
const UserProfile = require('../models/UserProfile');
const OrganizerVerificationRequest = require('../models/OrganizerVerificationRequest');
const { getPermissionsForRole } = require('../services/permissions');
const {
  updateProfileSchema,
  updateRoleSchema,
  organizerVerificationSchema,
  reviewVerificationSchema
} = require('../validators/userSchemas');

const router = express.Router();

const FOLLOWABLE_ROLES = new Set([Roles.ORGANIZER, Roles.ADMIN]);
const PUBLIC_PROFILE_FIELDS = [
  'userId',
  'displayName',
  'avatarUrl',
  'bio',
  'role',
  'verifiedOrganizer',
  'interests',
  'socialLinks',
  'location',
  'organizerProfile',
  'followersCount'
].join(' ');

const isFollowableOrganizer = (profile) =>
  Boolean(profile && profile.isActive && FOLLOWABLE_ROLES.has(profile.role));

const getFollowState = async ({ viewerId, organizerId }) => {
  if (!viewerId || !organizerId || viewerId === organizerId) {
    return false;
  }

  const viewerProfile = await UserProfile.findOne({ userId: viewerId })
    .select('followingOrganizerIds')
    .lean();

  return Boolean(viewerProfile?.followingOrganizerIds?.includes(organizerId));
};

const getOrganizerProfileOrThrow = async (organizerId) => {
  const organizerProfile = await UserProfile.findOne({
    userId: organizerId,
    isActive: true
  });

  if (!isFollowableOrganizer(organizerProfile)) {
    throw new AppError('Organizer not found', 404, 'organizer_not_found');
  }

  return organizerProfile;
};

// ── GET /me ───────────────────────────────────────────────────────────────────
router.get(
  '/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    const profile = await UserProfile.findOne({ userId: req.user.sub });
    if (!profile) {
      throw new AppError('Profile not found', 404, 'profile_not_found');
    }
    sendSuccess(res, profile);
  })
);

// ── GET /me/following ─────────────────────────────────────────────────────────
// Returns the full public profiles of every organizer the current user follows.
// Used by ProfilePage "Following" tab and OrganizerProfilePage.
router.get(
  '/me/following',
  authenticate(),
  asyncHandler(async (req, res) => {
    // 1. Load only the IDs array — avoids fetching the entire profile document
    const myProfile = await UserProfile.findOne({ userId: req.user.sub })
      .select('followingOrganizerIds')
      .lean();

    if (!myProfile?.followingOrganizerIds?.length) {
      return sendSuccess(res, []);
    }

    // 2. Batch-resolve all followed organizer profiles in a single query
    const organizers = await UserProfile.find({
      userId: { $in: myProfile.followingOrganizerIds },
      isActive: true
    })
      .select(PUBLIC_PROFILE_FIELDS)
      .lean();

    // 3. Attach follow-state flags consumed by the frontend so it doesn't need
    //    extra round trips to determine button state
    sendSuccess(
      res,
      organizers.map((org) => ({
        ...org,
        followersCount: org.followersCount || 0,
        isFollowingOrganizer: true,
        canFollowOrganizer: true
      }))
    );
  })
);

// ── GET /search ───────────────────────────────────────────────────────────────
router.get(
  '/search',
  authenticate(),
  asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 2) {
      return sendSuccess(res, []);
    }

    const users = await UserProfile.find({
      $or: [
        { displayName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ],
      isActive: true,
      userId: { $ne: req.user.sub }
    })
      .select('userId displayName avatarUrl role email')
      .limit(10)
      .lean();

    sendSuccess(res, users);
  })
);

// ── PATCH /me ─────────────────────────────────────────────────────────────────
router.patch(
  '/me',
  authenticate(),
  validateSchema(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const profile = await UserProfile.findOneAndUpdate(
      { userId: req.user.sub },
      { $set: req.body, lastSeenAt: new Date() },
      { new: true }
    );

    if (!profile) {
      throw new AppError('Profile not found', 404, 'profile_not_found');
    }

    await req.eventBus.publish(DomainEvents.USER_UPDATED, {
      userId: profile.userId,
      role: profile.role,
      permissions: profile.permissions,
      isActive: profile.isActive
    });

    sendSuccess(res, profile);
  })
);

// ── GET /recommendation-context/:userId ───────────────────────────────────────
router.get(
  '/recommendation-context/:userId',
  asyncHandler(async (req, res) => {
    const profile = await UserProfile.findOne({ userId: req.params.userId })
      .select('userId interests role verifiedOrganizer displayName avatarUrl')
      .lean();

    if (!profile) {
      throw new AppError('Profile not found', 404, 'profile_not_found');
    }

    sendSuccess(res, {
      userId: profile.userId,
      interests: profile.interests || [],
      role: profile.role,
      verifiedOrganizer: profile.verifiedOrganizer
    });
  })
);

// ── GET /organizers/:organizerId/followers ────────────────────────────────────
router.get(
  '/organizers/:organizerId/followers',
  asyncHandler(async (req, res) => {
    if (req.headers['x-service-name'] !== 'notification-service') {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    const organizerProfile = await getOrganizerProfileOrThrow(req.params.organizerId);

    const followers = await UserProfile.find({
      followingOrganizerIds: req.params.organizerId,
      isActive: true
    })
      .select('userId email displayName')
      .lean();

    sendSuccess(res, {
      organizer: {
        userId: organizerProfile.userId,
        displayName: organizerProfile.displayName,
        avatarUrl: organizerProfile.avatarUrl,
        followersCount: organizerProfile.followersCount || 0,
        organizerProfile: organizerProfile.organizerProfile || {}
      },
      followers
    });
  })
);

// ── POST /organizers/:organizerId/follow ──────────────────────────────────────
router.post(
  '/organizers/:organizerId/follow',
  authenticate(),
  asyncHandler(async (req, res) => {
    const organizerId = req.params.organizerId;
    if (organizerId === req.user.sub) {
      throw new AppError('You cannot follow yourself', 409, 'cannot_follow_self');
    }

    const [viewerProfile, organizerProfile] = await Promise.all([
      UserProfile.findOne({ userId: req.user.sub }).select('userId'),
      getOrganizerProfileOrThrow(organizerId)
    ]);

    if (!viewerProfile) {
      throw new AppError('Profile not found', 404, 'profile_not_found');
    }

    const updateResult = await UserProfile.updateOne(
      {
        userId: req.user.sub,
        followingOrganizerIds: { $ne: organizerId }
      },
      {
        $addToSet: {
          followingOrganizerIds: organizerId
        }
      }
    );

    let followersCount = organizerProfile.followersCount || 0;
    if (updateResult.modifiedCount > 0) {
      followersCount += 1;
      await UserProfile.updateOne(
        { userId: organizerId },
        {
          $inc: { followersCount: 1 }
        }
      );
    }

    sendSuccess(res, {
      organizerId,
      isFollowing: true,
      followersCount
    });
  })
);

// ── DELETE /organizers/:organizerId/follow ────────────────────────────────────
router.delete(
  '/organizers/:organizerId/follow',
  authenticate(),
  asyncHandler(async (req, res) => {
    const organizerId = req.params.organizerId;
    if (organizerId === req.user.sub) {
      throw new AppError('You cannot unfollow yourself', 409, 'cannot_unfollow_self');
    }

    const [viewerProfile, organizerProfile] = await Promise.all([
      UserProfile.findOne({ userId: req.user.sub }).select('userId'),
      getOrganizerProfileOrThrow(organizerId)
    ]);

    if (!viewerProfile) {
      throw new AppError('Profile not found', 404, 'profile_not_found');
    }

    const updateResult = await UserProfile.updateOne(
      {
        userId: req.user.sub,
        followingOrganizerIds: organizerId
      },
      {
        $pull: {
          followingOrganizerIds: organizerId
        }
      }
    );

    let followersCount = organizerProfile.followersCount || 0;
    if (updateResult.modifiedCount > 0) {
      followersCount = Math.max(0, followersCount - 1);
      await UserProfile.updateOne(
        {
          userId: organizerId,
          followersCount: { $gt: 0 }
        },
        {
          $inc: { followersCount: -1 }
        }
      );
    }

    sendSuccess(res, {
      organizerId,
      isFollowing: false,
      followersCount
    });
  })
);

// ── GET /profile/:userId ──────────────────────────────────────────────────────
router.get(
  '/profile/:userId',
  asyncHandler(async (req, res) => {
    const profile = await UserProfile.findOne({
      userId: req.params.userId,
      isActive: true
    })
      .select(PUBLIC_PROFILE_FIELDS)
      .lean();

    if (!profile) {
      throw new AppError('User not found', 404, 'user_not_found');
    }

    const viewer = decodeOptionalToken(req);
    const canFollowOrganizer = isFollowableOrganizer(profile) && viewer?.sub !== profile.userId;
    const isFollowingOrganizer = canFollowOrganizer
      ? await getFollowState({
          viewerId: viewer?.sub,
          organizerId: profile.userId
        })
      : false;

    sendSuccess(res, {
      ...profile,
      followersCount: profile.followersCount || 0,
      canFollowOrganizer,
      isFollowingOrganizer
    });
  })
);

// ── GET / (admin: list all users) ─────────────────────────────────────────────
router.get(
  '/',
  authenticate(),
  authorize(Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const filters = {};

    if (req.query.role) {
      filters.role = req.query.role;
    }

    if (req.query.q && req.query.q.trim().length >= 2) {
      const q = req.query.q.trim();
      filters.$or = [
        { displayName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ];
    }

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 50)));

    const users = await UserProfile.find(filters)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    sendSuccess(res, users);
  })
);

// ── PATCH /:userId/role (admin) ───────────────────────────────────────────────
router.patch(
  '/:userId/role',
  authenticate(),
  authorize(Roles.ADMIN),
  validateSchema(updateRoleSchema),
  asyncHandler(async (req, res) => {
    const permissions = getPermissionsForRole(req.body.role);
    const profile = await UserProfile.findOneAndUpdate(
      { userId: req.params.userId },
      { role: req.body.role, permissions, isActive: req.body.isActive },
      { new: true }
    );

    if (!profile) {
      throw new AppError('Profile not found', 404, 'profile_not_found');
    }

    await req.eventBus.publish(DomainEvents.USER_UPDATED, {
      userId: profile.userId,
      role: profile.role,
      permissions: profile.permissions,
      isActive: profile.isActive
    });

    sendSuccess(res, profile);
  })
);

// ── POST /organizer-verifications ─────────────────────────────────────────────
router.post(
  '/organizer-verifications',
  authenticate(),
  validateSchema(organizerVerificationSchema),
  asyncHandler(async (req, res) => {
    const existingPending = await OrganizerVerificationRequest.findOne({
      userId: req.user.sub,
      status: 'pending'
    });

    if (existingPending) {
      throw new AppError('An organizer verification request is already pending', 409, 'verification_pending');
    }

    const request = await OrganizerVerificationRequest.create({
      userId: req.user.sub,
      ...req.body
    });

    await req.eventBus.publish(DomainEvents.ORGANIZER_VERIFICATION_REQUESTED, {
      userId: req.user.sub,
      requestId: request._id.toString()
    });

    sendSuccess(res, request, 201);
  })
);

// ── GET /organizer-verifications (admin) ──────────────────────────────────────
router.get(
  '/organizer-verifications',
  authenticate(),
  authorize(Roles.ADMIN),
  asyncHandler(async (_req, res) => {
    const requests = await OrganizerVerificationRequest.find().sort({ createdAt: -1 });
    sendSuccess(res, requests);
  })
);

// ── PATCH /organizer-verifications/:requestId (admin) ────────────────────────
router.patch(
  '/organizer-verifications/:requestId',
  authenticate(),
  authorize(Roles.ADMIN),
  validateSchema(reviewVerificationSchema),
  asyncHandler(async (req, res) => {
    const request = await OrganizerVerificationRequest.findById(req.params.requestId);
    if (!request) {
      throw new AppError('Verification request not found', 404, 'verification_not_found');
    }

    request.status = req.body.status;
    request.notes = req.body.notes;
    request.reviewedBy = req.user.sub;
    request.reviewedAt = new Date();
    await request.save();

    if (request.status === 'approved') {
      const profile = await UserProfile.findOneAndUpdate(
        { userId: request.userId },
        {
          verifiedOrganizer: true,
          role: Roles.ORGANIZER,
          permissions: getPermissionsForRole(Roles.ORGANIZER)
        },
        { new: true }
      );

      await req.eventBus.publish(DomainEvents.ORGANIZER_VERIFIED, {
        userId: request.userId,
        role: Roles.ORGANIZER
      });

      await req.eventBus.publish(DomainEvents.USER_UPDATED, {
        userId: request.userId,
        role: Roles.ORGANIZER,
        permissions: profile.permissions,
        isActive: profile.isActive
      });
    }

    sendSuccess(res, request);
  })
);

module.exports = router;