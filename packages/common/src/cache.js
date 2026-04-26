const Redis = require('ioredis');

const createCacheClient = (redisUrl) => new Redis(redisUrl);

module.exports = {
  createCacheClient
};

