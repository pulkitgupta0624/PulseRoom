const express = require('express');
const {
  AppError,
  asyncHandler,
  authenticate,
  sendSuccess
} = require('@pulseroom/common');
const Notification = require('../models/Notification');

const router = express.Router();

router.get(
  '/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find({
      userId: req.user.sub
    }).sort({ createdAt: -1 });

    sendSuccess(res, notifications);
  })
);

router.get(
  '/me/unread-count',
  authenticate(),
  asyncHandler(async (req, res) => {
    const unreadCount = await Notification.countDocuments({
      userId: req.user.sub,
      readAt: { $exists: false }
    });

    sendSuccess(res, { unreadCount });
  })
);

router.patch(
  '/:notificationId/read',
  authenticate(),
  asyncHandler(async (req, res) => {
    const notification = await Notification.findById(req.params.notificationId);
    if (!notification || notification.userId !== req.user.sub) {
      throw new AppError('Notification not found', 404, 'notification_not_found');
    }

    notification.readAt = new Date();
    await notification.save();
    sendSuccess(res, notification);
  })
);

module.exports = router;

