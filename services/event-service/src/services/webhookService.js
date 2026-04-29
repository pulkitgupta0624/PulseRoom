const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const Redis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const { AppError, DomainEvents } = require('@pulseroom/common');
const WebhookEndpoint = require('../models/WebhookEndpoint');

const WEBHOOK_QUEUE = 'event-webhook-deliveries';

const WEBHOOK_EVENT_OPTIONS = [
  {
    event: DomainEvents.BOOKING_CONFIRMED,
    label: 'Booking confirmed'
  },
  {
    event: DomainEvents.BOOKING_CANCELLED,
    label: 'Booking cancelled'
  },
  {
    event: DomainEvents.EVENT_UPDATED,
    label: 'Event updated'
  },
  {
    event: DomainEvents.EVENT_PUBLISHED,
    label: 'Event published'
  },
  {
    event: DomainEvents.EVENT_COMPLETED,
    label: 'Event completed'
  },
  {
    event: DomainEvents.SPONSOR_ACTIVATED,
    label: 'Sponsor activated'
  }
];

const SUPPORTED_WEBHOOK_EVENTS = new Set(WEBHOOK_EVENT_OPTIONS.map((item) => item.event));

const BLOCKED_WEBHOOK_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal'
]);

const generateWebhookSigningSecret = () => crypto.randomBytes(24).toString('hex');

const signWebhookPayload = ({ signingSecret, rawBody }) =>
  crypto.createHmac('sha256', signingSecret).update(rawBody).digest('hex');

const serializeWebhookEndpoint = (endpoint) => {
  const raw = typeof endpoint.toObject === 'function' ? endpoint.toObject() : { ...endpoint };
  delete raw.signingSecret;
  return raw;
};

const parseIpv4 = (address) => {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return octets;
};

const isPrivateIpv4 = (address) => {
  const octets = parseIpv4(address);
  if (!octets) {
    return true;
  }

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
};

const isPrivateIpv6 = (address) => {
  const normalized = address.toLowerCase();
  const ipv4MappedDottedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4MappedDottedMatch) {
    return isPrivateIpv4(ipv4MappedDottedMatch[1]);
  }

  const ipv4MappedHexMatch = normalized.match(/^(?:0:0:0:0:0:ffff|::ffff):([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (ipv4MappedHexMatch) {
    const high = parseInt(ipv4MappedHexMatch[1], 16);
    const low = parseInt(ipv4MappedHexMatch[2], 16);
    return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }

  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:')
  ) {
    return true;
  }

  return false;
};

const isPrivateAddress = (address) => {
  const version = net.isIP(address);
  if (version === 4) {
    return isPrivateIpv4(address);
  }
  if (version === 6) {
    return isPrivateIpv6(address);
  }
  return true;
};

const normalizeWebhookHostname = (hostname) =>
  hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

const isBlockedHostname = (hostname) => {
  const normalized = normalizeWebhookHostname(hostname);
  return (
    BLOCKED_WEBHOOK_HOSTNAMES.has(normalized) ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
  );
};

const validateWebhookTargetUrl = async (targetUrl) => {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (_error) {
    throw new AppError('Webhook URL is invalid', 422, 'webhook_target_invalid');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError('Webhook URL must use http or https', 422, 'webhook_target_invalid');
  }

  if (parsed.username || parsed.password) {
    throw new AppError('Webhook URL must not contain credentials', 422, 'webhook_target_invalid');
  }

  const hostname = normalizeWebhookHostname(parsed.hostname);
  if (!hostname || isBlockedHostname(hostname)) {
    throw new AppError('Webhook URL host is not allowed', 422, 'webhook_target_blocked');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new AppError('Webhook URL cannot target private or local networks', 422, 'webhook_target_blocked');
    }
    return parsed.toString();
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (_error) {
    throw new AppError('Webhook URL host could not be resolved', 422, 'webhook_target_unresolvable');
  }

  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new AppError('Webhook URL cannot resolve to private or local networks', 422, 'webhook_target_blocked');
  }

  return parsed.toString();
};

