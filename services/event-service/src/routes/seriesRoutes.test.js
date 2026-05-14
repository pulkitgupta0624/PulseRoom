const jwt = require('jsonwebtoken');
const request = require('supertest');
const { buildExpressApp, errorHandler, notFoundHandler } = require('@pulseroom/common');

jest.mock('../models/Event', () => ({
  find: jest.fn()
}));

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
const SeriesMembership = require('../models/SeriesMembership');
const SeriesMembershipPurchase = require('../models/SeriesMembershipPurchase');
const { normalizeSeriesMembershipSettings } = require('../services/seriesService');
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
});
