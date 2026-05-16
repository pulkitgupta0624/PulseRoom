const jwt = require('jsonwebtoken');
const request = require('supertest');
const { buildExpressApp, errorHandler, notFoundHandler } = require('@pulseroom/common');

jest.mock('../models/Event', () => {
  const Event = jest.fn().mockImplementation(function Event(payload) {
    return {
      ...payload,
      _id: payload?._id || 'event-new',
      save: jest.fn().mockResolvedValue(undefined)
    };
  });

  Event.find = jest.fn();
  Event.findById = jest.fn();
  Event.findOne = jest.fn();
  Event.countDocuments = jest.fn();

  return Event;
});

jest.mock('../models/EventSeries', () => ({
  findById: jest.fn()
}));

jest.mock('../models/SeriesMembership', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  aggregate: jest.fn()
}));

jest.mock('../models/SeriesMembershipPurchase', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn()
}));

jest.mock('../services/seriesService', () => ({
  applySeriesSnapshotToEvent: jest.fn(),
  buildSeriesMembershipPerksSnapshot: jest.fn(),
  buildSeriesSlug: jest.fn(),
  clearSeriesFromEvent: jest.fn(),
  cloneEventForSeries: jest.fn(),
  normalizeSeriesMembershipSettings: jest.fn(),
  serializeSeries: jest.fn((series) => series),
  serializeSeriesMembership: jest.fn((membership) => membership || null)
}));

jest.mock('../services/seriesPaymentService', () => ({
  buildSeriesPaymentResponse: jest.fn((purchase, paymentIntentStatus = null) => ({
    id: purchase._id,
    status: purchase.status,
    provider: purchase.provider,
    clientSecret: purchase.clientSecret,
    paymentIntentId: purchase.providerPaymentId,
    paymentIntentStatus
  })),
  constructSeriesWebhookEvent: jest.fn(),
  createSeriesPaymentIntent: jest.fn(),
  retrieveSeriesPaymentIntent: jest.fn(),
  syncSeriesPaymentStatusFromIntent: jest.fn()
}));

jest.mock('../services/referralService', () => ({
  ensureActiveReferralCode: jest.fn(async (event) => event),
  serializeEventForViewer: jest.fn(({ event }) => event)
}));

const EventSeries = require('../models/EventSeries');
const Event = require('../models/Event');
const SeriesMembership = require('../models/SeriesMembership');
const SeriesMembershipPurchase = require('../models/SeriesMembershipPurchase');
const {
  cloneEventForSeries,
  normalizeSeriesMembershipSettings
} = require('../services/seriesService');
const { createSeriesPaymentIntent } = require('../services/seriesPaymentService');
const seriesRoutes = require('./seriesRoutes');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn()
};

logger.child.mockImplementation(() => logger);

const buildApp = () => {
  const app = buildExpressApp({
    serviceName: 'event-service-test',
    logger,
    corsOrigin: true
  });

  app.use((req, _res, next) => {
    req.eventBus = {
      publish: jest.fn().mockResolvedValue(undefined)
    };
    req.cache = {};
    req.config = {
      paymentProvider: 'stripe'
    };
    req.services = {};
    req.clients = {};
    req.logger = logger;
    next();
  });

  app.use('/api/events', seriesRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
};

const authHeader = () => {
  const token = jwt.sign(
    {
      sub: 'user-1',
      role: 'attendee',
      email: 'user@example.com',
      name: 'User One'
    },
    process.env.JWT_ACCESS_SECRET
  );

  return `Bearer ${token}`;
};

describe('seriesRoutes checkout reuse', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    normalizeSeriesMembershipSettings.mockReturnValue({
      enabled: true,
      allowSelfJoin: true,
      price: 499,
      currency: 'INR',
      planName: 'Series Pass'
    });
  });

  it('reuses the latest pending stripe purchase instead of creating a duplicate', async () => {
    EventSeries.findById.mockResolvedValue({
      _id: 'series-1',
      organizerId: 'organizer-1',
      membershipSettings: {
        enabled: true,
        allowSelfJoin: true,
        price: 499,
        currency: 'INR',
        planName: 'Series Pass'
      }
    });
    SeriesMembership.findOne.mockResolvedValue(null);

    const pendingPurchase = {
      _id: 'purchase-1',
      seriesId: 'series-1',
      organizerId: 'organizer-1',
      userId: 'user-1',
      provider: 'stripe',
      providerPaymentId: 'pi_123',
      clientSecret: 'pi_123_secret_456',
      amount: 499,
      currency: 'INR',
      status: 'requires_action',
      seriesSnapshot: {
        name: 'Launch Series',
        slug: 'launch-series',
        planName: 'Series Pass'
      }
    };

    const sort = jest.fn().mockResolvedValue(pendingPurchase);
    SeriesMembershipPurchase.findOne.mockReturnValue({ sort });

    const app = buildApp();
    const response = await request(app)
      .post('/api/events/series/series-1/memberships/checkout')
      .set('Authorization', authHeader())
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.purchase._id).toBe('purchase-1');
    expect(response.body.data.payment.provider).toBe('stripe');
    expect(response.body.data.paymentIntent).toEqual({
      clientSecret: 'pi_123_secret_456',
      paymentIntentId: 'pi_123'
    });
    expect(SeriesMembershipPurchase.create).not.toHaveBeenCalled();
    expect(createSeriesPaymentIntent).not.toHaveBeenCalled();
  });

  it('persists a cloned draft event for a series before returning it', async () => {
    const sourceEvent = {
      _id: 'event-source-1',
      organizerId: 'organizer-1',
      title: 'Launch Night',
      startsAt: '2026-05-20T12:00:00.000Z',
      endsAt: '2026-05-20T13:00:00.000Z',
      status: 'published'
    };
    const series = {
      _id: 'series-1',
      organizerId: 'organizer-1',
      name: 'Launch Series'
    };
    const clonedPayload = {
      organizerId: 'organizer-1',
      title: 'Launch Night',
      startsAt: new Date('2026-06-20T12:00:00.000Z'),
      endsAt: new Date('2026-06-20T13:00:00.000Z'),
      status: 'draft',
      series: {
        seriesId: 'series-1',
        name: 'Launch Series'
      }
    };

    EventSeries.findById.mockResolvedValue(series);
    Event.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(sourceEvent)
    });
    Event.countDocuments.mockResolvedValue(1);
    cloneEventForSeries.mockReturnValue(clonedPayload);

    const createdEvent = {
      ...clonedPayload,
      _id: 'event-new',
      save: jest.fn().mockResolvedValue(undefined)
    };
    Event.mockImplementationOnce(function Event(payload) {
      return {
        ...payload,
        _id: 'event-new',
        save: createdEvent.save
      };
    });

    const organizerToken = jwt.sign(
      {
        sub: 'organizer-1',
        role: 'organizer',
        email: 'organizer@example.com',
        name: 'Organizer One'
      },
      process.env.JWT_ACCESS_SECRET
    );

    const app = buildApp();
    const response = await request(app)
      .post('/api/events/series/series-1/events/clone')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        startsAt: '2026-06-20T12:00:00.000Z'
      });

    expect(response.status).toBe(201);
    expect(Event).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Launch Night',
        status: 'draft'
      })
    );
    expect(createdEvent.save).toHaveBeenCalledTimes(1);
    expect(response.body.data._id).toBe('event-new');
  });
});
