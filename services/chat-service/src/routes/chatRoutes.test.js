const jwt = require('jsonwebtoken');
const request = require('supertest');
const { buildExpressApp, errorHandler, notFoundHandler } = require('@pulseroom/common');

jest.mock('../models/Message', () => ({
  find: jest.fn(),
  create: jest.fn(),
  aggregate: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../models/ChatRestriction', () => ({
  find: jest.fn(),
  create: jest.fn()
}));

jest.mock('../models/EventChatPolicy', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

const Message = require('../models/Message');
const chatRoutes = require('./chatRoutes');

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
    serviceName: 'chat-service-test',
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
    req.clients = {
      eventService: {
        get: jest.fn().mockResolvedValue({
          data: {
            data: eventMeta
          }
        })
      }
    };
    next();
  });

  app.use('/api/chat', chatRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

describe('chatRoutes private event access', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks attendees from loading chat for private events they are not assigned to', async () => {
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
      .get('/api/chat/event/event-1/messages')
      .set('Authorization', authHeader());

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('event_private');
    expect(Message.find).not.toHaveBeenCalled();
  });
});
