const Joi = require('joi');

const reportSchema = Joi.object({
  reportType: Joi.string().valid('user', 'event', 'message').required(),
  targetId: Joi.string().required(),
  reason: Joi.string().min(5).max(500).required()
});

const reviewReportSchema = Joi.object({
  status: Joi.string().valid('open', 'reviewing', 'resolved').required(),
  resolutionNotes: Joi.string().allow('').max(500)
});

const banSchema = Joi.object({
  reason: Joi.string().min(5).max(500).required(),
  expiresAt: Joi.date().optional()
});

const moderateEventSchema = Joi.object({
  action: Joi.string().valid('feature', 'cancel', 'restore').required()
});

module.exports = {
  reportSchema,
  reviewReportSchema,
  banSchema,
  moderateEventSchema
};

