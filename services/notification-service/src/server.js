const Redis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const {
  connectMongo,
  RedisEventBus,
  NotificationChannel,
  DomainEvents,
  createServiceClient
} = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const Notification = require('./models/Notification');
const EventAudience = require('./models/EventAudience');
const { sendEmail } = require('./services/mailer');
const {
  buildCertificateFileName,
  generateCertificatePdf
} = require('./services/certificateService');

const createNotification = async ({
  userId,
  eventId,
  type,
  title,
  body,
  channel = NotificationChannel.IN_APP,
  email,
  metadata = {}
}) =>
  Notification.create({
    userId,
    eventId,
    type,
    title,
    body,
    channel,
    email,
    metadata,
    sentAt: channel === NotificationChannel.IN_APP ? new Date() : undefined
  });

const queueEmailHtml = (body) => `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;">${body}</p>`;

const start = async () => {
  await connectMongo(config.mongoUri, logger);

  const userServiceClient = createServiceClient(config.userServiceUrl, 'notification-service');
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('notification-jobs', {
    connection
  });

  const worker = new Worker(
    'notification-jobs',
    async (job) => {
      if (job.name === 'send-email') {
        await sendEmail(job.data);
      }

      if (job.name === 'create-reminder') {
        const reminder = await createNotification({
          userId: job.data.userId,
          eventId: job.data.eventId,
          email: job.data.email,
          type: 'event.reminder',
          title: `Reminder: ${job.data.eventTitle} starts soon`,
          body: `Your event starts at ${new Date(job.data.eventStartsAt).toLocaleString()}.`,
          channel: NotificationChannel.IN_APP
        });

        await queue.add('send-email', {
          to: job.data.email,
          subject: reminder.title,
          html: queueEmailHtml(reminder.body)
        });
      }

      if (job.name === 'send-certificate') {
        const pdf = await generateCertificatePdf(job.data);
        await sendEmail({
          to: job.data.email,
          subject: `Your certificate for ${job.data.eventTitle}`,
          html: queueEmailHtml(
            `Thank you for attending ${job.data.eventTitle}. Your certificate of attendance is attached to this email.`
          ),
          attachments: [
            {
              filename: buildCertificateFileName(job.data),
              content: pdf
            }
          ]
        });
      }
    },
    {
      connection
    }
  );

  worker.on('failed', (job, error) => {
    logger.error({
      message: 'Notification job failed',
      jobId: job?.id,
      error: error.message
    });
  });

  const eventBus = new RedisEventBus({
    redisUrl: config.redisUrl,
    serviceName: 'notification-service',
    logger
  });

  const resolveOrganizerSignature = async (payload) => {
    if (payload.organizerSignatureName) {
      return payload.organizerSignatureName;
    }

    if (!payload.organizerId) {
      return 'PulseRoom Organizer';
    }

    try {
      const response = await userServiceClient.get(`/api/users/profile/${payload.organizerId}`);
      const profile = response.data.data;
      return (
        profile.organizerProfile?.companyName ||
        profile.displayName ||
        'PulseRoom Organizer'
      );
    } catch (_error) {
      return 'PulseRoom Organizer';
    }
  };

  await eventBus.subscribe(
    [
      DomainEvents.BOOKING_CONFIRMED,
      DomainEvents.EVENT_PUBLISHED,
      DomainEvents.EVENT_UPDATED,
      DomainEvents.ANNOUNCEMENT_POSTED,
      DomainEvents.WAITLIST_JOINED,
      DomainEvents.WAITLIST_SPOT_OFFERED,
      DomainEvents.WAITLIST_SPOT_EXPIRED,
      DomainEvents.EVENT_COMPLETED
    ],
    async ({ event, payload }) => {
      if (event === DomainEvents.BOOKING_CONFIRMED) {
        await EventAudience.findOneAndUpdate(
          {
            eventId: payload.eventId,
            userId: payload.userId
          },
          {
            eventId: payload.eventId,
            userId: payload.userId,
            email: payload.attendeeEmail,
            attendeeName: payload.attendeeName,
            organizerId: payload.organizerId,
            eventTitle: payload.eventTitle,
            eventStartsAt: payload.eventStartsAt
          },
          {
            upsert: true,
            new: true
          }
        );

        const notification = await createNotification({
          userId: payload.userId,
          eventId: payload.eventId,
          email: payload.attendeeEmail,
          type: 'booking.confirmed',
          title: `Booking confirmed for ${payload.eventTitle}`,
          body: 'Your booking is confirmed. We will remind you before the event starts.',
          channel: NotificationChannel.IN_APP,
          metadata: {
            bookingId: payload.bookingId
          }
        });

        await queue.add('send-email', {
          to: payload.attendeeEmail,
          subject: notification.title,
          html: queueEmailHtml(notification.body)
        });

        const reminderDelay = new Date(payload.eventStartsAt).getTime() - Date.now() - 60 * 60 * 1000;
        if (reminderDelay > 0) {
          await queue.add(
            'create-reminder',
            {
              userId: payload.userId,
              eventId: payload.eventId,
              email: payload.attendeeEmail,
              eventTitle: payload.eventTitle,
              eventStartsAt: payload.eventStartsAt
            },
            {
              delay: reminderDelay
            }
          );
        }
      }

      if (event === DomainEvents.WAITLIST_JOINED) {
        await createNotification({
          userId: payload.userId,
          eventId: payload.eventId,
          email: payload.attendeeEmail,
          type: 'waitlist.joined',
          title: `You joined the waitlist for ${payload.eventTitle}`,
          body: `We will let you know as soon as a ${payload.tierName} spot becomes available.`
        });
      }

      if (event === DomainEvents.WAITLIST_SPOT_OFFERED) {
        const title = `A ${payload.tierName} ticket is available for ${payload.eventTitle}`;
        const body = `Your waitlist spot is ready. Claim it within 15 minutes before it moves to the next attendee.`;

        await createNotification({
          userId: payload.userId,
          eventId: payload.eventId,
          email: payload.attendeeEmail,
          type: 'waitlist.spot_offered',
          title,
          body,
          metadata: {
            claimUrl: payload.claimUrl,
            ctaLabel: 'Claim spot',
            offerExpiresAt: payload.offerExpiresAt
          }
        });

        if (payload.attendeeEmail) {
          await queue.add('send-email', {
            to: payload.attendeeEmail,
            subject: title,
            html: `${queueEmailHtml(body)}<p><a href="${payload.claimUrl}">Claim your ticket</a></p>`
          });
        }
      }

      if (event === DomainEvents.WAITLIST_SPOT_EXPIRED) {
        await createNotification({
          userId: payload.userId,
          eventId: payload.eventId,
          email: payload.attendeeEmail,
          type: 'waitlist.spot_expired',
          title: `Your waitlist hold expired for ${payload.eventTitle}`,
          body: 'The 15-minute claim window ended. You can rejoin the waitlist if more spots open later.'
        });
      }

      if (event === DomainEvents.EVENT_PUBLISHED) {
        if (payload.visibility !== 'public') {
          return;
        }

        try {
          const response = await userServiceClient.get(
            `/api/users/organizers/${payload.organizerId}/followers`
          );
          const organizer = response.data.data.organizer;
          const followers = response.data.data.followers || [];
          const eventUrl = `${config.appOrigin.replace(/\/$/, '')}/events/${payload.eventId}`;
          const title = `New event from ${organizer.displayName}: ${payload.title}`;
          const startsAtLabel = new Date(payload.startsAt).toLocaleString();
          const body = `${payload.title} is now live on PulseRoom and starts at ${startsAtLabel}.`;

          for (const follower of followers) {
            await createNotification({
              userId: follower.userId,
              eventId: payload.eventId,
              email: follower.email,
              type: 'organizer.new_event',
              title,
              body,
              metadata: {
                ctaUrl: eventUrl,
                ctaLabel: 'View event',
                organizerId: payload.organizerId
              }
            });

            if (follower.email) {
              await queue.add('send-email', {
                to: follower.email,
                subject: title,
                html: `${queueEmailHtml(body)}<p><a href="${eventUrl}">View the event</a></p>`
              });
            }
          }
        } catch (error) {
          logger.warn({
            message: 'Failed to notify organizer followers',
            organizerId: payload.organizerId,
            eventId: payload.eventId,
            error: error.message
          });
        }
      }

      if (event === DomainEvents.EVENT_UPDATED || event === DomainEvents.ANNOUNCEMENT_POSTED) {
        const audience = await EventAudience.find({
          eventId: payload.eventId
        }).lean();

        for (const attendee of audience) {
          const title =
            event === DomainEvents.EVENT_UPDATED
              ? `Update for ${attendee.eventTitle || payload.title}`
              : `Live announcement for ${attendee.eventTitle || 'your event'}`;
          const body =
            event === DomainEvents.EVENT_UPDATED
              ? `${payload.title || attendee.eventTitle} has been updated. Check the latest event details.`
              : payload.body;

          await createNotification({
            userId: attendee.userId,
            eventId: attendee.eventId,
            email: attendee.email,
            type: event,
            title,
            body
          });

          if (attendee.email) {
            await queue.add('send-email', {
              to: attendee.email,
              subject: title,
              html: queueEmailHtml(body)
            });
          }
        }
      }

      if (event === DomainEvents.EVENT_COMPLETED) {
        const audience = await EventAudience.find({
          eventId: payload.eventId
        }).lean();
        const organizerSignatureName = await resolveOrganizerSignature(payload);

        for (const attendee of audience) {
          await createNotification({
            userId: attendee.userId,
            eventId: attendee.eventId,
            email: attendee.email,
            type: 'certificate.ready',
            title: `Certificate ready for ${payload.title}`,
            body: 'Your certificate of attendance has been emailed to you.',
            metadata: {
              ctaUrl: `${config.appOrigin.replace(/\/$/, '')}/bookings`,
              ctaLabel: 'View tickets'
            }
          });

          if (attendee.email) {
            await queue.add('send-certificate', {
              email: attendee.email,
              attendeeName: attendee.attendeeName || attendee.email,
              eventTitle: payload.title,
              startsAt: payload.startsAt,
              endsAt: payload.endsAt,
              organizerSignatureName
            });
          }
        }
      }
    }
  );

  const app = createApp();
  app.listen(config.port, () => {
    logger.info({
      message: 'Notification service started',
      port: config.port
    });
  });
};

start().catch((error) => {
  logger.error({
    message: 'Failed to start notification service',
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
