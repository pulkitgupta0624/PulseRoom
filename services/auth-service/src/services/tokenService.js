const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../models/RefreshToken');
const config = require('../config');

const getRefreshTokenExpiry = () => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.jwtRefreshExpiresInDays);
  return expiresAt;
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createAccessToken = (user) =>
  jwt.sign(
    {
      sub: user.userId,
      email: user.email,
      role: user.role,
      permissions: user.permissions || []
    },
    config.jwtAccessSecret,
    {
      expiresIn: config.jwtAccessExpiresIn
    }
  );

const createTwoFactorChallengeToken = (user) =>
  jwt.sign(
    {
      sub: user.userId,
      purpose: 'login.2fa'
    },
    config.twoFactorChallengeSecret,
    {
      expiresIn: config.twoFactorChallengeExpiresIn
    }
  );

const verifyTwoFactorChallengeToken = (token) =>
  jwt.verify(token, config.twoFactorChallengeSecret);

const createRefreshSession = async (user, req) => {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  await RefreshToken.create({
    userId: user.userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: getRefreshTokenExpiry(),
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip
  });

  return refreshToken;
};

const rotateRefreshToken = async (token, user, req) => {
  const tokenHash = hashToken(token);
  const existingSession = await RefreshToken.findOne({
    tokenHash,
    revokedAt: { $exists: false }
  });

  if (!existingSession || existingSession.expiresAt < new Date()) {
    return null;
  }

  existingSession.revokedAt = new Date();
  await existingSession.save();

  return createRefreshSession(user, req);
};

const revokeRefreshToken = async (token) => {
  if (!token) {
    return;
  }

  await RefreshToken.updateOne(
    {
      tokenHash: hashToken(token)
    },
    {
      revokedAt: new Date()
    }
  );
};

const buildAuthPayload = async (user, req) => {
  const accessToken = createAccessToken(user);
  const refreshToken = await createRefreshSession(user, req);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.userId,
      email: user.email,
      role: user.role,
      permissions: user.permissions || []
    }
  };
};

module.exports = {
  hashToken,
  createAccessToken,
  createTwoFactorChallengeToken,
  createRefreshSession,
  rotateRefreshToken,
  revokeRefreshToken,
  buildAuthPayload,
  verifyTwoFactorChallengeToken
};
