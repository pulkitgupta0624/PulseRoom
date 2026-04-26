const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  authorize,
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

// ── My profile ────────────────────────────────────────────────────────────────
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

// ── User search (authenticated, used by MessagesPage etc.) ────────────────────
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

// ── Update my profile ─────────────────────────────────────────────────────────
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

// ── Recommendation context (internal service-to-service, no PII leak) ─────────
// Returns only the fields needed for recommendation scoring.
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

// ── Public profile by userId ──────────────────────────────────────────────────
// Used by MessagesPage, EventDetailPage speaker links, etc.
router.get(
  '/profile/:userId',
  asyncHandler(async (req, res) => {
    const profile = await UserProfile.findOne({ userId: req.params.userId, isActive: true })
      .select('userId displayName avatarUrl bio role verifiedOrganizer interests socialLinks location organizerProfile')
      .lean();

    if (!profile) {
      throw new AppError('User not found', 404, 'user_not_found');
    }

    sendSuccess(res, profile);
  })
);

// ── Admin: list / search all users ───────────────────────────────────────────
// FIX: was using $text which doesn't index email. Now uses $or regex so admins
// can search by name OR email reliably.
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

    const [users, total] = await Promise.all([
      UserProfile.find(filters)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      UserProfile.countDocuments(filters)
    ]);

    sendSuccess(res, users);
  })
);

// ── Admin: update user role / active status ───────────────────────────────────
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

// ── Organizer verification flow ───────────────────────────────────────────────
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

router.get(
  '/organizer-verifications',
  authenticate(),
  authorize(Roles.ADMIN),
  asyncHandler(async (_req, res) => {
    const requests = await OrganizerVerificationRequest.find().sort({ createdAt: -1 });
    sendSuccess(res, requests);
  })
);

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