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

module.exports = {
  registerSchema,
  loginSchema
};

