const jwt = require('jsonwebtoken');
const request = require('supertest');
const { buildExpressApp, errorHandler, notFoundHandler } = require('@pulseroom/common');

jest.mock('../models/Poll', () => ({
  find: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../models/Question', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  create: jest.fn()
}));

jest.mock('../models/Announcement', () => ({
  find: jest.fn(),
  create: jest.fn()
}));

jest.mock('../models/ReactionCounter', () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

jest.mock('../models/StreamSession', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn()
}));

jest.mock('../models/EngagementMinute', () => ({
  find: jest.fn()
}));

const Poll = require('../models/Poll');
const liveRoutes = require('./liveRoutes');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn()
};

logger.child.mockImplementation(() => logger);

const authHeader = () => {
  const token = jwt.sign(
    {
      sub: 'user-1',
      role: 'attendee',
      email: 'user@example.com'
    },
    process.env.JWT_ACCESS_SECRET
  );

  return `Bearer ${token}`;
};

const buildApp = ({ eventMeta }) => {
  const app = buildExpressApp({
    serviceName: 'live-service-test',
    logger,
    corsOrigin: true
  });

  app.use((req, _res, next) => {
    req.eventBus = {
      publish: jest.fn().mockResolvedValue(undefined)
    };
    req.io = {
      to: jest.fn(() => ({
        emit: jest.fn()
      }))
    };
    req.services = {
      recordingUploadService: {
        startUpload: jest.fn(),
        appendChunk: jest.fn(),
        finalizeUpload: jest.fn(),
        abortUpload: jest.fn()
      }
    };
    req.clients = {
      eventService: {
        get: jest.fn().mockResolvedValue({
          data: {
            data: eventMeta
          }
        })
      },
      bookingService: {
        get: jest.fn()
      }
    };
    next();
  });

  app.use('/api/live', liveRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

describe('liveRoutes private event access', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks attendees from loading live polls for private events they are not assigned to', async () => {
    const app = buildApp({
      eventMeta: {
        eventId: 'event-1',
        organizerId: 'organizer-1',
        visibility: 'private',
        speakers: [],
        teamMembers: []
      }
    });

    const response = await request(app)
      .get('/api/live/event-1/polls')
      .set('Authorization', authHeader());

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('event_private');
    expect(Poll.find).not.toHaveBeenCalled();
  });
});
