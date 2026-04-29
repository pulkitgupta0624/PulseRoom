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
const {
  registerSchema,
  loginSchema,
  twoFactorCodeSchema,
  twoFactorLoginSchema,
  twoFactorProtectedActionSchema
} = require('../validators/authSchemas');
const {
  buildAuthPayload,
  rotateRefreshToken,
  revokeRefreshToken,
  hashToken,
  createAccessToken,
  createTwoFactorChallengeToken,
  verifyTwoFactorChallengeToken
} = require('../services/tokenService');
const {
  buildBackupCodeHashes,
  buildOtpAuthUrl,
  encryptSecret,
  generateBackupCodes,
  generateSecret,
  serializeTwoFactorStatus,
  verifyEnabledTwoFactorCode,
  verifyPendingTwoFactorCode
} = require('../services/twoFactorService');

const buildCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.cookieSecure,
  path: '/api/auth',
  maxAge: config.jwtRefreshExpiresInDays * 24 * 60 * 60 * 1000
});

const router = express.Router();
const TWO_FACTOR_MAX_FAILED_ATTEMPTS = 5;
const TWO_FACTOR_LOCK_MS = 10 * 60 * 1000;

const buildAuthUser = (user) => ({
  id: user.userId,
  email: user.email,
  role: user.role,
  permissions: user.permissions || [],
  twoFactorEnabled: Boolean(user.twoFactor?.enabled)
});

const loadActiveUserOrThrow = async (userId) => {
  const user = await UserCredential.findOne({
    userId,
    isActive: true
  });

  if (!user) {
    throw new AppError('User not found', 404, 'user_not_found');
  }

  return user;
};

const assertTwoFactorLoginNotLocked = (user) => {
  const lockedUntil = user.twoFactor?.loginLockedUntil;
  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
    throw new AppError('Too many invalid two-factor attempts. Try again later.', 429, 'two_factor_locked');
  }
};

const recordTwoFactorLoginFailure = async (user) => {
  const lockedUntil = user.twoFactor?.loginLockedUntil;
  const previousAttempts =
    lockedUntil && new Date(lockedUntil).getTime() <= Date.now()
      ? 0
      : Number(user.twoFactor?.loginFailedAttempts || 0);
  const nextAttempts = previousAttempts + 1;
  user.twoFactor.loginFailedAttempts = nextAttempts;
  user.twoFactor.loginLockedUntil = undefined;

  if (nextAttempts >= TWO_FACTOR_MAX_FAILED_ATTEMPTS) {
    user.twoFactor.loginLockedUntil = new Date(Date.now() + TWO_FACTOR_LOCK_MS);
  }

  await user.save();
};

const clearTwoFactorLoginFailures = (user) => {
  user.twoFactor.loginFailedAttempts = 0;
  user.twoFactor.loginLockedUntil = undefined;
};

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
        accessToken: payload.accessToken,
        user: buildAuthUser(user)
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

    if (user.twoFactor?.enabled) {
      return sendSuccess(res, {
        requiresTwoFactor: true,
        twoFactorToken: createTwoFactorChallengeToken(user),
        user: {
          email: user.email
        }
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const payload = await buildAuthPayload(user, req);
    res.cookie('refreshToken', payload.refreshToken, buildCookieOptions());

    sendSuccess(res, {
      accessToken: payload.accessToken,
      user: buildAuthUser(user)
    });
  })
);

router.post(
  '/login/verify-2fa',
  validateSchema(twoFactorLoginSchema),
  asyncHandler(async (req, res) => {
    let challengePayload;
    try {
      challengePayload = verifyTwoFactorChallengeToken(req.body.twoFactorToken);
    } catch (_error) {
      throw new AppError('Two-factor session expired', 401, 'two_factor_session_expired');
    }

    if (challengePayload.purpose !== 'login.2fa') {
      throw new AppError('Two-factor session invalid', 401, 'two_factor_session_invalid');
    }

    const user = await loadActiveUserOrThrow(challengePayload.sub);
    assertTwoFactorLoginNotLocked(user);

    try {
      await verifyEnabledTwoFactorCode(user, req.body.code);
    } catch (error) {
      if (error.code === 'two_factor_code_invalid') {
        await recordTwoFactorLoginFailure(user);
      }
      throw error;
    }

    clearTwoFactorLoginFailures(user);
    user.lastLoginAt = new Date();
    await user.save();

    const payload = await buildAuthPayload(user, req);
    res.cookie('refreshToken', payload.refreshToken, buildCookieOptions());

    sendSuccess(res, {
      accessToken: payload.accessToken,
      user: buildAuthUser(user)
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
      user: buildAuthUser(user)
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
      ...buildAuthUser(user),
      lastLoginAt: user.lastLoginAt,
      twoFactor: serializeTwoFactorStatus(user)
    });
  })
);

