const { AppError } = require('./errors');

const validateSchema = (schema, target = 'body') => (req, _res, next) => {
  const { value, error } = schema.validate(req[target], {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    return next(
      new AppError('Validation failed', 422, 'validation_error', error.details.map((item) => item.message))
    );
  }

  req[target] = value;
  return next();
};

module.exports = {
  validateSchema
};

