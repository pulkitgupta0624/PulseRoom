const jwt = require('jsonwebtoken');
const request = require('supertest');
const { buildExpressApp, errorHandler, notFoundHandler } = require('@pulseroom/common');

jest.mock('../config', () => ({
  paymentProvider: 'stripe',
  stripeSecretKey: 'sk_test_123',
  stripeWebhookSecret: 'whsec_test_123',
  appOrigin: 'http://localhost:5173',
  corsOrigin: true,
  reportingCurrency: 'USD'
}));

jest.mock('../models/Booking', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  exists: jest.fn(),
  find: jest.fn(),
  aggregate: jest.fn(),
  create: jest.fn()
}));

jest.mock('../models/Payment', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn()
}));

jest.mock('../models/WaitlistEntry', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock('../services/paymentService', () => ({
  createPaymentIntent: jest.fn(),
  createRefund: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  constructWebhookEvent: jest.fn()
}));

jest.mock('../services/ticketService', () => ({
  buildBookingTickets: jest.fn(),
  findTicketById: jest.fn(),
  findTicketByToken: jest.fn(),
  getCheckedInTicketCount: jest.fn(),
  serializeBooking: jest.fn((booking) => ({
    ...booking,
    ticketCount: Number(booking.quantity || 0)
  })),
  syncBookingTickets: jest.fn(() => ({
    changed: false
  }))
}));

const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const { createPaymentIntent } = require('../services/paymentService');
const bookingRoutes = require('./bookingRoutes');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn()
};

logger.child.mockImplementation(() => logger);

const buildApp = (clients = {}) => {
  const app = buildExpressApp({
    serviceName: 'booking-service-test',
    logger,
    corsOrigin: true
  });

  app.use((req, _res, next) => {
    req.eventBus = {
      publish: jest.fn().mockResolvedValue(undefined)
    };
    req.automationService = {
      getMyWaitlistEntry: jest.fn(),
      getOfferForUser: jest.fn(),
      scheduleBookingExpiration: jest.fn(),
      markWaitlistEntryClaimed: jest.fn(),
      markWaitlistEntryFulfilled: jest.fn(),
      releasePromoReservationForBooking: jest.fn()
    };
    req.cache = {};
    req.services = {};
    req.config = {
      paymentProvider: 'stripe',
      stripeSecretKey: 'sk_test_123',
      reportingCurrency: 'USD'
    };
    req.clients = {
      eventService: {
        get: jest.fn(),
        post: jest.fn()
      },
      userService: {
        get: jest.fn()
      },
      gamificationService: {
        get: jest.fn()
      },
      ...clients
    };
    req.logger = logger;
    next();
  });

  app.use('/api/bookings', bookingRoutes);
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

describe('bookingRoutes checkout resume', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses an active pending stripe checkout instead of creating a duplicate booking', async () => {
    const pendingBooking = {
      _id: 'booking-1',
      paymentId: 'payment-1',
      eventId: 'event-1',
      tierId: 'vip-tier',
      tierName: 'VIP',
      quantity: 2,
      amount: 1200,
      currency: 'INR',
      status: 'pending',
      attendee: {
        name: 'User One',
        email: 'user@example.com'
      },
      eventSnapshot: {
        title: 'Pulse Summit'
      }
    };
    const pendingPayment = {
      _id: 'payment-1',
      bookingId: 'booking-1',
      provider: 'stripe',
      providerPaymentId: 'pi_123',
      clientSecret: 'pi_123_secret_456',
      status: 'requires_action',
      amount: 1200,
      currency: 'INR',
      save: jest.fn().mockResolvedValue(undefined)
    };

    const sort = jest.fn().mockResolvedValue(pendingBooking);
    Booking.findOne.mockReturnValue({ sort });
    Payment.findById.mockResolvedValue(pendingPayment);

    const eventServiceClient = {
      get: jest.fn(),
      post: jest.fn()
    };
    const app = buildApp({
      eventService: eventServiceClient
    });

    const response = await request(app)
      .post('/api/bookings/checkout')
      .set('Authorization', authHeader())
      .send({
        eventId: 'event-1',
        tierId: 'vip-tier',
        quantity: 2,
        attendee: {
          name: 'User One',
          email: 'user@example.com'
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.data.booking._id).toBe('booking-1');
    expect(response.body.data.payment.provider).toBe('stripe');
    expect(response.body.data.paymentIntent).toEqual({
      clientSecret: 'pi_123_secret_456',
      paymentIntentId: 'pi_123'
    });
    expect(response.body.data.resumedExistingBooking).toBe(true);
    expect(Booking.create).not.toHaveBeenCalled();
    expect(createPaymentIntent).not.toHaveBeenCalled();
    expect(eventServiceClient.get).not.toHaveBeenCalled();
  });

  it('rebuilds a missing stripe intent for an active pending booking instead of creating a new booking', async () => {
    const pendingBooking = {
      _id: 'booking-2',
      paymentId: 'payment-2',
      eventId: 'event-1',
      tierId: 'general-tier',
      tierName: 'General',
      quantity: 1,
      amount: 499,
      currency: 'INR',
      status: 'pending',
      attendee: {
        name: 'User One',
        email: 'user@example.com'
      },
      eventSnapshot: {
        title: 'Pulse Summit'
      }
    };
    const pendingPayment = {
      _id: 'payment-2',
      bookingId: 'booking-2',
      provider: 'stripe',
      providerPaymentId: null,
      clientSecret: null,
      status: 'created',
      amount: 499,
      currency: 'INR',
      save: jest.fn().mockResolvedValue(undefined)
    };

    const sort = jest.fn().mockResolvedValue(pendingBooking);
    Booking.findOne.mockReturnValue({ sort });
    Payment.findById.mockResolvedValue(pendingPayment);
    createPaymentIntent.mockResolvedValue({
      id: 'pi_new_123',
      client_secret: 'pi_new_123_secret_456'
    });

    const eventServiceClient = {
      get: jest.fn(),
      post: jest.fn()
    };
    const app = buildApp({
      eventService: eventServiceClient
    });

    const response = await request(app)
      .post('/api/bookings/checkout')
      .set('Authorization', authHeader())
      .send({
        eventId: 'event-1',
        tierId: 'general-tier',
        quantity: 1,
        attendee: {
          name: 'User One',
          email: 'user@example.com'
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.data.booking._id).toBe('booking-2');
    expect(response.body.data.paymentIntent).toEqual({
      clientSecret: 'pi_new_123_secret_456',
      paymentIntentId: 'pi_new_123'
    });
    expect(response.body.data.resumedExistingBooking).toBe(true);
    expect(createPaymentIntent).toHaveBeenCalledWith({
      amount: 499,
      currency: 'INR',
      bookingId: 'booking-2',
      eventId: 'event-1',
      tierId: 'general-tier'
    });
    expect(pendingPayment.providerPaymentId).toBe('pi_new_123');
    expect(pendingPayment.clientSecret).toBe('pi_new_123_secret_456');
    expect(pendingPayment.status).toBe('requires_action');
    expect(pendingPayment.save).toHaveBeenCalled();
    expect(Booking.create).not.toHaveBeenCalled();
    expect(eventServiceClient.get).not.toHaveBeenCalled();
  });
});
