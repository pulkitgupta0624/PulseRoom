const crypto = require('crypto');
const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  authorize,
  sendSuccess,
  validateSchema,
  DomainEvents,
  EventVisibility,
  Roles,
  decodeOptionalToken
} = require('@pulseroom/common');
const Event = require('../models/Event');
const SponsorApplication = require('../models/SponsorApplication');
const {
  sponsorPackageSchema,
  updateSponsorPackageSchema,
  sponsorApplicationSchema,
  sponsorDecisionSchema
} = require('../validators/eventSchemas');
const {
  ACTIVE_SLOT_STATUSES,
  buildSponsorApplicationLink,
  buildSponsorRecordFromApplication,
  buildSponsorRevenueSummary,
  calculateSponsorRevenueBreakdown,
  filterSponsorPackagesForViewer,
  filterSponsorsForViewer,
  syncSponsorPackageSlots
} = require('../services/sponsorService');

const router = express.Router();

const canManageEvent = (event, user) => user.role === Roles.ADMIN || event.organizerId === user.sub;

const loadEventOrThrow = async (eventId) => {
  const event = await Event.findById(eventId);
  if (!event) {
    throw new AppError('Event not found', 404, 'event_not_found');
  }

  return event;
};

const assertViewerCanAccessEvent = (event, viewer) => {
  if (event.visibility !== EventVisibility.PRIVATE) {
    return;
  }

  const canAccessPrivateEvent = viewer && (viewer.sub === event.organizerId || viewer.role === Roles.ADMIN);
  if (!canAccessPrivateEvent) {
    throw new AppError('Event not available', 403, 'event_private');
  }
};

const findPackageOrThrow = (event, packageId) => {
  syncSponsorPackageSlots(event);
  const sponsorPackage = (event.sponsorPackages || []).find((pkg) => pkg.packageId === packageId);
  if (!sponsorPackage) {
    throw new AppError('Sponsor package not found', 404, 'sponsor_package_not_found');
  }

  return sponsorPackage;
};

const buildManageResponse = async (req, event) => {
  syncSponsorPackageSlots(event);
  const applications = await SponsorApplication.find({
    eventId: event._id.toString()
  }).sort({ createdAt: -1 });

  const sponsorSummary = buildSponsorRevenueSummary(event.sponsors || []);
  const pendingApplications = applications.filter((application) => application.status === 'pending').length;

  return {
    sponsorPackages: filterSponsorPackagesForViewer(event.sponsorPackages || [], {
      viewerIsOwner: true
    }),
    sponsors: filterSponsorsForViewer(event.sponsors || [], {
      viewerIsOwner: true
    }),
    applications: applications.map((application) =>
      typeof application.toObject === 'function' ? application.toObject() : application
    ),
    totals: {
      totalApplications: applications.length,
      pendingApplications,
      activeSponsors: sponsorSummary.activeSponsors,
      sponsorRevenue: sponsorSummary.grossRevenue,
      platformFees: sponsorSummary.platformFees,
      organizerNetRevenue: sponsorSummary.organizerNetRevenue,
      boothClicks: sponsorSummary.boothClicks
    },
    applicationLink: buildSponsorApplicationLink(event._id, req.config.appOrigin)
  };
};

router.post(
  '/:eventId/sponsor-packages',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(sponsorPackageSchema),
  asyncHandler(async (req, res) => {
    const event = await loadEventOrThrow(req.params.eventId);
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    syncSponsorPackageSlots(event);

    event.sponsorPackages.push({
      packageId: `spkg_${crypto.randomBytes(4).toString('hex')}`,
      ...req.body
    });

    await event.save();
    sendSuccess(
      res,
      filterSponsorPackagesForViewer(event.sponsorPackages || [], {
        viewerIsOwner: true
      }),
      201
    );
  })
);

router.patch(
  '/:eventId/sponsor-packages/:packageId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(updateSponsorPackageSchema),
  asyncHandler(async (req, res) => {
    const event = await loadEventOrThrow(req.params.eventId);
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    syncSponsorPackageSlots(event);
    const sponsorPackage = findPackageOrThrow(event, req.params.packageId);
    const currentSlotsUsed = Number(sponsorPackage.slotsUsed || 0);

    if (
      req.body.maxSlots !== undefined &&
      Number(req.body.maxSlots) < currentSlotsUsed
    ) {
      throw new AppError(
        `This package already has ${currentSlotsUsed} approved sponsor slot(s).`,
        409,
        'sponsor_package_slots_locked'
      );
    }

    Object.assign(sponsorPackage, req.body);
    await event.save();

    sendSuccess(
      res,
      filterSponsorPackagesForViewer(event.sponsorPackages || [], {
        viewerIsOwner: true
      })
    );
  })
);

