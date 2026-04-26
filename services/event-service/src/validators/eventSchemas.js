const Joi = require('joi');
const { EventTypes, EventVisibility } = require('@pulseroom/common');

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

module.exports = {
  createEventSchema,
  updateEventSchema,
  updateStatusSchema,
  aiEventDraftSchema,
  aiAssistantQuestionSchema
};
