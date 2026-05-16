jest.mock('../models/RefreshToken', () => ({
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn()
}));

const RefreshToken = require('../models/RefreshToken');
const { hashToken, rotateRefreshToken } = require('./tokenService');

describe('tokenService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rotates refresh sessions with a single atomic revocation step', async () => {
    RefreshToken.findOneAndUpdate.mockResolvedValue({ _id: 'session-1' });
    RefreshToken.create.mockResolvedValue({});

    const nextToken = await rotateRefreshToken(
      'refresh-token-1',
      { userId: 'user-1' },
      {
        headers: {
          'user-agent': 'jest'
        },
        ip: '127.0.0.1'
      }
    );

    expect(RefreshToken.findOneAndUpdate).toHaveBeenCalledWith(
      {
        tokenHash: hashToken('refresh-token-1'),
        revokedAt: { $exists: false },
        expiresAt: {
          $gt: expect.any(Date)
        }
      },
      {
        $set: {
          revokedAt: expect.any(Date)
        }
      },
      {
        new: true
      }
    );
    expect(RefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
        userAgent: 'jest',
        ipAddress: '127.0.0.1'
      })
    );
    expect(typeof nextToken).toBe('string');
    expect(nextToken).toHaveLength(96);
  });

  it('returns null when the refresh session is already consumed or expired', async () => {
    RefreshToken.findOneAndUpdate.mockResolvedValue(null);

    const nextToken = await rotateRefreshToken(
      'refresh-token-2',
      { userId: 'user-2' },
      {
        headers: {},
        ip: '127.0.0.1'
      }
    );

    expect(nextToken).toBeNull();
    expect(RefreshToken.create).not.toHaveBeenCalled();
  });
});
