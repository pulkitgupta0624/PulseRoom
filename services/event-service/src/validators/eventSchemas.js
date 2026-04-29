const Joi = require('joi');
const { EventTypes, EventVisibility } = require('@pulseroom/common');
const { FONT_PAIRINGS } = require('../services/eventThemeService');

const ticketTierSchema = Joi.object({
  tierId: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string().allow(''),
  price: Joi.number().min(0).default(0),
  currency: Joi.string().default('INR'),
  quantity: Joi.number().integer().min(1).required(),
  perks: Joi.array().items(Joi.string().max(120)).default([]),
  saleStart: Joi.date().optional(),
  saleEnd: Joi.date().optional(),
  isFree: Joi.boolean().default(false)
});

const speakerSchema = Joi.object({
  userId: Joi.string().allow(''),
  email: Joi.string().email().allow(''),
  name: Joi.string().required(),
  title: Joi.string().allow(''),
  company: Joi.string().allow(''),
  bio: Joi.string().allow(''),
  avatarUrl: Joi.string().uri().allow('')
});

const sessionSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().allow(''),
  startsAt: Joi.date().required(),
  endsAt: Joi.date().required(),
  roomLabel: Joi.string().allow(''),
  capacity: Joi.number().integer().min(1),
  speakerNames: Joi.array().items(Joi.string()).default([])
});

const sponsorPackageSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  tier: Joi.string().valid('gold', 'silver', 'bronze', 'custom').default('custom'),
  description: Joi.string().max(240).allow(''),
  price: Joi.number().min(0).required(),
  currency: Joi.string().length(3).default('INR'),
  maxSlots: Joi.number().integer().min(1).required(),
  perks: Joi.array().items(Joi.string().max(120)).min(1).default([]),
  paymentLinkUrl: Joi.string().uri().allow(''),
  paymentInstructions: Joi.string().max(500).allow(''),
  isActive: Joi.boolean().default(true),
  showOnEventPage: Joi.boolean().default(true),
  showInLiveRoom: Joi.boolean().default(true),
  showInEmails: Joi.boolean().default(false),
  featuredCallout: Joi.boolean().default(false)
});

const updateSponsorPackageSchema = sponsorPackageSchema.fork(
  ['name', 'price', 'maxSlots'],
  (schema) => schema.optional()
).min(1);

const sponsorApplicationSchema = Joi.object({
  packageId: Joi.string().required(),
  companyName: Joi.string().min(2).max(160).required(),
  logoUrl: Joi.string().uri().allow(''),
  description: Joi.string().max(240).allow(''),
  boothUrl: Joi.string().uri().allow(''),
  websiteUrl: Joi.string().uri().allow(''),
  contactName: Joi.string().min(2).max(120).required(),
  contactEmail: Joi.string().email().required(),
  notes: Joi.string().max(500).allow(''),
  showOnEventPage: Joi.boolean().optional(),
  showInLiveRoom: Joi.boolean().optional(),
  showInEmails: Joi.boolean().optional(),
  featuredCallout: Joi.boolean().optional()
});

const sponsorDecisionSchema = Joi.object({
  status: Joi.string().valid('approved', 'active', 'rejected').required(),
  paymentStatus: Joi.string().valid('unpaid', 'paid', 'refunded').optional(),
  paymentId: Joi.string().max(160).allow(''),
  companyName: Joi.string().min(2).max(160).optional(),
  logoUrl: Joi.string().uri().allow('').optional(),
  description: Joi.string().max(240).allow('').optional(),
  boothUrl: Joi.string().uri().allow('').optional(),
  websiteUrl: Joi.string().uri().allow('').optional(),
  contactName: Joi.string().min(2).max(120).optional(),
  contactEmail: Joi.string().email().optional(),
  showOnEventPage: Joi.boolean().optional(),
  showInLiveRoom: Joi.boolean().optional(),
  showInEmails: Joi.boolean().optional(),
  featuredCallout: Joi.boolean().optional()
}).min(1);

const promoCodeSchema = Joi.object({
  code: Joi.string().trim().min(3).max(32).pattern(/^[A-Za-z0-9_-]+$/).required(),
  discountType: Joi.string().valid('percentage', 'fixed').default('percentage'),
  discountValue: Joi.number().positive().required(),
  maxRedemptions: Joi.number().integer().min(1).required(),
  startsAt: Joi.date().optional(),
  expiresAt: Joi.date().optional(),
  appliesToTierIds: Joi.array().items(Joi.string()).default([]),
  active: Joi.boolean().default(true)
}).custom((value, helpers) => {
  if (value.discountType === 'percentage' && value.discountValue > 100) {
    return helpers.error('any.invalid');
  }

  if (value.startsAt && value.expiresAt && new Date(value.expiresAt) <= new Date(value.startsAt)) {
    return helpers.error('date.greater');
  }

  return value;
}, 'promo code validation');

