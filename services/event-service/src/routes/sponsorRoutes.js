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
const SponsorLead = require('../models/SponsorLead');
const {
  sponsorPackageSchema,
  updateSponsorPackageSchema,
  sponsorApplicationSchema,
  sponsorDecisionSchema,
  sponsorLeadSchema,
  sponsorPortalUpdateSchema,
  sponsorLeadManageSchema
} = require('../validators/eventSchemas');
const {
  ACTIVE_SLOT_STATUSES,
  buildSponsorApplicationLink,
  buildSponsorPortalLink,
  buildSponsorRecordFromApplication,
  buildSponsorRevenueSummary,
  calculateSponsorRevenueBreakdown,
  filterSponsorPackagesForViewer,
  filterSponsorsForViewer,
  generateSponsorPortalAccessToken,
  syncSponsorPackageSlots
} = require('../services/sponsorService');

const router = express.Router();
const SPONSOR_LEAD_INTEREST_OPTIONS = ['demo', 'pricing', 'partnership', 'content', 'general'];
const SPONSOR_LEAD_STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'closed'];

const canManageEvent = (event, user) => user.role === Roles.ADMIN || event.organizerId === user.sub;
const isViewerOwner = (event, viewer) =>
  Boolean(viewer && (viewer.role === Roles.ADMIN || viewer.sub === event.organizerId));

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

const findSponsorForViewerOrThrow = (event, sponsorId, { viewerIsOwner = false } = {}) => {
  const sponsor = (event.sponsors || []).find((item) => item.sponsorId === sponsorId);
  if (!sponsor) {
    throw new AppError('Sponsor not found', 404, 'sponsor_not_found');
  }

  if (viewerIsOwner) {
    return sponsor;
  }

  const isVisible =
    sponsor.status === 'active' &&
    sponsor.paymentStatus === 'paid' &&
    (sponsor.showOnEventPage || sponsor.showInLiveRoom || sponsor.showInEmails);

  if (!isVisible) {
    throw new AppError('Sponsor not found', 404, 'sponsor_not_found');
  }

  return sponsor;
};

const serializeLead = (lead, sponsorRecordsById = {}) => {
  const raw = typeof lead.toObject === 'function' ? lead.toObject() : { ...lead };
  const relatedSponsor = sponsorRecordsById[raw.sponsorId];

  return {
    leadId: raw._id?.toString?.() || raw.leadId,
    sponsorId: raw.sponsorId,
    sponsorCompanyName:
      raw.sponsorCompanyName || relatedSponsor?.companyName || 'Sponsor',
    fullName: raw.fullName,
    workEmail: raw.workEmail,
    companyName: raw.companyName || '',
    roleTitle: raw.roleTitle || '',
    interestType: raw.interestType || 'general',
    status: raw.status || 'new',
    message: raw.message || '',
    followUpNotes: raw.followUpNotes || '',
    lastContactedAt: raw.lastContactedAt || null,
    source: raw.source || 'booth_page',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  };
};

const getSponsorPortalAccessToken = (req) =>
  String(req.query.access || req.get('x-sponsor-access') || '').trim();

const ensureSponsorPortalAccessToken = async (application) => {
  if (application.portalAccessToken) {
    return application.portalAccessToken;
  }

  application.portalAccessToken = generateSponsorPortalAccessToken();
  await application.save();
  return application.portalAccessToken;
};

const buildPortalUrlForApplication = async (req, eventId, application) => {
  const accessToken = await ensureSponsorPortalAccessToken(application);
  return buildSponsorPortalLink(
    eventId,
    application.sponsorId,
    req.config.appOrigin,
    accessToken
  );
};

const loadSponsorApplicationOrThrow = async (eventId, sponsorId) => {
  const application = await SponsorApplication.findOne({
    eventId,
    sponsorId
  });

  if (!application) {
    throw new AppError('Sponsor application not found', 404, 'sponsor_application_not_found');
  }

  return application;
};

