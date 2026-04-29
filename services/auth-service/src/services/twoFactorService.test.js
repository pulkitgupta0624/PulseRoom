const {
  buildBackupCodeHashes,
  encryptSecret,
  decryptSecret,
  generateSecret,
  generateTotpCode,
  verifyEnabledTwoFactorCode,
  verifyPendingTwoFactorCode
} = require('./twoFactorService');

describe('twoFactorService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('round-trips encrypted secrets', () => {
    const secret = generateSecret();
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('verifies pending TOTP codes', () => {
    const secret = generateSecret();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_710_000_000_000);
    const code = generateTotpCode({
      secret,
      timestamp: Date.now()
    });

    const resolvedSecret = verifyPendingTwoFactorCode(
      {
        twoFactor: {
          pendingSecret: encryptSecret(secret)
        }
      },
      code
    );

    expect(nowSpy).toBeDefined();
    expect(resolvedSecret).toBe(secret);
  });

  it('consumes backup codes when no TOTP code is provided', async () => {
    const secret = generateSecret();
    const backupCodes = ['ABCD-EFGH'];
    const user = {
      twoFactor: {
        secret: encryptSecret(secret),
        backupCodeHashes: buildBackupCodeHashes(backupCodes)
      },
      save: jest.fn().mockResolvedValue(undefined)
    };

    const result = await verifyEnabledTwoFactorCode(user, 'abcd efgh');

    expect(result).toEqual({
      method: 'backup_code',
      remainingBackupCodes: 0
    });
    expect(user.twoFactor.backupCodeHashes).toEqual([]);
    expect(user.save).toHaveBeenCalledTimes(1);
  });
});
