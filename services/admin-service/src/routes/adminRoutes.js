const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  authorize,
  sendSuccess,
  validateSchema,
  Roles
} = require('@pulseroom/common');
const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const ModerationReport = require('../models/ModerationReport');
const BanRecord = require('../models/BanRecord');
const { reportSchema, reviewReportSchema, banSchema, moderateEventSchema } = require('../validators/adminSchemas');

const router = express.Router();

router.get(
  '/dashboard',
  authenticate(),
  authorize(Roles.ADMIN),
  asyncHandler(async (_req, res) => {
    const snapshot = await AnalyticsSnapshot.findOne({ scope: 'global' }).lean();
    const recentReports = await ModerationReport.find().sort({ createdAt: -1 }).limit(10).lean();
    const activeBans = await BanRecord.find({ active: true }).sort({ createdAt: -1 }).limit(10).lean();

    sendSuccess(res, {
      snapshot,
      recentReports,
      activeBans
    });
  })
);

router.post(
  '/reports',
  authenticate(),
  validateSchema(reportSchema),
  asyncHandler(async (req, res) => {
    const report = await ModerationReport.create({
      ...req.body,
      reporterId: req.user.sub
    });

    sendSuccess(res, report, 201);
  })
);

router.get(
  '/reports',
  authenticate(),
  authorize(Roles.ADMIN),
  asyncHandler(async (_req, res) => {
    const reports = await ModerationReport.find().sort({ createdAt: -1 });
    sendSuccess(res, reports);
  })
);

router.patch(
  '/reports/:reportId',
  authenticate(),
  authorize(Roles.ADMIN),
  validateSchema(reviewReportSchema),
  asyncHandler(async (req, res) => {
    const report = await ModerationReport.findByIdAndUpdate(
      req.params.reportId,
      req.body,
      {
        new: true
      }
    );

    if (!report) {
      throw new AppError('Report not found', 404, 'report_not_found');
    }

    sendSuccess(res, report);
  })
);

router.post(
  '/users/:userId/ban',
  authenticate(),
  authorize(Roles.ADMIN),
  validateSchema(banSchema),
  asyncHandler(async (req, res) => {
    const profileResponse = await req.clients.userService.get(`/api/users/recommendation-context/${req.params.userId}`, {
      headers: {
        Authorization: req.headers.authorization
      }
    });
    const profile = profileResponse.data.data;

    await req.clients.userService.patch(
      `/api/users/${req.params.userId}/role`,
      {
        role: profile.role,
        isActive: false
      },
      {
        headers: {
          Authorization: req.headers.authorization
        }
      }
    );

    const ban = await BanRecord.create({
      userId: req.params.userId,
      reason: req.body.reason,
      expiresAt: req.body.expiresAt,
      createdBy: req.user.sub
    });

    sendSuccess(res, ban, 201);
  })
);

router.post(
  '/events/:eventId/moderate',
  authenticate(),
  authorize(Roles.ADMIN),
  validateSchema(moderateEventSchema),
  asyncHandler(async (req, res) => {
    const payload =
      req.body.action === 'feature'
        ? { featured: true }
        : req.body.action === 'restore'
          ? { status: 'published' }
          : { status: 'cancelled' };

    const endpoint =
      req.body.action === 'feature'
        ? `/api/events/${req.params.eventId}`
        : `/api/events/${req.params.eventId}/status`;

    const response =
      req.body.action === 'feature'
        ? await req.clients.eventService.patch(endpoint, payload, {
            headers: {
              Authorization: req.headers.authorization
            }
          })
        : await req.clients.eventService.post(endpoint, payload, {
            headers: {
              Authorization: req.headers.authorization
            }
          });

    sendSuccess(res, response.data.data);
  })
);

module.exports = router;