const authorizeSponsorPortalAccess = ({ req, event, application }) => {
  const viewer = decodeOptionalToken(req);
  const viewerIsOwner = Boolean(viewer && canManageEvent(event, viewer));
  if (viewerIsOwner) {
    return {
      viewer,
      viewerIsOwner
    };
  }

  const accessToken = getSponsorPortalAccessToken(req);
  if (!accessToken || !application.portalAccessToken || accessToken !== application.portalAccessToken) {
    throw new AppError('Sponsor workspace unavailable', 403, 'sponsor_portal_forbidden');
  }

  return {
    viewer,
    viewerIsOwner
  };
};

const buildLeadPipelineSummary = (leads = []) => {
  const counts = SPONSOR_LEAD_STATUS_OPTIONS.reduce((accumulator, status) => {
    accumulator[status] = 0;
    return accumulator;
  }, {});

  leads.forEach((lead) => {
    const status = SPONSOR_LEAD_STATUS_OPTIONS.includes(lead.status) ? lead.status : 'new';
    counts[status] += 1;
  });

  return {
    total: leads.length,
    counts
  };
};

const escapeCsvCell = (value = '') => {
  const normalized = value instanceof Date ? value.toISOString() : String(value ?? '');
  return `"${normalized.replace(/"/g, '""')}"`;
};

const buildSponsorLeadCsv = (leads = []) => {
  const rows = [
    [
      'leadId',
      'fullName',
      'workEmail',
      'companyName',
      'roleTitle',
      'interestType',
      'status',
      'message',
      'followUpNotes',
      'source',
      'createdAt',
      'lastContactedAt'
    ],
    ...leads.map((lead) => [
      lead.leadId,
      lead.fullName,
      lead.workEmail,
      lead.companyName,
      lead.roleTitle,
      lead.interestType,
      lead.status,
      lead.message,
      lead.followUpNotes,
      lead.source,
      lead.createdAt,
      lead.lastContactedAt || ''
    ])
  ];

  return rows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\r\n');
};

const buildDownloadFileName = (companyName = 'sponsor') =>
  `${String(companyName || 'sponsor')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sponsor'}-leads.csv`;

