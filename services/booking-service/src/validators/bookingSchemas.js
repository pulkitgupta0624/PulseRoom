const Joi = require('joi');

const attendeeSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().email().required()
});

const checkoutSchema = Joi.object({
  eventId: Joi.string().required(),
  tierId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).max(10).required(),
  currency: Joi.string().length(3).uppercase().optional(),
  referralCode: Joi.string().max(64).allow('').optional(),
  promoCode: Joi.string().max(64).allow('').optional(),
  waitlistOfferToken: Joi.string().min(16).allow('').optional(),
  attendee: attendeeSchema.required()
});

const quoteSchema = Joi.object({
  eventId: Joi.string().required(),
  tierId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).max(10).required(),
  currency: Joi.string().length(3).uppercase().optional(),
  referralCode: Joi.string().max(64).allow('').optional(),
  promoCode: Joi.string().max(64).allow('').optional()
});

const confirmPaymentSchema = Joi.object({
  paymentIntentId: Joi.string().max(255).optional()
});

const joinWaitlistSchema = Joi.object({
  eventId: Joi.string().required(),
  tierId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).max(10).required(),
  attendee: attendeeSchema.required()
});

const checkInSchema = Joi.object({
  token: Joi.string().min(16).required()
});

const updateTicketSchema = Joi.object({
  attendee: attendeeSchema.required()
});

const agendaSessionUpdateSchema = Joi.object({
  sessionKey: Joi.string().min(3).max(200).required(),
  saved: Joi.boolean().required()
});

module.exports = {
  checkoutSchema,
  quoteSchema,
  confirmPaymentSchema,
  joinWaitlistSchema,
  checkInSchema,
  updateTicketSchema,
  agendaSessionUpdateSchema
};
