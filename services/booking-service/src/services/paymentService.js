const Stripe = require('stripe');
const config = require('../config');

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

const createPaymentIntent = async ({ amount, currency, bookingId, eventId, tierId }) => {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: currency.toLowerCase(),
    automatic_payment_methods: {
      enabled: true
    },
    metadata: {
      bookingId: bookingId.toString(),
      eventId,
      tierId
    }
  });
};

const createRefund = async (paymentIntentId) => {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return stripe.refunds.create({
    payment_intent: paymentIntentId
  });
};

const constructWebhookEvent = (rawBody, signature) => {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
};

module.exports = {
  stripe,
  createPaymentIntent,
  createRefund,
  constructWebhookEvent
};

