const Redis = require('ioredis');

class RedisEventBus {
  constructor({ redisUrl, serviceName, logger }) {
    this.redisUrl = redisUrl;
    this.serviceName = serviceName;
    this.logger = logger;
    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
  }

  async publish(event, payload) {
    const body = JSON.stringify({
      event,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      payload
    });

    await this.publisher.publish(event, body);
    await this.publisher.publish('pulseroom.all', body);

    this.logger.info({
      message: 'Event published',
      event
    });
  }

  async subscribe(events, handler) {
    const eventList = Array.isArray(events) ? events : [events];
    if (!eventList.length) {
      return;
    }

    await this.subscriber.subscribe(...eventList);
    this.subscriber.on('message', async (_channel, message) => {
      try {
        const parsed = JSON.parse(message);
        await handler(parsed);
      } catch (error) {
        this.logger.error({
          message: 'Event handling failed',
          error: error.message
        });
      }
    });
  }

  getRedisClient() {
    return this.publisher.duplicate();
  }
}

module.exports = {
  RedisEventBus
};