router.delete(
  '/:eventId/sponsor-packages/:packageId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const event = await loadEventOrThrow(req.params.eventId);
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    syncSponsorPackageSlots(event);
    const sponsorPackage = findPackageOrThrow(event, req.params.packageId);
    if (Number(sponsorPackage.slotsUsed || 0) > 0) {
      throw new AppError(
        'Remove or reassign the sponsors in this package before deleting it.',
        409,
        'sponsor_package_has_assignments'
      );
    }

    event.sponsorPackages = (event.sponsorPackages || []).filter(
      (pkg) => pkg.packageId !== req.params.packageId
    );
    await event.save();

    sendSuccess(res, { deleted: true });
  })
);

router.get(
  '/:eventId/sponsor-packages',
  asyncHandler(async (req, res) => {
    const viewer = decodeOptionalToken(req);
    const event = await loadEventOrThrow(req.params.eventId);
    assertViewerCanAccessEvent(event, viewer);

    const viewerIsOwner = Boolean(viewer && (viewer.role === Roles.ADMIN || viewer.sub === event.organizerId));
    syncSponsorPackageSlots(event);

    if (!viewerIsOwner && event.status !== 'published') {
      return sendSuccess(res, []);
    }

    sendSuccess(
      res,
      filterSponsorPackagesForViewer(event.sponsorPackages || [], {
        viewerIsOwner
      })
    );
  })
);

router.get(
  '/:eventId/sponsors/manage',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const event = await loadEventOrThrow(req.params.eventId);
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    sendSuccess(res, await buildManageResponse(req, event));
  })
);

router.post(
  '/:eventId/sponsors/apply',
  validateSchema(sponsorApplicationSchema),
  asyncHandler(async (req, res) => {
    const event = await loadEventOrThrow(req.params.eventId);
    if (event.visibility === EventVisibility.PRIVATE) {
      throw new AppError('Sponsor applications are unavailable for this event', 403, 'event_private');
    }
    if (event.status !== 'published') {
      throw new AppError('Sponsor applications open once the event is published', 409, 'event_not_open');
    }

    syncSponsorPackageSlots(event);
    const sponsorPackage = findPackageOrThrow(event, req.body.packageId);
    if (!sponsorPackage.isActive) {
      throw new AppError('This sponsor package is not accepting applications right now', 409, 'sponsor_package_inactive');
    }

    if (Number(sponsorPackage.slotsUsed || 0) >= Number(sponsorPackage.maxSlots || 0)) {
      throw new AppError('This sponsor package is already full', 409, 'sponsor_package_full');
    }

    const duplicateApplication = await SponsorApplication.exists({
      eventId: event._id.toString(),
      packageId: sponsorPackage.packageId,
      contactEmail: req.body.contactEmail,
      status: {
        $in: ['pending', 'approved', 'active']
      }
    });
    if (duplicateApplication) {
      throw new AppError(
        'There is already an active sponsor application for this contact and package.',
        409,
        'sponsor_application_exists'
      );
    }

    const sponsorId = `sponsor_${crypto.randomBytes(6).toString('hex')}`;
    const payout = calculateSponsorRevenueBreakdown({
      price: sponsorPackage.price,
      platformFeePercent: req.config.sponsorPlatformFeePercent
    });

    const application = await SponsorApplication.create({
      sponsorId,
      eventId: event._id.toString(),
      organizerId: event.organizerId,
      eventTitle: event.title,
      packageId: sponsorPackage.packageId,
      packageName: sponsorPackage.name,
      tier: sponsorPackage.tier,
      price: sponsorPackage.price,
      currency: sponsorPackage.currency,
      companyName: req.body.companyName,
      logoUrl: req.body.logoUrl,
      description: req.body.description,
      boothUrl: req.body.boothUrl,
      websiteUrl: req.body.websiteUrl,
      contactName: req.body.contactName,
      contactEmail: req.body.contactEmail,
      notes: req.body.notes,
      showOnEventPage:
        req.body.showOnEventPage ?? sponsorPackage.showOnEventPage ?? true,
      showInLiveRoom:
        req.body.showInLiveRoom ?? sponsorPackage.showInLiveRoom ?? true,
      showInEmails:
        req.body.showInEmails ?? sponsorPackage.showInEmails ?? false,
      featuredCallout:
        req.body.featuredCallout ?? sponsorPackage.featuredCallout ?? false,
      payout
    });

    await req.eventBus.publish(DomainEvents.SPONSOR_APPLICATION_SUBMITTED, {
      sponsorId,
      eventId: event._id.toString(),
      eventTitle: event.title,
      organizerId: event.organizerId,
      packageName: sponsorPackage.name,
      companyName: application.companyName,
      contactName: application.contactName,
      contactEmail: application.contactEmail
    });

    sendSuccess(
      res,
      {
        sponsorId,
        applicationId: application._id,
        status: application.status,
        paymentStatus: application.paymentStatus
      },
      201
    );
  })
);

