const SPONSOR_TIERS = ['gold', 'silver', 'bronze', 'custom'];
const ACTIVE_SLOT_STATUSES = new Set(['approved', 'active']);
const PUBLIC_SPONSOR_STATUSES = new Set(['active']);
const TIER_PRIORITY = {
  gold: 0,
  silver: 1,
  bronze: 2,
  custom: 3
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeSponsorTier = (tier) => (SPONSOR_TIERS.includes(tier) ? tier : 'custom');

const calculateSponsorRevenueBreakdown = ({ price, platformFeePercent = 5 }) => {
  const grossAmount = Number(toNumber(price).toFixed(2));
  const safePlatformFeePercent = Math.max(0, toNumber(platformFeePercent, 5));
  const platformFeeAmount = Number(((grossAmount * safePlatformFeePercent) / 100).toFixed(2));
  const organizerNetAmount = Number(Math.max(0, grossAmount - platformFeeAmount).toFixed(2));

  return {
    grossAmount,
    platformFeePercent: safePlatformFeePercent,
    platformFeeAmount,
    organizerNetAmount
  };
};

const sortSponsors = (sponsors = []) =>
  [...sponsors].sort((left, right) => {
    const tierDelta =
      (TIER_PRIORITY[normalizeSponsorTier(left.tier)] ?? 99) -
      (TIER_PRIORITY[normalizeSponsorTier(right.tier)] ?? 99);
    if (tierDelta !== 0) {
      return tierDelta;
    }

    if (Boolean(left.featuredCallout) !== Boolean(right.featuredCallout)) {
      return Number(Boolean(right.featuredCallout)) - Number(Boolean(left.featuredCallout));
    }

    return `${left.companyName || left.packageName || ''}`.localeCompare(
      `${right.companyName || right.packageName || ''}`
    );
  });

const sanitizeSponsorForViewer = (sponsor, { viewerIsOwner = false } = {}) => {
  if (!sponsor) {
    return null;
  }

  const raw = typeof sponsor.toObject === 'function' ? sponsor.toObject() : { ...sponsor };
  if (viewerIsOwner) {
    return raw;
  }

  return {
    sponsorId: raw.sponsorId,
    applicationId: raw.applicationId,
    packageId: raw.packageId,
    tier: raw.tier,
    packageName: raw.packageName,
    companyName: raw.companyName,
    logoUrl: raw.logoUrl,
    description: raw.description,
    boothUrl: raw.boothUrl,
    websiteUrl: raw.websiteUrl,
    showOnEventPage: raw.showOnEventPage,
    showInLiveRoom: raw.showInLiveRoom,
    showInEmails: raw.showInEmails,
    featuredCallout: raw.featuredCallout,
    status: raw.status,
    approvedAt: raw.approvedAt,
    activatedAt: raw.activatedAt
  };
};

const filterSponsorsForViewer = (sponsors = [], { viewerIsOwner = false } = {}) => {
  const filtered = viewerIsOwner
    ? sponsors
    : sponsors.filter(
        (sponsor) =>
          PUBLIC_SPONSOR_STATUSES.has(sponsor.status) &&
          sponsor.paymentStatus === 'paid' &&
          (sponsor.showOnEventPage || sponsor.showInLiveRoom || sponsor.showInEmails)
      );

  return sortSponsors(filtered)
    .map((sponsor) => sanitizeSponsorForViewer(sponsor, { viewerIsOwner }))
    .filter(Boolean);
};

const filterSponsorPackagesForViewer = (packages = [], { viewerIsOwner = false } = {}) =>
  [...packages]
    .map((pkg) => {
      const raw = typeof pkg.toObject === 'function' ? pkg.toObject() : { ...pkg };
      return {
        ...raw,
        tier: normalizeSponsorTier(raw.tier),
        slotsUsed: toNumber(raw.slotsUsed),
        slotsRemaining: Math.max(0, toNumber(raw.maxSlots) - toNumber(raw.slotsUsed))
      };
    })
    .filter((pkg) => viewerIsOwner || pkg.isActive)
    .sort((left, right) => {
      const tierDelta =
        (TIER_PRIORITY[left.tier] ?? 99) -
        (TIER_PRIORITY[right.tier] ?? 99);
      if (tierDelta !== 0) {
        return tierDelta;
      }

      return toNumber(right.price) - toNumber(left.price);
    });

const syncSponsorPackageSlots = (event) => {
  const sponsors = Array.isArray(event?.sponsors) ? event.sponsors : [];
  const sponsorPackages = Array.isArray(event?.sponsorPackages) ? event.sponsorPackages : [];

  let changed = false;
  event.sponsorPackages = sponsorPackages.map((pkg) => {
    const raw = typeof pkg.toObject === 'function' ? pkg.toObject() : { ...pkg };
    const slotsUsed = sponsors.filter(
      (sponsor) =>
        sponsor.packageId === raw.packageId &&
        ACTIVE_SLOT_STATUSES.has(sponsor.status)
    ).length;

    if (toNumber(raw.slotsUsed) !== slotsUsed) {
      changed = true;
    }

    return {
      ...raw,
      tier: normalizeSponsorTier(raw.tier),
      slotsUsed
    };
  });

  return changed;
};

const buildSponsorApplicationLink = (eventId, appOrigin) =>
  `${(appOrigin || '').replace(/\/$/, '')}/events/${eventId.toString()}/sponsor`;

const buildSponsorRecordFromApplication = ({
  application,
  sponsorPackage,
  existingSponsor,
  overrides = {},
  platformFeePercent = 5
}) => {
  const price = toNumber(overrides.price ?? application.price ?? sponsorPackage?.price ?? 0);
  const payout = calculateSponsorRevenueBreakdown({
    price,
    platformFeePercent:
      overrides.platformFeePercent ??
      application.payout?.platformFeePercent ??
      existingSponsor?.payout?.platformFeePercent ??
      platformFeePercent
  });

  return {
    sponsorId: existingSponsor?.sponsorId || application.sponsorId,
    applicationId:
      existingSponsor?.applicationId ||
      application._id?.toString?.() ||
      application.applicationId,
    packageId: sponsorPackage?.packageId || application.packageId || existingSponsor?.packageId,
    tier: normalizeSponsorTier(
      overrides.tier ??
        application.tier ??
        sponsorPackage?.tier ??
        existingSponsor?.tier
    ),
    packageName:
      overrides.packageName ??
      application.packageName ??
      sponsorPackage?.name ??
      existingSponsor?.packageName,
    price,
    currency:
      overrides.currency ??
      application.currency ??
      sponsorPackage?.currency ??
      existingSponsor?.currency ??
      'INR',
    companyName:
      overrides.companyName ??
      application.companyName ??
      existingSponsor?.companyName,
    logoUrl:
      overrides.logoUrl ??
      application.logoUrl ??
      existingSponsor?.logoUrl ??
      '',
    description:
      overrides.description ??
      application.description ??
      existingSponsor?.description ??
      '',
    boothUrl:
      overrides.boothUrl ??
      application.boothUrl ??
      existingSponsor?.boothUrl ??
      '',
    websiteUrl:
      overrides.websiteUrl ??
      application.websiteUrl ??
      existingSponsor?.websiteUrl ??
      '',
    contactName:
      overrides.contactName ??
      application.contactName ??
      existingSponsor?.contactName ??
      '',
    contactEmail:
      overrides.contactEmail ??
      application.contactEmail ??
      existingSponsor?.contactEmail ??
      '',
    showOnEventPage:
      overrides.showOnEventPage ??
      application.showOnEventPage ??
      sponsorPackage?.showOnEventPage ??
      existingSponsor?.showOnEventPage ??
      true,
    showInLiveRoom:
      overrides.showInLiveRoom ??
      application.showInLiveRoom ??
      sponsorPackage?.showInLiveRoom ??
      existingSponsor?.showInLiveRoom ??
      true,
    showInEmails:
      overrides.showInEmails ??
      application.showInEmails ??
      sponsorPackage?.showInEmails ??
      existingSponsor?.showInEmails ??
      false,
    featuredCallout:
      overrides.featuredCallout ??
      application.featuredCallout ??
      sponsorPackage?.featuredCallout ??
      existingSponsor?.featuredCallout ??
      false,
    status:
      overrides.status ??
      application.status ??
      existingSponsor?.status ??
      'pending',
    approvedAt:
      overrides.approvedAt ??
      application.approvedAt ??
      existingSponsor?.approvedAt,
    activatedAt:
      overrides.activatedAt ??
      application.activatedAt ??
      existingSponsor?.activatedAt,
    paymentStatus:
      overrides.paymentStatus ??
      application.paymentStatus ??
      existingSponsor?.paymentStatus ??
      'unpaid',
    paymentId:
      overrides.paymentId ??
      application.paymentId ??
      existingSponsor?.paymentId ??
      '',
    payout,
    metrics: {
      boothClicks: toNumber(existingSponsor?.metrics?.boothClicks)
    },
    createdAt: existingSponsor?.createdAt || application.createdAt || new Date(),
    updatedAt: new Date()
  };
};

const buildSponsorRevenueSummary = (sponsors = []) =>
  sponsors.reduce(
    (summary, sponsor) => {
      const boothClicks = toNumber(sponsor.metrics?.boothClicks);
      summary.boothClicks += boothClicks;

      if (sponsor.status === 'active') {
        summary.activeSponsors += 1;
      }

      if (sponsor.featuredCallout) {
        summary.featuredSponsors += 1;
      }

      if (sponsor.paymentStatus === 'paid') {
        const payout =
          sponsor.payout?.grossAmount !== undefined
            ? sponsor.payout
            : calculateSponsorRevenueBreakdown({ price: sponsor.price });

        summary.grossRevenue += toNumber(payout.grossAmount);
        summary.platformFees += toNumber(payout.platformFeeAmount);
        summary.organizerNetRevenue += toNumber(payout.organizerNetAmount);
        summary.paidSponsors += 1;
      }

      return summary;
    },
    {
      grossRevenue: 0,
      platformFees: 0,
      organizerNetRevenue: 0,
      activeSponsors: 0,
      featuredSponsors: 0,
      paidSponsors: 0,
      boothClicks: 0
    }
  );

module.exports = {
  SPONSOR_TIERS,
  ACTIVE_SLOT_STATUSES,
  calculateSponsorRevenueBreakdown,
  buildSponsorApplicationLink,
  buildSponsorRecordFromApplication,
  buildSponsorRevenueSummary,
  filterSponsorPackagesForViewer,
  filterSponsorsForViewer,
  normalizeSponsorTier,
  sanitizeSponsorForViewer,
  sortSponsors,
  syncSponsorPackageSlots
};
