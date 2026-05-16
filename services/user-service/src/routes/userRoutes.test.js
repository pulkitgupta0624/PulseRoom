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

describe('userRoutes organizer handles', () => {
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
});