router.post(
  '/:eventId/sponsors/:sponsorId/click',
  asyncHandler(async (req, res) => {
    const viewer = decodeOptionalToken(req);
    const event = await loadEventOrThrow(req.params.eventId);
    assertViewerCanAccessEvent(event, viewer);

    const sponsor = (event.sponsors || []).find(
      (item) =>
        item.sponsorId === req.params.sponsorId &&
        item.status === 'active' &&
        item.paymentStatus === 'paid'
    );
    if (!sponsor) {
      throw new AppError('Sponsor not found', 404, 'sponsor_not_found');
    }

    await Event.updateOne(
      {
        _id: event._id,
        'sponsors.sponsorId': req.params.sponsorId
      },
      {
        $inc: {
          'sponsors.$.metrics.boothClicks': 1
        }
      }
    );

    sendSuccess(res, { tracked: true });
  })
);

router.patch(
  '/:eventId/sponsors/:sponsorId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  validateSchema(sponsorDecisionSchema),
  asyncHandler(async (req, res) => {
    const event = await loadEventOrThrow(req.params.eventId);
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    syncSponsorPackageSlots(event);

    const application = await SponsorApplication.findOne({
      eventId: event._id.toString(),
      sponsorId: req.params.sponsorId
    });
    if (!application) {
      throw new AppError('Sponsor application not found', 404, 'sponsor_application_not_found');
    }

    const sponsorPackage = findPackageOrThrow(event, application.packageId);
    const existingSponsor = (event.sponsors || []).find(
      (item) => item.sponsorId === req.params.sponsorId
    );
    const previousStatus = application.status;
    const nextStatus = req.body.status;
    const nextPaymentStatus =
      req.body.paymentStatus ||
      (nextStatus === 'active' ? 'paid' : application.paymentStatus);

    if (
      !existingSponsor &&
      ACTIVE_SLOT_STATUSES.has(nextStatus) &&
      Number(sponsorPackage.slotsUsed || 0) >= Number(sponsorPackage.maxSlots || 0)
    ) {
      throw new AppError('This sponsor package is already full', 409, 'sponsor_package_full');
    }

    application.companyName = req.body.companyName ?? application.companyName;
    application.logoUrl = req.body.logoUrl ?? application.logoUrl;
    application.description = req.body.description ?? application.description;
    application.boothUrl = req.body.boothUrl ?? application.boothUrl;
    application.websiteUrl = req.body.websiteUrl ?? application.websiteUrl;
    application.contactName = req.body.contactName ?? application.contactName;
    application.contactEmail = req.body.contactEmail ?? application.contactEmail;
    application.showOnEventPage = req.body.showOnEventPage ?? application.showOnEventPage;
    application.showInLiveRoom = req.body.showInLiveRoom ?? application.showInLiveRoom;
    application.showInEmails = req.body.showInEmails ?? application.showInEmails;
    application.featuredCallout = req.body.featuredCallout ?? application.featuredCallout;
    application.status = nextStatus;
    application.paymentStatus = nextPaymentStatus;
    application.paymentId = req.body.paymentId ?? application.paymentId;

    if (nextStatus === 'approved' || nextStatus === 'active') {
      application.approvedAt = application.approvedAt || new Date();
      application.approvedBy = req.user.sub;
    }
    if (nextStatus === 'active') {
      application.activatedAt = application.activatedAt || new Date();
    }
    if (nextStatus === 'rejected') {
      application.rejectedAt = new Date();
      application.rejectedBy = req.user.sub;
    }

    if (ACTIVE_SLOT_STATUSES.has(nextStatus)) {
      const nextSponsorRecord = buildSponsorRecordFromApplication({
        application,
        sponsorPackage,
        existingSponsor,
        overrides: {
          ...req.body,
          status: nextStatus,
          paymentStatus: nextPaymentStatus,
          approvedAt: application.approvedAt,
          activatedAt: application.activatedAt
        },
        platformFeePercent: req.config.sponsorPlatformFeePercent
      });

      if (existingSponsor) {
        event.sponsors = (event.sponsors || []).map((item) =>
          item.sponsorId === req.params.sponsorId ? nextSponsorRecord : item
        );
      } else {
        event.sponsors.push(nextSponsorRecord);
      }
    }

    if (nextStatus === 'rejected') {
      event.sponsors = (event.sponsors || []).filter(
        (item) => item.sponsorId !== req.params.sponsorId
      );
    }

    syncSponsorPackageSlots(event);
    await Promise.all([event.save(), application.save()]);

    if (nextStatus === 'active' && previousStatus !== 'active') {
    await req.eventBus.publish(DomainEvents.SPONSOR_ACTIVATED, {
      sponsorId: application.sponsorId,
      eventId: application.eventId,
      eventTitle: application.eventTitle,
      organizerId: application.organizerId,
      packageName: application.packageName,
      amount: application.price,
      currency: application.currency,
      companyName: application.companyName,
      contactName: application.contactName,
      contactEmail: application.contactEmail
    });
  } else if (nextStatus === 'approved' && previousStatus !== 'approved') {
    await req.eventBus.publish(DomainEvents.SPONSOR_APPLICATION_APPROVED, {
      sponsorId: application.sponsorId,
      eventId: application.eventId,
      eventTitle: application.eventTitle,
      organizerId: application.organizerId,
      packageName: application.packageName,
      amount: application.price,
      currency: application.currency,
      paymentLinkUrl: sponsorPackage.paymentLinkUrl,
      paymentInstructions: sponsorPackage.paymentInstructions,
      companyName: application.companyName,
      contactName: application.contactName,
      contactEmail: application.contactEmail
    });
    } else if (nextStatus === 'rejected' && previousStatus !== 'rejected') {
      await req.eventBus.publish(DomainEvents.SPONSOR_APPLICATION_REJECTED, {
        sponsorId: application.sponsorId,
        eventId: application.eventId,
        eventTitle: application.eventTitle,
        organizerId: application.organizerId,
        packageName: application.packageName,
        companyName: application.companyName,
        contactName: application.contactName,
        contactEmail: application.contactEmail
      });
    }

    sendSuccess(res, await buildManageResponse(req, event));
  })
);