const buildManageResponse = async (req, event) => {
  syncSponsorPackageSlots(event);
  const eventId = event._id.toString();
  const [applications, recentLeads, leadSummaryRows] = await Promise.all([
    SponsorApplication.find({
      eventId
    }).sort({ createdAt: -1 }),
    SponsorLead.find({ eventId }).sort({ createdAt: -1 }).limit(40),
    SponsorLead.aggregate([
      { $match: { eventId } },
      {
        $group: {
          _id: '$sponsorId',
          leadsCaptured: { $sum: 1 },
          lastLeadCapturedAt: { $max: '$createdAt' }
        }
      }
    ])
  ]);

  const sponsorSummary = buildSponsorRevenueSummary(event.sponsors || []);
  const pendingApplications = applications.filter((application) => application.status === 'pending').length;
  const leadSummaryBySponsorId = leadSummaryRows.reduce((accumulator, row) => {
    accumulator[row._id] = {
      leadsCaptured: Number(row.leadsCaptured || 0),
      lastLeadCapturedAt: row.lastLeadCapturedAt || null
    };
    return accumulator;
  }, {});
  const totalLeadsCaptured = Object.values(leadSummaryBySponsorId).reduce(
    (sum, row) => sum + Number(row.leadsCaptured || 0),
    0
  );
  const sponsors = filterSponsorsForViewer(event.sponsors || [], {
    viewerIsOwner: true
  }).map((sponsor) => {
    const summary = leadSummaryBySponsorId[sponsor.sponsorId];
    return {
      ...sponsor,
      metrics: {
        boothViews: Number(sponsor.metrics?.boothViews || 0),
        boothClicks: Number(sponsor.metrics?.boothClicks || 0),
        leadsCaptured:
          summary?.leadsCaptured ?? Number(sponsor.metrics?.leadsCaptured || 0)
      },
      lastLeadCapturedAt: summary?.lastLeadCapturedAt || null
    };
  });
  const sponsorRecordsById = sponsors.reduce((accumulator, sponsor) => {
    accumulator[sponsor.sponsorId] = sponsor;
    return accumulator;
  }, {});
  const applicationsWithPortalLinks = await Promise.all(
    applications.map(async (application) => {
      const raw = typeof application.toObject === 'function' ? application.toObject() : application;
      const leadSummary = leadSummaryBySponsorId[raw.sponsorId];
      return {
        ...raw,
        leadsCaptured: Number(leadSummary?.leadsCaptured || 0),
        lastLeadCapturedAt: leadSummary?.lastLeadCapturedAt || null,
        portalLink: await buildPortalUrlForApplication(req, eventId, application)
      };
    })
  );

  return {
    sponsorPackages: filterSponsorPackagesForViewer(event.sponsorPackages || [], {
      viewerIsOwner: true
    }),
    sponsors,
    applications: applicationsWithPortalLinks,
    leads: recentLeads.map((lead) => serializeLead(lead, sponsorRecordsById)),
    totals: {
      totalApplications: applications.length,
      pendingApplications,
      activeSponsors: sponsorSummary.activeSponsors,
      sponsorRevenue: sponsorSummary.grossRevenue,
      platformFees: sponsorSummary.platformFees,
      organizerNetRevenue: sponsorSummary.organizerNetRevenue,
      boothViews: sponsorSummary.boothViews,
      boothClicks: sponsorSummary.boothClicks,
      leadsCaptured: totalLeadsCaptured
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
    const portalAccessToken = generateSponsorPortalAccessToken();
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
      portalAccessToken,
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
    const portalUrl = buildSponsorPortalLink(
      event._id,
      sponsorId,
      req.config.appOrigin,
      portalAccessToken
    );

    await req.eventBus.publish(DomainEvents.SPONSOR_APPLICATION_SUBMITTED, {
      sponsorId,
      eventId: event._id.toString(),
      eventTitle: event.title,
      organizerId: event.organizerId,
      packageName: sponsorPackage.name,
      companyName: application.companyName,
      contactName: application.contactName,
      contactEmail: application.contactEmail,
      portalUrl
    });

    sendSuccess(
      res,
      {
        sponsorId,
        applicationId: application._id,
        status: application.status,
        paymentStatus: application.paymentStatus,
        portalUrl
      },
      201
    );
  })
);

router.get(
  '/:eventId/sponsors/:sponsorId/portal',
  asyncHandler(async (req, res) => {
    const event = await loadEventOrThrow(req.params.eventId);
    syncSponsorPackageSlots(event);

    const application = await loadSponsorApplicationOrThrow(
      event._id.toString(),
      req.params.sponsorId
    );
    authorizeSponsorPortalAccess({
      req,
      event,
      application
    });

    const sponsorPackage = (event.sponsorPackages || []).find(
      (item) => item.packageId === application.packageId
    );
    const sponsor = (event.sponsors || []).find(
      (item) => item.sponsorId === req.params.sponsorId
    );
    const leads = await SponsorLead.find({
      eventId: event._id.toString(),
      sponsorId: req.params.sponsorId
    }).sort({ createdAt: -1 });
    const serializedLeads = leads.map((lead) => serializeLead(lead));
    const leadPipeline = buildLeadPipelineSummary(serializedLeads);
    const portalUrl = await buildPortalUrlForApplication(
      req,
      event._id.toString(),
      application
    );

    sendSuccess(res, {
      event: {
        eventId: event._id.toString(),
        title: event.title,
        summary: event.summary,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        type: event.type,
        status: event.status,
        coverImageUrl: event.coverImageUrl || '',
        city: event.city || '',
        country: event.country || '',
        attendeesCount: Number(event.attendeesCount || 0)
      },
      sponsor: {
        sponsorId: application.sponsorId,
        companyName: application.companyName,
        logoUrl: application.logoUrl || '',
        description: application.description || '',
        boothUrl: application.boothUrl || '',
        websiteUrl: application.websiteUrl || '',
        contactName: application.contactName,
        contactEmail: application.contactEmail,
        notes: application.notes || '',
        status: application.status,
        paymentStatus: application.paymentStatus,
        packageName: application.packageName,
        tier: application.tier,
        price: application.price,
        currency: application.currency || 'INR',
        featuredCallout: Boolean(application.featuredCallout),
        showOnEventPage: Boolean(application.showOnEventPage),
        showInLiveRoom: Boolean(application.showInLiveRoom),
        showInEmails: Boolean(application.showInEmails),
        approvedAt: application.approvedAt || null,
        activatedAt: application.activatedAt || null,
        payout: application.payout || null,
        metrics: {
          boothViews: Number(sponsor?.metrics?.boothViews || 0),
          boothClicks: Number(sponsor?.metrics?.boothClicks || 0),
          leadsCaptured: Number(sponsor?.metrics?.leadsCaptured || leads.length || 0)
        },
        portalLink: portalUrl
      },
      package: sponsorPackage
        ? {
            packageId: sponsorPackage.packageId,
            name: sponsorPackage.name,
            tier: sponsorPackage.tier,
            description: sponsorPackage.description || '',
            price: sponsorPackage.price,
            currency: sponsorPackage.currency || 'INR',
            perks: sponsorPackage.perks || [],
            paymentLinkUrl: sponsorPackage.paymentLinkUrl || '',
            paymentInstructions: sponsorPackage.paymentInstructions || '',
            isActive: Boolean(sponsorPackage.isActive)
          }
        : null,
      links: {
        eventUrl: `${req.config.appOrigin.replace(/\/$/, '')}/events/${event._id.toString()}`,
        boothPageUrl: sponsor
          ? `${req.config.appOrigin.replace(/\/$/, '')}/events/${event._id.toString()}/sponsors/${req.params.sponsorId}`
          : '',
        portalUrl
      },
      leadPipeline,
      leads: serializedLeads
    });
  })
);

