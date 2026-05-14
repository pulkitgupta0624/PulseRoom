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
const SafetyIncident = require('../models/SafetyIncident');
const {
  buildSafetyIncidentSummary,
  normalizeIncidentStatus,
  serializeSafetyIncident
} = require('../services/safetyIncidentService');
const {
  reportSchema,
  reviewReportSchema,
  reviewIncidentSchema,
  banSchema,
  moderateEventSchema
} = require('../validators/adminSchemas');

const router = express.Router();

const loadEventMeta = async (req, eventId) => {
  try {
    const response = await req.clients.eventService.get(`/api/events/${eventId}/internal-meta`);
    return response.data.data;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new AppError('Event not found', 404, 'event_not_found');
    }

    throw new AppError('Unable to verify event access', 502, 'event_lookup_failed');
  }
};

const assertCanReviewIncidentScope = async (req, eventId) => {
  if (req.user.role === Roles.ADMIN) {
    return null;
  }

  if (!eventId) {
    throw new AppError('Event-scoped access is required', 403, 'forbidden');
  }

  const eventMeta = await loadEventMeta(req, eventId);

  if (req.user.role === Roles.MODERATOR) {
    return eventMeta;
  }

  if (req.user.role === Roles.ORGANIZER && eventMeta.organizerId === req.user.sub) {
    return eventMeta;
  }

  throw new AppError('Forbidden', 403, 'forbidden');
};

router.get(
  '/dashboard',
  authenticate(),
  authorize(Roles.ADMIN),
  asyncHandler(async (_req, res) => {
    const snapshot = await AnalyticsSnapshot.findOne({ scope: 'global' }).lean();
    const recentReports = await ModerationReport.find().sort({ createdAt: -1 }).limit(10).lean();
    const activeBans = await BanRecord.find({ active: true }).sort({ createdAt: -1 }).limit(10).lean();
    const recentIncidents = await SafetyIncident.find().sort({ createdAt: -1 }).limit(12).lean();

    sendSuccess(res, {
      snapshot,
      recentReports,
      activeBans,
      recentIncidents: recentIncidents.map(serializeSafetyIncident),
      safetySummary: buildSafetyIncidentSummary(recentIncidents)
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

router.get(
  '/incidents',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const eventId = String(req.query.eventId || '').trim();

    if (req.user.role !== Roles.ADMIN) {
      await assertCanReviewIncidentScope(req, eventId);
    }

    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const filter = {};

    if (eventId) {
      filter.eventId = eventId;
    }

    const normalizedStatus = normalizeIncidentStatus(req.query.status);
    if (req.query.status) {
      filter.status = normalizedStatus;
    }

    if (req.query.severity) {
      filter.severity = String(req.query.severity).trim();
    }

    const incidents = await SafetyIncident.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    sendSuccess(res, {
      incidents: incidents.map(serializeSafetyIncident),
      summary: buildSafetyIncidentSummary(incidents)
    });
  })
);

router.patch(
  '/incidents/:incidentId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.MODERATOR, Roles.ADMIN),
  validateSchema(reviewIncidentSchema),
  asyncHandler(async (req, res) => {
    const incident = await SafetyIncident.findById(req.params.incidentId);
    if (!incident) {
      throw new AppError('Incident not found', 404, 'incident_not_found');
    }

    await assertCanReviewIncidentScope(req, incident.eventId);

    incident.status = normalizeIncidentStatus(req.body.status);
    incident.resolutionNotes = String(req.body.resolutionNotes || '').trim().slice(0, 500);
    incident.resolvedBy = incident.status === 'resolved' ? req.user.sub : '';
    incident.resolvedAt = incident.status === 'resolved' ? new Date() : null;
    await incident.save();

    sendSuccess(res, serializeSafetyIncident(incident));
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
