const Joi = require('joi');
const { Roles } = require('@pulseroom/common');

const updateProfileSchema = Joi.object({
  displayName: Joi.string().min(2).max(120),
  bio: Joi.string().max(600).allow(''),
  avatarUrl: Joi.string().uri().allow(''),
  interests: Joi.array().items(Joi.string().min(2).max(40)).max(12),
  location: Joi.string().max(120).allow(''),
  socialLinks: Joi.object({
    website: Joi.string().uri().allow(''),
    linkedin: Joi.string().uri().allow(''),
    twitter: Joi.string().uri().allow('')
  }),
  organizerProfile: Joi.object({
    companyName: Joi.string().max(120).allow(''),
    website: Joi.string().uri().allow(''),
    supportEmail: Joi.string().email().allow('')
  })
}).min(1);

const updateRoleSchema = Joi.object({
  role: Joi.string().valid(...Object.values(Roles)).required(),
  isActive: Joi.boolean().default(true)
});

const organizerVerificationSchema = Joi.object({
  legalName: Joi.string().min(3).max(120).required(),
  companyName: Joi.string().min(2).max(120).required(),
  website: Joi.string().uri().allow(''),
  supportEmail: Joi.string().email().allow(''),
  documentUrls: Joi.array().items(Joi.string().uri()).max(10)
});

const reviewVerificationSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  notes: Joi.string().allow('').max(500)
});

module.exports = {
  updateProfileSchema,
  updateRoleSchema,
  organizerVerificationSchema,
  reviewVerificationSchema
};

