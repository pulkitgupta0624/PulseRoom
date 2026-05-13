const Stripe = require('stripe');
const { PaymentStatus } = require('@pulseroom/common');
const config = require('../config');

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

const createSeriesPaymentIntent = async ({
  amount,
  currency,
  purchaseId,
  seriesId,
  userId
}) => {
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
      purchaseId: purchaseId.toString(),
      seriesId,
      userId
    }
  });
};

const retrieveSeriesPaymentIntent = async (paymentIntentId) => {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return stripe.paymentIntents.retrieve(paymentIntentId);
};

const constructSeriesWebhookEvent = (rawBody, signature) => {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
};

const buildSeriesPaymentResponse = (purchase, paymentIntentStatus = null) => ({
  id: purchase._id,
  status: purchase.status,
  provider: purchase.provider,
  clientSecret: purchase.clientSecret,
  paymentIntentId: purchase.providerPaymentId,
  paymentIntentStatus
});

const syncSeriesPaymentStatusFromIntent = (purchase, intent) => {
  if (intent.status === 'succeeded') {
    purchase.status = PaymentStatus.SUCCEEDED;
    return;
  }

  if (intent.status === 'requires_payment_method' || intent.status === 'canceled') {
    purchase.status = PaymentStatus.FAILED;
    return;
  }

  purchase.status = PaymentStatus.REQUIRES_ACTION;
};

module.exports = {
  stripe,
  buildSeriesPaymentResponse,
  constructSeriesWebhookEvent,
  createSeriesPaymentIntent,
  retrieveSeriesPaymentIntent,
  syncSeriesPaymentStatusFromIntent
};