router.patch(
  '/:eventId/sponsors/:sponsorId/portal',
  validateSchema(sponsorPortalUpdateSchema),
  asyncHandler(async (req, res) => {
    const event = await loadEventOrThrow(req.params.eventId);
    syncSponsorPackageSlots(event);

    const application = await loadSponsorApplicationOrThrow(
      event._id.toString(),
      req.params.sponsorId
    );
    authorizeSponsorPortalAccess({
      req,
      event,
      application
    });

    const sponsorPackage = (event.sponsorPackages || []).find(
      (item) => item.packageId === application.packageId
    );
    const existingSponsor = (event.sponsors || []).find(
      (item) => item.sponsorId === req.params.sponsorId
    );

    application.companyName = req.body.companyName ?? application.companyName;
    application.logoUrl = req.body.logoUrl ?? application.logoUrl;
    application.description = req.body.description ?? application.description;
    application.boothUrl = req.body.boothUrl ?? application.boothUrl;
    application.websiteUrl = req.body.websiteUrl ?? application.websiteUrl;
    application.contactName = req.body.contactName ?? application.contactName;
    application.contactEmail = req.body.contactEmail ?? application.contactEmail;
    application.notes = req.body.notes ?? application.notes;
    application.showOnEventPage = req.body.showOnEventPage ?? application.showOnEventPage;
    application.showInLiveRoom = req.body.showInLiveRoom ?? application.showInLiveRoom;
    application.showInEmails = req.body.showInEmails ?? application.showInEmails;
    application.featuredCallout = req.body.featuredCallout ?? application.featuredCallout;

    if (existingSponsor) {
      const nextSponsorRecord = buildSponsorRecordFromApplication({
        application,
        sponsorPackage,
        existingSponsor,
        overrides: {
          ...req.body,
          status: existingSponsor.status,
          paymentStatus: existingSponsor.paymentStatus,
          paymentId: existingSponsor.paymentId,
          approvedAt: existingSponsor.approvedAt,
          activatedAt: existingSponsor.activatedAt
        },
        platformFeePercent: req.config.sponsorPlatformFeePercent
      });

      event.sponsors = (event.sponsors || []).map((item) =>
        item.sponsorId === req.params.sponsorId ? nextSponsorRecord : item
      );
      await event.save();
    }

    await application.save();

    sendSuccess(res, {
      sponsorId: application.sponsorId,
      portalLink: await buildPortalUrlForApplication(req, event._id.toString(), application),
      updated: true
    });
  })
);

