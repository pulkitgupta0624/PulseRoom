const jwt = require('jsonwebtoken');
const request = require('supertest');
const { buildExpressApp, errorHandler, notFoundHandler } = require('@pulseroom/common');

jest.mock('../models/BanRecord', () => ({
  find: jest.fn(),
  create: jest.fn()
}));

jest.mock('../models/AnalyticsSnapshot', () => ({
  findOne: jest.fn()
}));

jest.mock('../models/ModerationReport', () => ({
  find: jest.fn()
}));

jest.mock('../models/SafetyIncident', () => ({
  find: jest.fn(),
  findById: jest.fn()
}));

const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const BanRecord = require('../models/BanRecord');
const ModerationReport = require('../models/ModerationReport');
const SafetyIncident = require('../models/SafetyIncident');
const adminRoutes = require('./adminRoutes');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn()
};

logger.child.mockImplementation(() => logger);

const authHeader = (role = 'admin', sub = 'admin-1') => {
  const token = jwt.sign(
    {
      sub,
      role,
      email: `${role}@example.com`
    },
    process.env.JWT_ACCESS_SECRET
  );

  return `Bearer ${token}`;
};

const buildApp = () => {
  const roomEmitters = new Map();
  const app = buildExpressApp({
    serviceName: 'admin-service-test',
    logger,
    corsOrigin: true
  });

  app.use((req, _res, next) => {
    req.io = {
      to: jest.fn((room) => {
        if (!roomEmitters.has(room)) {
          roomEmitters.set(room, {
            emit: jest.fn()
          });
        }

        return roomEmitters.get(room);
      })
    };
    req.clients = {
      userService: {
        get: jest.fn(),
        patch: jest.fn()
      },
      eventService: {
        get: jest.fn(),
        patch: jest.fn(),
        post: jest.fn()
      }
    };
    next();
  });

  app.use('/api/admin', adminRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return {
    app,
    roomEmitters
  };
};

describe('adminRoutes bans access', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns active bans for admins by default', async () => {
    const query = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: 'ban-1',
          userId: 'user-1',
          reason: 'Fraudulent activity',
          active: true
        }
      ])
    };
    BanRecord.find.mockReturnValue(query);

    const { app } = buildApp();
    const response = await request(app)
      .get('/api/admin/bans')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(BanRecord.find).toHaveBeenCalledWith({ active: true });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(query.limit).toHaveBeenCalledWith(100);
    expect(response.body.data).toEqual([
      {
        _id: 'ban-1',
        userId: 'user-1',
        reason: 'Fraudulent activity',
        active: true
      }
    ]);
  });

  it('rejects non-admins from loading bans', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get('/api/admin/bans')
      .set('Authorization', authHeader('moderator', 'mod-1'));

    expect(response.status).toBe(403);
    expect(BanRecord.find).not.toHaveBeenCalled();
  });

  it('builds dashboard safety metrics from the full incident set, not only the preview list', async () => {
    AnalyticsSnapshot.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        scope: 'global',
        metrics: {
          users: 42
        }
      })
    });
    ModerationReport.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([])
    });
    BanRecord.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([])
    });
    SafetyIncident.find
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'incident-preview-1',
            incidentType: 'chat_message',
            category: 'spam',
            severity: 'low',
            status: 'open',
            autoActions: []
          }
        ])
      })
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue([
          {
            incidentType: 'chat_message',
            category: 'spam',
            severity: 'low',
            status: 'open',
            autoActions: []
          },
          {
            incidentType: 'booking',
            category: 'booking_risk',
            severity: 'critical',
            status: 'resolved',
            autoActions: ['manual_review']
          }
        ])
      });

    const { app } = buildApp();
    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(response.body.data.recentIncidents).toHaveLength(1);
    expect(response.body.data.safetySummary).toMatchObject({
      total: 2,
      open: 1,
      resolved: 1,
      highOrCritical: 1,
      bookingRisks: 1
    });
  });

  it('broadcasts incident status updates to both admin and event safety rooms', async () => {
    const incident = {
      _id: {
        toString: () => 'incident-1'
      },
      incidentType: 'chat_message',
      category: 'spam',
      severity: 'high',
      status: 'open',
      summary: 'Flagged live message',
      eventId: 'event-1',
      targetId: 'message-1',
      resolutionNotes: '',
      resolvedBy: '',
      resolvedAt: null,
      save: jest.fn().mockResolvedValue(undefined)
    };
    SafetyIncident.findById.mockResolvedValue(incident);

    const { app, roomEmitters } = buildApp();
    const response = await request(app)
      .patch('/api/admin/incidents/incident-1')
      .set('Authorization', authHeader())
      .send({
        status: 'resolved',
        resolutionNotes: 'Handled.'
      });

    expect(response.status).toBe(200);
    expect(incident.status).toBe('resolved');
    expect(incident.resolvedBy).toBe('admin-1');
    expect(incident.save).toHaveBeenCalled();
    expect(roomEmitters.get('admins').emit).toHaveBeenCalledWith(
      'admin:safety-incident-updated',
      expect.objectContaining({
        incidentId: 'incident-1',
        eventId: 'event-1',
        status: 'resolved'
      })
    );
    expect(roomEmitters.get('event:event-1:safety').emit).toHaveBeenCalledWith(
      'event:safety-incident-updated',
      expect.objectContaining({
        incidentId: 'incident-1',
        eventId: 'event-1',
        status: 'resolved'
      })
    );
  });
});
