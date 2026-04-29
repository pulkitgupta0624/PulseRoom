const Joi = require('joi');
const { Roles } = require('@pulseroom/common');

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  role: Joi.string()
    .valid(Roles.ATTENDEE, Roles.ORGANIZER, Roles.SPEAKER, Roles.MODERATOR)
    .default(Roles.ATTENDEE)
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const twoFactorLoginSchema = Joi.object({
  twoFactorToken: Joi.string().required(),
  code: Joi.string().min(6).max(20).required()
});

const twoFactorCodeSchema = Joi.object({
  code: Joi.string().min(6).max(20).required()
});

const twoFactorProtectedActionSchema = Joi.object({
  password: Joi.string().required(),
  code: Joi.string().min(6).max(20).required()
});

module.exports = {
  registerSchema,
  loginSchema,
  twoFactorCodeSchema,
  twoFactorLoginSchema,
  twoFactorProtectedActionSchema
};
