const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  sendSuccess
} = require('@pulseroom/common');
const {
  getEntitlements,
  getPublicSummary,
  getSummary
} = require('../services/engine');

const router = express.Router();

const assertInternalService = (req, allowedServices = []) => {
  if (!allowedServices.includes(req.headers['x-service-name'])) {
    throw new AppError('Forbidden', 403, 'forbidden');
  }
};

router.get(
  '/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getSummary(req.user.sub));
  })
);

router.get(
  '/users/:userId/public',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getPublicSummary(req.params.userId));
  })
);

router.get(
  '/internal/users/:userId/entitlements',
  asyncHandler(async (req, res) => {
    assertInternalService(req, ['booking-service']);
    sendSuccess(res, await getEntitlements(req.params.userId));
  })
);

module.exports = router;
