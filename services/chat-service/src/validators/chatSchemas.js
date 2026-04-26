const Joi = require('joi');

const moderationSchema = Joi.object({
  userId: Joi.string().required(),
  type: Joi.string().valid('mute', 'ban').required(),
  reason: Joi.string().allow('').max(250),
  expiresAt: Joi.date().optional()
});

const sendMessageSchema = Joi.object({
  body: Joi.string().min(1).max(2000).required()
});

module.exports = {
  moderationSchema,
  sendMessageSchema
};

