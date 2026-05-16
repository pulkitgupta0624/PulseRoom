const jwt = require('jsonwebtoken');
const request = require('supertest');
const { buildExpressApp, errorHandler, notFoundHandler } = require('@pulseroom/common');

jest.mock('../models/UserProfile', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

jest.mock('../models/OrganizerVerificationRequest', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn()
}));

const UserProfile = require('../models/UserProfile');
const userRoutes = require('./userRoutes');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn()
};

logger.child.mockImplementation(() => logger);

const buildApp = () => {
  const app = buildExpressApp({
    serviceName: 'user-service-test',
    logger,
    corsOrigin: true
  });

  app.use((req, _res, next) => {
    req.eventBus = {
      publish: jest.fn().mockResolvedValue(undefined)
    };
    req.logger = logger;
    next();
  });

  app.use('/api/users', userRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

const authHeader = (overrides = {}) => {
  const token = jwt.sign(
    {
      sub: 'viewer-1',
      role: 'attendee',
      email: 'viewer@example.com',
      ...overrides
    },
    process.env.JWT_ACCESS_SECRET
  );

  return `Bearer ${token}`;
};

describe('userRoutes organizer handles', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves an organizer by public handle when the profile is active', async () => {
    UserProfile.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          userId: 'organizer-1',
          displayName: 'Organizer One',
          role: 'organizer',
          isActive: true,
          followersCount: 12,
          organizerProfile: {
            branding: {
              publicHandle: 'pukibrand'
            }
          }
        })
      })
    });

    const app = buildApp();

    const response = await request(app).get('/api/users/organizers/handle/pukibrand');

    expect(response.status).toBe(200);
    expect(response.body.data.userId).toBe('organizer-1');
    expect(response.body.data.publicHubPath).toBe('/studio/pukibrand');
    expect(response.body.data.isFollowableOrganizer).toBe(true);
  });

  it('does not mark attendee profiles as followable organizers', async () => {
    UserProfile.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          userId: 'attendee-1',
          displayName: 'Attendee One',
          role: 'attendee',
          isActive: true,
          followersCount: 0
        })
      })
    });

    const app = buildApp();
    const response = await request(app).get('/api/users/profile/attendee-1');

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('attendee');
    expect(response.body.data.isFollowableOrganizer).toBe(false);
    expect(response.body.data.canFollowOrganizer).toBe(false);
  });

  it('rejects follow attempts against non-organizer profiles', async () => {
    UserProfile.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          userId: 'viewer-1'
        })
      })
      .mockResolvedValueOnce({
        userId: 'attendee-1',
        role: 'attendee',
        isActive: true
      });

    const app = buildApp();
    const response = await request(app)
      .post('/api/users/organizers/attendee-1/follow')
      .set('Authorization', authHeader())
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('organizer_not_found');
  });

  it('returns the current organizer follower list', async () => {
    UserProfile.findOne.mockResolvedValue({
      userId: 'organizer-1',
      displayName: 'Organizer One',
      role: 'organizer',
      isActive: true,
      followersCount: 2,
      organizerProfile: {
        branding: {
          publicHandle: 'organizer-one'
        }
      }
    });

    UserProfile.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              userId: 'attendee-1',
              displayName: 'Attendee One',
              avatarUrl: '',
              bio: 'First follower',
              role: 'attendee',
              location: 'Jaipur'
            },
            {
              userId: 'attendee-2',
              displayName: 'Attendee Two',
              avatarUrl: '',
              bio: '',
              role: 'attendee',
              location: ''
            }
          ])
        })
      })
    });

    const app = buildApp();
    const response = await request(app)
      .get('/api/users/me/followers')
      .set(
        'Authorization',
        authHeader({
          sub: 'organizer-1',
          role: 'organizer',
          email: 'organizer@example.com'
        })
      );

    expect(response.status).toBe(200);
    expect(response.body.data.organizer.userId).toBe('organizer-1');
    expect(response.body.data.organizer.followersCount).toBe(2);
    expect(response.body.data.followers).toHaveLength(2);
    expect(response.body.data.followers[0]).toEqual(
      expect.objectContaining({
        userId: 'attendee-1',
        displayName: 'Attendee One',
        role: 'attendee',
        location: 'Jaipur'
      })
    );
    expect(response.body.data.followers[0].email).toBeUndefined();
  });
});
