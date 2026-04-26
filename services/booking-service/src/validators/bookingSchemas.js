const Joi = require('joi');

const checkoutSchema = Joi.object({
  eventId: Joi.string().required(),
  tierId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).max(10).required(),
  waitlistOfferToken: Joi.string().min(16).allow('').optional(),
  attendee: Joi.object({
    name: Joi.string().min(2).max(120).required(),
    email: Joi.string().email().required()
  }).required()
});

const joinWaitlistSchema = Joi.object({
  eventId: Joi.string().required(),
  tierId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).max(10).required(),
  attendee: Joi.object({
    name: Joi.string().min(2).max(120).required(),
    email: Joi.string().email().required()
  }).required()
});

const checkInSchema = Joi.object({
  token: Joi.string().min(16).required()
});

module.exports = {
  checkoutSchema,
  joinWaitlistSchema,
  checkInSchema
};