const updatePromoCodeSchema = promoCodeSchema.fork(
  ['code', 'discountType', 'discountValue', 'maxRedemptions'],
  (schema) => schema.optional()
).min(1);

const webhookEndpointSchema = Joi.object({
  targetUrl: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  subscribedEvents: Joi.array().items(Joi.string()).min(1).required(),
  active: Joi.boolean().default(true)
});

const updateWebhookEndpointSchema = Joi.object({
  targetUrl: Joi.string().uri({ scheme: ['http', 'https'] }),
  subscribedEvents: Joi.array().items(Joi.string()).min(1),
  active: Joi.boolean()
}).min(1);

const networkingSettingsSchema = Joi.object({
  enabled: Joi.boolean(),
  matchesPerAttendee: Joi.number().integer().min(1).max(5)
}).min(1);

const networkingOptInSchema = Joi.object({
  optedIn: Joi.boolean().required()
});

const networkingGenerateSchema = Joi.object({
  forceRegenerate: Joi.boolean().default(false)
});

const promoPreviewSchema = Joi.object({
  code: Joi.string().required(),
  tierId: Joi.string().required(),
  subtotal: Joi.number().min(0).required()
});

const promoConsumeSchema = Joi.object({
  promoCodeId: Joi.string().required(),
  code: Joi.string().required(),
  tierId: Joi.string().required(),
  discountAmount: Joi.number().min(0).required(),
  redeemedByUserId: Joi.string().required(),
  bookingId: Joi.string().required()
});

const promoReleaseSchema = Joi.object({
  promoCodeId: Joi.string().required(),
  code: Joi.string().required(),
  discountAmount: Joi.number().min(0).default(0),
  bookingId: Joi.string().required()
});

const pageThemeSchema = Joi.object({
  primaryColor: Joi.string().pattern(/^#?[0-9A-Fa-f]{6}$|^#?[0-9A-Fa-f]{3}$/).required(),
  accentColor: Joi.string().pattern(/^#?[0-9A-Fa-f]{6}$|^#?[0-9A-Fa-f]{3}$/).required(),
  fontPairing: Joi.string().valid(...Object.keys(FONT_PAIRINGS)).required()
});

const createEventSchema = Joi.object({
  title: Joi.string().min(3).max(160).required(),
  summary: Joi.string().min(10).max(300).required(),
  description: Joi.string().min(20).required(),
  coverImageUrl: Joi.string().uri().allow(''),
  type: Joi.string().valid(...Object.values(EventTypes)).required(),
  visibility: Joi.string().valid(...Object.values(EventVisibility)).default(EventVisibility.PUBLIC),
  timezone: Joi.string().default('Asia/Calcutta'),
  startsAt: Joi.date().required(),
  endsAt: Joi.date().greater(Joi.ref('startsAt')).required(),
  venueName: Joi.string().allow(''),
  venueAddress: Joi.string().allow(''),
  city: Joi.string().allow(''),
  country: Joi.string().allow(''),
  streamUrl: Joi.string().uri().allow(''),
  organizerSignatureName: Joi.string().max(120).allow(''),
  categories: Joi.array().items(Joi.string().max(60)).min(1).required(),
  tags: Joi.array().items(Joi.string().max(40)).default([]),
  speakers: Joi.array().items(speakerSchema).default([]),
  sessions: Joi.array().items(sessionSchema).default([]),
  ticketTiers: Joi.array().items(ticketTierSchema).min(1).required(),
  pageTheme: pageThemeSchema.optional(),
  featured: Joi.boolean().default(false),
  allowsChat: Joi.boolean().default(true),
  allowsQa: Joi.boolean().default(true)
});

const updateEventSchema = createEventSchema.fork(
  [
    'title',
    'summary',
    'description',
    'type',
    'startsAt',
    'endsAt',
    'categories',
    'ticketTiers'
  ],
  (schema) => schema.optional()
).min(1);

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('draft', 'published', 'cancelled', 'completed').required()
});

const aiEventDraftSchema = Joi.object({
  idea: Joi.string().min(10).max(2000).required()
});

const aiAssistantQuestionSchema = Joi.object({
  question: Joi.string().min(3).max(500).required()
});

const eventReviewSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  reviewText: Joi.string().max(1200).allow('').default('')
});

const organizerReplySchema = Joi.object({
  body: Joi.string().min(3).max(1200).required()
});

module.exports = {
  createEventSchema,
  updateEventSchema,
  updateStatusSchema,
  aiEventDraftSchema,
  aiAssistantQuestionSchema,
  sponsorPackageSchema,
  updateSponsorPackageSchema,
  sponsorApplicationSchema,
  sponsorDecisionSchema,
  promoCodeSchema,
  updatePromoCodeSchema,
  webhookEndpointSchema,
  updateWebhookEndpointSchema,
  networkingSettingsSchema,
  networkingOptInSchema,
  networkingGenerateSchema,
  promoPreviewSchema,
  promoConsumeSchema,
  promoReleaseSchema,
  eventReviewSchema,
  organizerReplySchema
};