router.post(
  '/2fa/setup',
  authenticate(),
  asyncHandler(async (req, res) => {
    const user = await loadActiveUserOrThrow(req.user.sub);
    if (user.twoFactor?.enabled) {
      throw new AppError('Two-factor authentication is already enabled', 409, 'two_factor_already_enabled');
    }

    const secret = generateSecret();
    const backupCodes = generateBackupCodes();
    user.twoFactor = {
      ...(user.twoFactor?.toObject?.() || user.twoFactor || {}),
      enabled: false,
      pendingSecret: encryptSecret(secret),
      pendingBackupCodeHashes: buildBackupCodeHashes(backupCodes),
      pendingSetupAt: new Date()
    };
    await user.save();

    sendSuccess(res, {
      manualEntryKey: secret,
      otpauthUrl: buildOtpAuthUrl({
        email: user.email,
        secret
      }),
      backupCodes
    });
  })
);

router.post(
  '/2fa/enable',
  authenticate(),
  validateSchema(twoFactorCodeSchema),
  asyncHandler(async (req, res) => {
    const user = await loadActiveUserOrThrow(req.user.sub);
    if (user.twoFactor?.enabled) {
      throw new AppError('Two-factor authentication is already enabled', 409, 'two_factor_already_enabled');
    }
    if (!user.twoFactor?.pendingSecret?.content) {
      throw new AppError('Two-factor setup has not been started', 409, 'two_factor_setup_missing');
    }

    const pendingSecret = verifyPendingTwoFactorCode(user, req.body.code);
    user.twoFactor.enabled = true;
    user.twoFactor.secret = encryptSecret(pendingSecret);
    user.twoFactor.backupCodeHashes = [...(user.twoFactor.pendingBackupCodeHashes || [])];
    user.twoFactor.pendingSecret = undefined;
    user.twoFactor.pendingBackupCodeHashes = [];
    user.twoFactor.pendingSetupAt = undefined;
    user.twoFactor.enabledAt = new Date();
    user.twoFactor.lastUsedAt = new Date();
    await user.save();

    sendSuccess(res, {
      enabled: true,
      backupCodesRemaining: user.twoFactor.backupCodeHashes.length
    });
  })
);

router.post(
  '/2fa/disable',
  authenticate(),
  validateSchema(twoFactorProtectedActionSchema),
  asyncHandler(async (req, res) => {
    const user = await loadActiveUserOrThrow(req.user.sub);
    if (!user.twoFactor?.enabled) {
      throw new AppError('Two-factor authentication is not enabled', 409, 'two_factor_not_enabled');
    }

    const passwordMatches = await bcrypt.compare(req.body.password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError('Password is incorrect', 401, 'invalid_credentials');
    }

    await verifyEnabledTwoFactorCode(user, req.body.code);
    user.twoFactor = {
      enabled: false,
      backupCodeHashes: [],
      pendingBackupCodeHashes: []
    };
    await user.save();

    sendSuccess(res, {
      enabled: false
    });
  })
);

router.post(
  '/2fa/recovery-codes/regenerate',
  authenticate(),
  validateSchema(twoFactorProtectedActionSchema),
  asyncHandler(async (req, res) => {
    const user = await loadActiveUserOrThrow(req.user.sub);
    if (!user.twoFactor?.enabled) {
      throw new AppError('Two-factor authentication is not enabled', 409, 'two_factor_not_enabled');
    }

    const passwordMatches = await bcrypt.compare(req.body.password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError('Password is incorrect', 401, 'invalid_credentials');
    }

    await verifyEnabledTwoFactorCode(user, req.body.code);
    const backupCodes = generateBackupCodes();
    user.twoFactor.backupCodeHashes = buildBackupCodeHashes(backupCodes);
    await user.save();

    sendSuccess(res, {
      backupCodes,
      backupCodesRemaining: backupCodes.length
    });
  })
);

module.exports = router;
