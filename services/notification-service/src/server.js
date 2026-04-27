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
const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildSponsorEmailSection = (sponsors = []) => {
  if (!sponsors.length) {
    return '';
  }

  const items = sponsors
    .map((sponsor) => {
      const ctaUrl = sponsor.boothUrl || sponsor.websiteUrl;
      return `
        <div style="padding:14px 0;border-top:1px solid #ece7e1;">
          <div style="display:flex;gap:14px;align-items:flex-start;">
            ${sponsor.logoUrl
              ? `<img src="${escapeHtml(sponsor.logoUrl)}" alt="${escapeHtml(sponsor.companyName)}" style="width:64px;height:64px;object-fit:contain;border-radius:12px;border:1px solid #ece7e1;padding:8px;background:#ffffff;" />`
              : ''}
            <div>
              <p style="margin:0 0 6px;font-weight:700;color:#1f2937;">${escapeHtml(sponsor.companyName)}</p>
              ${sponsor.description ? `<p style="margin:0 0 8px;color:#4b5563;">${escapeHtml(sponsor.description)}</p>` : ''}
              ${ctaUrl ? `<a href="${escapeHtml(ctaUrl)}" style="color:#0f766e;font-weight:600;text-decoration:none;">Visit sponsor booth</a>` : ''}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div style="margin-top:28px;padding-top:6px;">
      <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6b7280;">Event sponsors</p>
      ${items}
    </div>
  `;
};

const buildSponsorApprovalEmail = (payload) => {
  const amountLine =
    payload.amount !== undefined && payload.amount !== null
      ? `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;margin:14px 0 0;">Amount due: <strong>${escapeHtml(`${payload.currency || 'INR'} ${payload.amount}`)}</strong></p>`
      : '';

  const paymentLinkBlock = payload.paymentLinkUrl
    ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(payload.paymentLinkUrl)}" style="display:inline-block;background:#111827;color:#f9fafb;text-decoration:none;padding:12px 18px;border-radius:9999px;font-weight:700;">Complete sponsor payment</a></p>`
    : '';

  const instructionsBlock = payload.paymentInstructions
    ? `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;margin:16px 0 0;"><strong>Payment instructions:</strong><br />${escapeHtml(payload.paymentInstructions).replace(/\n/g, '<br />')}</p>`
    : '';

  const fallbackBlock = !payload.paymentLinkUrl && !payload.paymentInstructions
    ? queueEmailHtml('The organizer will share payment instructions with you shortly. Once payment is confirmed, your sponsor placement will go live.')
    : '';

  return `${queueEmailHtml(
    `Great news ${payload.contactName || 'there'}! Your ${payload.packageName} sponsor application for ${payload.eventTitle} has been approved.`
  )}${amountLine}${paymentLinkBlock}${instructionsBlock}${fallbackBlock}`;
};

const start = async () => {
  await connectMongo(config.mongoUri, logger);

  const userServiceClient = createServiceClient(config.userServiceUrl, 'notification-service');
  const eventServiceClient = createServiceClient(config.eventServiceUrl, 'notification-service');
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

  const loadEmailSponsors = async (eventId) => {
    if (!eventId) {
      return [];
    }

    try {
      const response = await eventServiceClient.get(`/api/events/${eventId}/sponsors`);
      const sponsors = response.data.data || [];
      return sponsors.filter((sponsor) => sponsor.showInEmails);
    } catch (error) {
      logger.warn({
        message: 'Failed to load sponsor email placements',
        eventId,
        error: error.message
      });
      return [];
    }
  };

  await eventBus.subscribe(
    [
      DomainEvents.SPONSOR_APPLICATION_SUBMITTED,
      DomainEvents.SPONSOR_APPLICATION_APPROVED,
      DomainEvents.SPONSOR_APPLICATION_REJECTED,
      DomainEvents.SPONSOR_ACTIVATED,
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
        const emailSponsors = await loadEmailSponsors(payload.eventId);

        await queue.add('send-email', {
          to: payload.attendeeEmail,
          subject: notification.title,
          html: `${queueEmailHtml(notification.body)}${buildSponsorEmailSection(emailSponsors)}`
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

      if (event === DomainEvents.SPONSOR_APPLICATION_SUBMITTED) {
        await createNotification({
          userId: payload.organizerId,
          eventId: payload.eventId,
          type: 'sponsor.application_submitted',
          title: `${payload.companyName} applied to sponsor ${payload.eventTitle}`,
          body: `${payload.packageName} is waiting for review in your sponsor dashboard.`,
          metadata: {
            sponsorId: payload.sponsorId
          }
        });

        if (payload.contactEmail) {
          await queue.add('send-email', {
            to: payload.contactEmail,
            subject: `We received your sponsor application for ${payload.eventTitle}`,
            html: `${queueEmailHtml(
              `Thanks ${payload.contactName || 'there'}, we received your ${payload.packageName} application for ${payload.eventTitle}. The organizer will review it shortly.`
            )}<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;">Company: <strong>${escapeHtml(payload.companyName || '')}</strong></p>`
          });
        }
      }

      if (event === DomainEvents.SPONSOR_APPLICATION_APPROVED && payload.contactEmail) {
        await queue.add('send-email', {
          to: payload.contactEmail,
          subject: `Your sponsor application was approved for ${payload.eventTitle}`,
          html: buildSponsorApprovalEmail(payload)
        });
      }

      if (event === DomainEvents.SPONSOR_APPLICATION_REJECTED && payload.contactEmail) {
        await queue.add('send-email', {
          to: payload.contactEmail,
          subject: `Update on your sponsor application for ${payload.eventTitle}`,
          html: queueEmailHtml(
            `Thanks ${payload.contactName || 'there'} for applying to sponsor ${payload.eventTitle}. The organizer did not move forward with this application at the moment.`
          )
        });
      }

      if (event === DomainEvents.SPONSOR_ACTIVATED) {
        await createNotification({
          userId: payload.organizerId,
          eventId: payload.eventId,
          type: 'sponsor.activated',
          title: `${payload.companyName} is now live on ${payload.eventTitle}`,
          body: `${payload.packageName} sponsor placement is now active.`,
          metadata: {
            sponsorId: payload.sponsorId
          }
        });

        if (payload.contactEmail) {
          const eventUrl = `${config.appOrigin.replace(/\/$/, '')}/events/${payload.eventId}`;
          await queue.add('send-email', {
            to: payload.contactEmail,
            subject: `Your sponsor placement is live for ${payload.eventTitle}`,
            html: `${queueEmailHtml(
              `Your sponsor placement for ${payload.eventTitle} is now live on PulseRoom. Attendees can discover your booth from the event page and live room.`
            )}<p><a href="${eventUrl}">View event page</a></p>`
          });
        }
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
