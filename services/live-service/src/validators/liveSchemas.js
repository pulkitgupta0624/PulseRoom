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

const questionReplySchema = Joi.object({
  body: Joi.string().min(1).max(500).required(),
  parentReplyId: Joi.string().allow(null, '').optional()
});

const updateQuestionSchema = Joi.object({
  answered: Joi.boolean(),
  hidden: Joi.boolean(),
  pinned: Joi.boolean()
}).min(1);

const announcementSchema = Joi.object({
  body: Joi.string().min(3).max(500).required()
});

const recordingStartSchema = Joi.object({
  mimeType: Joi.string().max(120).allow('', null).optional()
});

const recordingFinalizeSchema = Joi.object({
  recordingSessionId: Joi.string().required(),
  durationSeconds: Joi.number().min(0).max(24 * 60 * 60).optional()
});

const replayEditorSchema = Joi.object({
  trim: Joi.object({
    startOffsetSeconds: Joi.number().min(0).required(),
    endOffsetSeconds: Joi.number().min(0).allow(null).optional()
  }).required(),
  clips: Joi.array()
    .items(
      Joi.object({
        clipId: Joi.string().optional(),
        title: Joi.string().min(1).max(80).required(),
        startOffsetSeconds: Joi.number().min(0).required(),
        endOffsetSeconds: Joi.number().min(0).required()
      })
    )
    .max(10)
    .required()
});

module.exports = {
  announcementSchema,
  createPollSchema,
  recordingFinalizeSchema,
  recordingStartSchema,
  replayEditorSchema,
  voteSchema,
  questionSchema,
  questionReplySchema,
  updateQuestionSchema
};
