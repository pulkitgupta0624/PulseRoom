const Redis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const { DomainEvents } = require('@pulseroom/common');
const Event = require('../models/Event');
const { buildReviewWindowOpensAt } = require('./reviewService');

const COMPLETION_QUEUE = 'event-completion-jobs';

const buildJobId = (eventId) => `event-complete__${eventId}`;
const buildScheduledJobId = (eventId, endsAt) =>
  `${buildJobId(eventId)}__${new Date(endsAt).getTime()}`;
const isLockedJobError = (error) =>
  /locked by another worker/i.test(error?.message || '');

const createEventCompletionService = ({ redisUrl, logger, eventBus, onEventChanged }) => {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(COMPLETION_QUEUE, { connection });

  const publishCompletedEvent = async (event) => {
    await eventBus.publish(DomainEvents.EVENT_COMPLETED, {
      eventId: event._id.toString(),
      organizerId: event.organizerId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      organizerSignatureName: event.organizerSignatureName || ''
    });
  };

  const worker = new Worker(
    COMPLETION_QUEUE,
    async (job) => {
      if (job.name !== 'complete-event') {
        return;
      }

      const event = await Event.findById(job.data.eventId);
      if (!event) {
        return;
      }

      if (event.status === 'completed' || event.status === 'cancelled') {
        return;
      }

      if (event.status !== 'published') {
        return;
      }

      if (new Date(event.endsAt).getTime() > Date.now()) {
        await scheduleEventCompletion(event);
        return;
      }

      event.status = 'completed';
      if (event.liveStatus !== 'ended') {
        event.liveStatus = 'ended';
      }
      event.reviewWindowOpensAt = buildReviewWindowOpensAt();
      await event.save();

      if (typeof onEventChanged === 'function') {
        await onEventChanged(event);
      }

      await publishCompletedEvent(event);
    },
    { connection }
  );

  worker.on('failed', (job, error) => {
    logger.error({
      message: 'Event completion job failed',
      jobId: job?.id,
      error: error.message
    });
  });

  const removeScheduledCompletion = async (eventId) => {
    const baseJobId = buildJobId(eventId);
    const jobTypes = ['delayed', 'waiting', 'paused', 'prioritized', 'waiting-children'];
    const jobs = await queue.getJobs(jobTypes, 0, -1);
    const matchingJobs = jobs.filter((job) =>
      String(job.id || '') === baseJobId ||
      String(job.id || '').startsWith(`${baseJobId}__`)
    );

    for (const job of matchingJobs) {
      try {
        await job.remove();
      } catch (error) {
        if (isLockedJobError(error)) {
          logger.warn({
            message: 'Skipped locked event completion job during reschedule',
            eventId,
            jobId: job.id
          });
          continue;
        }

        throw error;
      }
    }
  };

  const scheduleEventCompletion = async (event) => {
    const eventId = event?._id?.toString();
    if (!eventId) {
      return;
    }

    await removeScheduledCompletion(eventId);

    if (event.status !== 'published' || event.status === 'completed' || event.status === 'cancelled') {
      return;
    }

    const delay = Math.max(0, new Date(event.endsAt).getTime() - Date.now());
    try {
      await queue.add(
        'complete-event',
        { eventId },
        {
          jobId: buildScheduledJobId(eventId, event.endsAt),
          delay,
          removeOnComplete: true,
          removeOnFail: 50
        }
      );
    } catch (error) {
      if (/already exists/i.test(error?.message || '')) {
        logger.info({
          message: 'Event completion job already scheduled',
          eventId,
          endsAt: event.endsAt
        });
        return;
      }

      throw error;
    }
  };

  const bootstrapExistingSchedules = async () => {
    const events = await Event.find({
      status: 'published'
    })
      .select('_id endsAt status')
      .lean();

    for (const event of events) {
      await scheduleEventCompletion(event);
    }
  };

  return {
    scheduleEventCompletion,
    removeScheduledCompletion,
    bootstrapExistingSchedules,
    publishCompletedEvent
  };
};

module.exports = {
  createEventCompletionService
};