router.delete(
  '/:eventId/sponsors/:sponsorId',
  authenticate(),
  authorize(Roles.ORGANIZER, Roles.ADMIN),
  asyncHandler(async (req, res) => {
    const event = await loadEventOrThrow(req.params.eventId);
    if (!canManageEvent(event, req.user)) {
      throw new AppError('Forbidden', 403, 'forbidden');
    }

    const application = await SponsorApplication.findOne({
      eventId: event._id.toString(),
      sponsorId: req.params.sponsorId
    });

    const sponsorExists = (event.sponsors || []).some(
      (item) => item.sponsorId === req.params.sponsorId
    );
    if (!application && !sponsorExists) {
      throw new AppError('Sponsor not found', 404, 'sponsor_not_found');
    }

    event.sponsors = (event.sponsors || []).filter(
      (item) => item.sponsorId !== req.params.sponsorId
    );
    syncSponsorPackageSlots(event);
    await event.save();

    if (application && application.status !== 'rejected') {
      application.status = 'rejected';
      application.rejectedAt = new Date();
      application.rejectedBy = req.user.sub;
      await application.save();
    }

    sendSuccess(res, { deleted: true });
  })
);

router.get(
  '/:eventId/sponsors',
  asyncHandler(async (req, res) => {
    const viewer = decodeOptionalToken(req);
    const event = await loadEventOrThrow(req.params.eventId);
    assertViewerCanAccessEvent(event, viewer);

    const viewerIsOwner = Boolean(viewer && (viewer.role === Roles.ADMIN || viewer.sub === event.organizerId));
    if (!viewerIsOwner && event.status !== 'published') {
      return sendSuccess(res, []);
    }

    sendSuccess(
      res,
      filterSponsorsForViewer(event.sponsors || [], {
        viewerIsOwner
      })
    );
  })
);

module.exports = router;
