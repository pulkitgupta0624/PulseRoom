const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const express = require('express');
const {
  AppError,
  asyncHandler,
  sendSuccess,
  validateSchema,
  authenticate,
  DomainEvents
} = require('@pulseroom/common');
const UserCredential = require('../models/UserCredential');
const RefreshToken = require('../models/RefreshToken');
const config = require('../config');
const { registerSchema, loginSchema } = require('../validators/authSchemas');
const { buildAuthPayload, rotateRefreshToken, revokeRefreshToken, hashToken, createAccessToken } = require('../services/tokenService');

const buildCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.cookieSecure,
  path: '/api/auth',
  maxAge: config.jwtRefreshExpiresInDays * 24 * 60 * 60 * 1000
});

const router = express.Router();

router.post(
  '/register',
  validateSchema(registerSchema),
  asyncHandler(async (req, res) => {
    const existing = await UserCredential.findOne({ email: req.body.email.toLowerCase() });
    if (existing) {
      throw new AppError('Email is already in use', 409, 'email_taken');
    }

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const userId = crypto.randomUUID();
    const user = await UserCredential.create({
      userId,
      email: req.body.email.toLowerCase(),
      passwordHash,
      role: req.body.role
    });

    const payload = await buildAuthPayload(user, req);
    res.cookie('refreshToken', payload.refreshToken, buildCookieOptions());

    await req.eventBus.publish(DomainEvents.USER_REGISTERED, {
      userId,
      email: user.email,
      name: req.body.name,
      role: req.body.role
    });

    sendSuccess(
      res,
      {
        ...payload,
        refreshToken: undefined
      },
      201
    );
  })
);

router.post(
  '/login',
  validateSchema(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await UserCredential.findOne({
      email: req.body.email.toLowerCase()
    });

    if (!user || !user.isActive) {
      throw new AppError('Invalid credentials', 401, 'invalid_credentials');
    }

    const passwordMatches = await bcrypt.compare(req.body.password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError('Invalid credentials', 401, 'invalid_credentials');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const payload = await buildAuthPayload(user, req);
    res.cookie('refreshToken', payload.refreshToken, buildCookieOptions());

    sendSuccess(res, {
      accessToken: payload.accessToken,
      user: payload.user
    });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies.refreshToken || req.body.refreshToken;
    if (!token) {
      throw new AppError('Refresh token required', 401, 'missing_refresh_token');
    }

    const refreshSession = await RefreshToken.findOne({
      tokenHash: hashToken(token),
      revokedAt: { $exists: false }
    });

    if (!refreshSession || refreshSession.expiresAt < new Date()) {
      throw new AppError('Refresh session expired', 401, 'refresh_expired');
    }

    const user = await UserCredential.findOne({
      userId: refreshSession.userId,
      isActive: true
    });

    if (!user) {
      throw new AppError('User not found', 404, 'user_not_found');
    }

    const nextRefreshToken = await rotateRefreshToken(token, user, req);
    if (!nextRefreshToken) {
      throw new AppError('Refresh session invalid', 401, 'refresh_invalid');
    }

    res.cookie('refreshToken', nextRefreshToken, buildCookieOptions());
    sendSuccess(res, {
      accessToken: createAccessToken(user),
      user: {
        id: user.userId,
        email: user.email,
        role: user.role,
        permissions: user.permissions || []
      }
    });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies.refreshToken || req.body.refreshToken;
    await revokeRefreshToken(token);
    res.clearCookie('refreshToken', buildCookieOptions());
    sendSuccess(res, {
      loggedOut: true
    });
  })
);

router.get(
  '/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    const user = await UserCredential.findOne({
      userId: req.user.sub
    }).select('-passwordHash');

    if (!user) {
      throw new AppError('User not found', 404, 'user_not_found');
    }

    sendSuccess(res, {
      id: user.userId,
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
      lastLoginAt: user.lastLoginAt
    });
  })
);

module.exports = router;