router.patch(
  '/:eventId/sponsors/:sponsorId/portal/leads/:leadId',
  validateSchema(sponsorLeadManageSchema),
  asyncHandler(async (req, res) => {
    const event = await loadEventOrThrow(req.params.eventId);
    const application = await loadSponsorApplicationOrThrow(
      event._id.toString(),
      req.params.sponsorId
    );
    authorizeSponsorPortalAccess({
      req,
      event,
      application
    });

    const lead = await SponsorLead.findOne({
      _id: req.params.leadId,
      eventId: event._id.toString(),
      sponsorId: req.params.sponsorId
    });
    if (!lead) {
      throw new AppError('Lead not found', 404, 'sponsor_lead_not_found');
    }

    if (req.body.status !== undefined) {
      lead.status = req.body.status;
      if (req.body.status === 'contacted' && !req.body.lastContactedAt) {
        lead.lastContactedAt = new Date();
      }
    }
    if (req.body.followUpNotes !== undefined) {
      lead.followUpNotes = req.body.followUpNotes;
    }
    if (req.body.lastContactedAt !== undefined) {
      lead.lastContactedAt = req.body.lastContactedAt;
    }

    await lead.save();
    sendSuccess(res, serializeLead(lead));
  })
);

router.get(
  '/:eventId/sponsors/:sponsorId/portal/leads.csv',
  asyncHandler(async (req, res) => {
    const event = await loadEventOrThrow(req.params.eventId);
    const application = await loadSponsorApplicationOrThrow(
      event._id.toString(),
      req.params.sponsorId
    );
    authorizeSponsorPortalAccess({
      req,
      event,
      application
    });

    const leads = await SponsorLead.find({
      eventId: event._id.toString(),
      sponsorId: req.params.sponsorId
    }).sort({ createdAt: -1 });
    const csv = buildSponsorLeadCsv(leads.map((lead) => serializeLead(lead)));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=\"${buildDownloadFileName(application.companyName)}\"`
    );
    res.send(csv);
  })
);

router.get(
  '/:eventId/sponsors/:sponsorId/booth',
  asyncHandler(async (req, res) => {
    const viewer = decodeOptionalToken(req);
    const event = await loadEventOrThrow(req.params.eventId);
    assertViewerCanAccessEvent(event, viewer);

    const viewerOwnsEvent = isViewerOwner(event, viewer);
    if (!viewerOwnsEvent && event.status !== 'published') {
      throw new AppError('Sponsor booth not available', 404, 'sponsor_not_found');
    }

    const sponsor = findSponsorForViewerOrThrow(event, req.params.sponsorId, {
      viewerIsOwner: viewerOwnsEvent
    });
    const sponsorPackage = (event.sponsorPackages || []).find(
      (pkg) => pkg.packageId === sponsor.packageId
    );

    sendSuccess(res, {
      event: {
        eventId: event._id.toString(),
        title: event.title,
        summary: event.summary,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        type: event.type,
        coverImageUrl: event.coverImageUrl || '',
        city: event.city || '',
        country: event.country || '',
        attendeesCount: Number(event.attendeesCount || 0)
      },
      sponsor: {
        sponsorId: sponsor.sponsorId,
        tier: sponsor.tier,
        packageName: sponsor.packageName,
        companyName: sponsor.companyName,
        logoUrl: sponsor.logoUrl || '',
        description: sponsor.description || '',
        boothUrl: sponsor.boothUrl || '',
        websiteUrl: sponsor.websiteUrl || '',
        featuredCallout: Boolean(sponsor.featuredCallout),
        highlights: sponsorPackage?.perks || [],
        ownerPreview: viewerOwnsEvent,
        metrics: viewerOwnsEvent
          ? {
              boothViews: Number(sponsor.metrics?.boothViews || 0),
              boothClicks: Number(sponsor.metrics?.boothClicks || 0),
              leadsCaptured: Number(sponsor.metrics?.leadsCaptured || 0)
            }
          : undefined
      },
      leadCapture: {
        enabled: true,
        interestOptions: SPONSOR_LEAD_INTEREST_OPTIONS
      }
    });
  })
);

