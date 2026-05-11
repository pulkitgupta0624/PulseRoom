const { connectMongo, RedisEventBus, DomainEvents } = require('@pulseroom/common');
const { createApp, logger } = require('./app');
const config = require('./config');
const {
  handleBookingCheckedIn,
  handleBookingConfirmed,
  handleNetworkingOptIn,
  handleQuestionPosted,
  handleQuestionUpvoted,
  handleReviewSubmitted,
  handleUserRegistered
} = require('./services/engine');

const start = async () => {
  await connectMongo(config.mongoUri, logger);

  const eventBus = new RedisEventBus({
    redisUrl: config.redisUrl,
    serviceName: 'gamification-service',
    logger
  });

  await eventBus.subscribe(
    [
      DomainEvents.USER_REGISTERED,
      DomainEvents.BOOKING_CONFIRMED,
      DomainEvents.BOOKING_CHECKED_IN,
      DomainEvents.QUESTION_POSTED,
      DomainEvents.QUESTION_UPVOTED,
      DomainEvents.EVENT_REVIEW_SUBMITTED,
      DomainEvents.NETWORKING_OPTED_IN
    ],
    async (message) => {
      if (message.event === DomainEvents.USER_REGISTERED) {
        await handleUserRegistered(message);
      }

      if (message.event === DomainEvents.BOOKING_CONFIRMED) {
        await handleBookingConfirmed(message);
      }

      if (message.event === DomainEvents.BOOKING_CHECKED_IN) {
        await handleBookingCheckedIn(message);
      }

      if (message.event === DomainEvents.QUESTION_POSTED) {
        await handleQuestionPosted(message);
      }

      if (message.event === DomainEvents.QUESTION_UPVOTED) {
        await handleQuestionUpvoted(message);
      }

      if (message.event === DomainEvents.EVENT_REVIEW_SUBMITTED) {
        await handleReviewSubmitted(message);
      }

      if (message.event === DomainEvents.NETWORKING_OPTED_IN) {
        await handleNetworkingOptIn(message);
      }
    }
  );

  const app = createApp();
  app.listen(config.port, () => {
    logger.info({
      message: 'Gamification service started',
      port: config.port
    });
  });
};

start().catch((error) => {
  logger.error({
    message: 'Failed to start gamification service',
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