const createWebhookService = ({ redisUrl, logger, timeoutMs = 10_000, attempts = 5 }) => {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(WEBHOOK_QUEUE, { connection });

  const worker = new Worker(
    WEBHOOK_QUEUE,
    async (job) => {
      if (job.name !== 'deliver-webhook') {
        return;
      }

      const {
        webhookId,
        targetUrl,
        signingSecret,
        eventName,
        deliveryId,
        payload
      } = job.data;

      const rawBody = JSON.stringify(payload);
      const safeTargetUrl = await validateWebhookTargetUrl(targetUrl);
      const response = await fetch(safeTargetUrl, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'PulseRoom-Webhooks/1.0',
          'x-pulseroom-event': eventName,
          'x-pulseroom-delivery-id': deliveryId,
          'x-pulseroom-signature': signWebhookPayload({
            signingSecret,
            rawBody
          })
        },
        body: rawBody,
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        throw new Error(`Webhook endpoint responded with ${response.status}`);
      }

      await WebhookEndpoint.updateOne(
        {
          _id: webhookId
        },
        {
          $inc: {
            deliveredCount: 1
          },
          $set: {
            lastDeliveredAt: new Date(),
            lastDeliveryStatusCode: response.status,
            lastFailureAt: null,
            lastFailureMessage: null
          }
        }
      );
    },
    { connection }
  );

  worker.on('failed', async (job, error) => {
    logger.error({
      message: 'Webhook delivery failed',
      jobId: job?.id,
      error: error.message
    });

    if (!job?.data?.webhookId) {
      return;
    }

    await WebhookEndpoint.updateOne(
      {
        _id: job.data.webhookId
      },
      {
        $inc: {
          failedCount: 1
        },
        $set: {
          lastFailureAt: new Date(),
          lastFailureMessage: error.message.slice(0, 400)
        }
      }
    );
  });

  const buildWebhookPayload = ({ eventName, payload, deliveryId }) => ({
    id: deliveryId,
    type: eventName,
    createdAt: new Date().toISOString(),
    data: payload
  });

  const queueDelivery = async ({ endpoint, eventName, payload }) => {
    const deliveryId = crypto.randomUUID();
    await queue.add(
      'deliver-webhook',
      {
        webhookId: endpoint._id.toString(),
        targetUrl: endpoint.targetUrl,
        signingSecret: endpoint.signingSecret,
        eventName,
        deliveryId,
        payload: buildWebhookPayload({
          eventName,
          payload,
          deliveryId
        })
      },
      {
        jobId: `${endpoint._id.toString()}::${deliveryId}`,
        attempts,
        backoff: {
          type: 'exponential',
          delay: 10_000
        },
        removeOnComplete: true,
        removeOnFail: 100
      }
    );
  };

  const queueEventFanout = async ({ eventName, payload }) => {
    if (!SUPPORTED_WEBHOOK_EVENTS.has(eventName) || !payload?.eventId) {
      return;
    }

    const endpoints = await WebhookEndpoint.find({
      eventId: payload.eventId,
      active: true,
      subscribedEvents: eventName
    });

    await Promise.all(
      endpoints.map((endpoint) =>
        queueDelivery({
          endpoint,
          eventName,
          payload
        })
      )
    );
  };

  const queueTestDelivery = async ({ endpoint, event }) =>
    queueDelivery({
      endpoint,
      eventName: 'pulseroom.webhook.test',
      payload: {
        eventId: endpoint.eventId,
        organizerId: endpoint.organizerId,
        webhookId: endpoint._id.toString(),
        message: 'This is a test delivery from PulseRoom.',
        event
      }
    });

  return {
    queueEventFanout,
    queueTestDelivery
  };
};

module.exports = {
  WEBHOOK_EVENT_OPTIONS,
  SUPPORTED_WEBHOOK_EVENTS,
  createWebhookService,
  generateWebhookSigningSecret,
  serializeWebhookEndpoint,
  validateWebhookTargetUrl
};
