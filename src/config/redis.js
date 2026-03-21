// backend/src/config/redis.js

const { Redis } = require('@upstash/redis');
const logger = require('./logger');

let redis = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  logger.info('Upstash Redis client initialized');
} else {
  logger.warn('Upstash Redis credentials missing. Using in-memory fallback for rate limiting.');
}

module.exports = redis;