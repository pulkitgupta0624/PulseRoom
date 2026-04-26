const Joi = require('joi');

const createPollSchema = Joi.object({
  question: Joi.string().min(3).max(200).required(),
  options: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().required(),
        label: Joi.string().required()
      })
    )
    .min(2)
    .max(6)
    .required()
});

const voteSchema = Joi.object({
  optionId: Joi.string().required()
});

const questionSchema = Joi.object({
  body: Joi.string().min(3).max(500).required()
});

const announcementSchema = Joi.object({
  body: Joi.string().min(3).max(500).required()
});

module.exports = {
  createPollSchema,
  voteSchema,
  questionSchema,
  announcementSchema
};

