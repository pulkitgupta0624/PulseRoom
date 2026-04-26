const Redis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const { DomainEvents } = require('@pulseroom/common');
const Event = require('../models/Event');

const COMPLETION_QUEUE = 'event-completion-jobs';

const buildJobId = (eventId) => `event-complete__${eventId}`;

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
    const existingJob = await queue.getJob(buildJobId(eventId));
    if (existingJob) {
      await existingJob.remove();
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
    await queue.add(
      'complete-event',
      { eventId },
      {
        jobId: buildJobId(eventId),
        delay,
        removeOnComplete: true,
        removeOnFail: 50
      }
    );
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
