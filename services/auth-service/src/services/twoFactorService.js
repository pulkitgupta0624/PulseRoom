const crypto = require('crypto');
const { AppError } = require('@pulseroom/common');
const config = require('../config');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;

const stripBase32Padding = (value) => value.replace(/=+$/g, '');

const encodeBase32 = (buffer) => {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }

  let encoded = '';
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0');
    encoded += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }

  return stripBase32Padding(encoded);
};

const decodeBase32 = (value) => {
  const normalized = stripBase32Padding(String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, ''));
  if (!normalized) {
    throw new AppError('Two-factor secret is invalid', 500, 'two_factor_secret_invalid');
  }

  let bits = '';
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new AppError('Two-factor secret is invalid', 500, 'two_factor_secret_invalid');
    }
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }

  return Buffer.from(bytes);
};

const getEncryptionKey = () =>
  crypto.createHash('sha256').update(String(config.twoFactorEncryptionKey || '')).digest();

const encryptSecret = (secret) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

  return {
    iv: iv.toString('hex'),
    content: encrypted.toString('hex'),
    tag: cipher.getAuthTag().toString('hex')
  };
};

const decryptSecret = (secretRecord) => {
  if (!secretRecord?.iv || !secretRecord?.content || !secretRecord?.tag) {
    throw new AppError('Two-factor secret is unavailable', 500, 'two_factor_secret_missing');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(secretRecord.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(secretRecord.tag, 'hex'));

  return Buffer.concat([
    decipher.update(Buffer.from(secretRecord.content, 'hex')),
    decipher.final()
  ]).toString('utf8');
};

const generateSecret = () => encodeBase32(crypto.randomBytes(20));

const buildOtpAuthUrl = ({ email, secret }) => {
  const label = encodeURIComponent(`${config.twoFactorIssuer}:${email}`);
  const issuer = encodeURIComponent(config.twoFactorIssuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
};

const createCounterBuffer = (counter) => {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  return buffer;
};

const generateTotpCode = ({ secret, timestamp = Date.now() }) => {
  const counter = Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS);
  const digest = crypto
    .createHmac('sha1', decodeBase32(secret))
    .update(createCounterBuffer(counter))
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0');
};

const normalizeNumericCode = (code) => String(code || '').replace(/\s+/g, '');

const verifyTotpCode = ({ secret, code, window = 1 }) => {
  const normalizedCode = normalizeNumericCode(code);
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  for (let offset = -window; offset <= window; offset += 1) {
    const timestamp = Date.now() + offset * TOTP_PERIOD_SECONDS * 1000;
    if (generateTotpCode({ secret, timestamp }) === normalizedCode) {
      return true;
    }
  }

  return false;
};

const generateBackupCode = () => {
  const bytes = crypto.randomBytes(8);
  let rawCode = '';
  for (const byte of bytes) {
    rawCode += BACKUP_CODE_ALPHABET[byte % BACKUP_CODE_ALPHABET.length];
  }
  return `${rawCode.slice(0, 4)}-${rawCode.slice(4, 8)}`;
};

const normalizeBackupCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const hashBackupCode = (code) =>
  crypto.createHash('sha256').update(normalizeBackupCode(code)).digest('hex');

const generateBackupCodes = (count = 8) => Array.from({ length: count }, generateBackupCode);

const buildBackupCodeHashes = (codes) => codes.map(hashBackupCode);

const verifyPendingTwoFactorCode = (user, code) => {
  const secret = decryptSecret(user?.twoFactor?.pendingSecret);
  if (!verifyTotpCode({ secret, code })) {
    throw new AppError('Two-factor code is invalid', 401, 'two_factor_code_invalid');
  }

  return secret;
};

const verifyEnabledTwoFactorCode = async (user, code) => {
  const secret = decryptSecret(user?.twoFactor?.secret);
  if (verifyTotpCode({ secret, code })) {
    user.twoFactor.lastUsedAt = new Date();
    return {
      method: 'totp',
      remainingBackupCodes: user.twoFactor.backupCodeHashes?.length || 0
    };
  }

  const normalizedBackupHash = hashBackupCode(code);
  const existingHashes = user.twoFactor.backupCodeHashes || [];
  const codeIndex = existingHashes.indexOf(normalizedBackupHash);
  if (codeIndex !== -1) {
    const nextHashes = [...existingHashes];
    nextHashes.splice(codeIndex, 1);
    user.twoFactor.backupCodeHashes = nextHashes;
    user.twoFactor.lastUsedAt = new Date();
    await user.save();

    return {
      method: 'backup_code',
      remainingBackupCodes: nextHashes.length
    };
  }

  throw new AppError('Two-factor code is invalid', 401, 'two_factor_code_invalid');
};

const serializeTwoFactorStatus = (user) => ({
  enabled: Boolean(user?.twoFactor?.enabled),
  backupCodesRemaining: user?.twoFactor?.backupCodeHashes?.length || 0,
  hasPendingSetup: Boolean(user?.twoFactor?.pendingSecret?.content)
});

module.exports = {
  buildBackupCodeHashes,
  buildOtpAuthUrl,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateSecret,
  generateTotpCode,
  serializeTwoFactorStatus,
  verifyEnabledTwoFactorCode,
  verifyTotpCode,
  verifyPendingTwoFactorCode
};