router.post(
  '/:eventId/sponsors/:sponsorId/booth-view',
  asyncHandler(async (req, res) => {
    const viewer = decodeOptionalToken(req);
    const event = await loadEventOrThrow(req.params.eventId);
    assertViewerCanAccessEvent(event, viewer);

    const viewerOwnsEvent = isViewerOwner(event, viewer);
    if (!viewerOwnsEvent && event.status !== 'published') {
      throw new AppError('Sponsor booth not available', 404, 'sponsor_not_found');
    }

    findSponsorForViewerOrThrow(event, req.params.sponsorId, {
      viewerIsOwner: viewerOwnsEvent
    });

    await Event.updateOne(
      {
        _id: event._id,
        'sponsors.sponsorId': req.params.sponsorId
      },
      {
        $inc: {
          'sponsors.$.metrics.boothViews': 1
        }
      }
    );

    sendSuccess(res, { tracked: true });
  })
);

router.post(
  '/:eventId/sponsors/:sponsorId/leads',
  validateSchema(sponsorLeadSchema),
  asyncHandler(async (req, res) => {
    const viewer = decodeOptionalToken(req);
    const event = await loadEventOrThrow(req.params.eventId);
    assertViewerCanAccessEvent(event, viewer);

    if (!event.sponsors?.length || event.status !== 'published') {
      throw new AppError('Sponsor booth not available', 404, 'sponsor_not_found');
    }

    const sponsor = findSponsorForViewerOrThrow(event, req.params.sponsorId, {
      viewerIsOwner: false
    });
    const workEmail = String(req.body.workEmail || '').trim().toLowerCase();
    const duplicateWindowStartsAt = new Date(Date.now() - 10 * 60 * 1000);
    const recentDuplicate = await SponsorLead.exists({
      eventId: event._id.toString(),
      sponsorId: sponsor.sponsorId,
      workEmail,
      createdAt: {
        $gte: duplicateWindowStartsAt
      }
    });

    if (recentDuplicate) {
      throw new AppError(
        'You already submitted your details recently. Give the sponsor a few minutes before sending another request.',
        409,
        'sponsor_lead_recent_duplicate'
      );
    }

    const lead = await SponsorLead.create({
      eventId: event._id.toString(),
      organizerId: event.organizerId,
      sponsorId: sponsor.sponsorId,
      sponsorCompanyName: sponsor.companyName,
      eventTitle: event.title,
      attendeeUserId: viewer?.sub || '',
      fullName: req.body.fullName,
      workEmail,
      companyName: req.body.companyName,
      roleTitle: req.body.roleTitle,
      interestType: req.body.interestType || 'general',
      message: req.body.message,
      source: 'booth_page'
    });

    await Event.updateOne(
      {
        _id: event._id,
        'sponsors.sponsorId': req.params.sponsorId
      },
      {
        $inc: {
          'sponsors.$.metrics.leadsCaptured': 1
        }
      }
    );

    sendSuccess(
      res,
      {
        leadId: lead._id.toString(),
        sponsorId: sponsor.sponsorId
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

    const viewerOwnsEvent = isViewerOwner(event, viewer);
    if (!viewerOwnsEvent && event.status !== 'published') {
      throw new AppError('Sponsor not found', 404, 'sponsor_not_found');
    }

    findSponsorForViewerOrThrow(event, req.params.sponsorId, {
      viewerIsOwner: viewerOwnsEvent
    });

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

    const application = await loadSponsorApplicationOrThrow(
      event._id.toString(),
      req.params.sponsorId
    );
    const portalUrl = await buildPortalUrlForApplication(
      req,
      event._id.toString(),
      application
    );

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
        contactEmail: application.contactEmail,
        portalUrl
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
        contactEmail: application.contactEmail,
        portalUrl
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
