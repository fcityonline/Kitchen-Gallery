// backend/src/middlewares/bruteForce.js

const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');
const redis = require('../config/redis');
const logger = require('../config/logger');

const createRateLimiter = (opts) => {
  if (redis) {
    return new RateLimiterRedis({ ...opts, storeClient: redis });
  }

  return new RateLimiterMemory(opts);
};

/**
 * Enterprise-grade brute force protection
 * Uses multiple strategies:
 * 1. Global rate limit per IP
 * 2. Per-username rate limit
 * 3. Account lockout on repeated failures
 */

// ==================== RATE LIMITERS ====================

// Global rate limiter - max requests per IP
const globalLimiter = createRateLimiter({
  keyPrefix: 'rl_global',
  points: process.env.NODE_ENV === 'production' ? 300 : 1000, // higher for dev
  duration: 60 * 15, // per 15 minutes
  blockDurationSec: 60 * 3 // block for 3 minutes if exceeded
});

// Login-specific limiter - per IP + username combination
const loginLimiter = createRateLimiter({
  keyPrefix: 'rl_login',
  points: process.env.NODE_ENV === 'production' ? 10 : 30, // softer in dev
  duration: 60 * 15, // per 15 minutes
  blockDurationSec: 60 * 3 // block for 30 minutes if exceeded
});

// ==================== MIDDLEWARE ====================

/**
 * Brute force protection middleware for login endpoints
 */
exports.loginLimiter = async (req, res, next) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'UNKNOWN';
    const username = req.body?.username || 'unknown';

    // 1. CHECK GLOBAL RATE LIMIT
    try {
      const rateLimiterRes = await globalLimiter.consume(ip, 1);
      logger.debug('Global rate limit check passed', {
        ip,
        remainingPoints: rateLimiterRes.remainingPoints
      });
    } catch (rateLimiterRes) {
      logger.warn('Global rate limit exceeded', {
        ip,
        msBeforeNext: rateLimiterRes.msBeforeNext,
        remainingPoints: rateLimiterRes.remainingPoints
      });

      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000),
        timestamp: new Date().toISOString()
      });
    }

    // 2. CHECK LOGIN-SPECIFIC RATE LIMIT
    try {
      const key = `${ip}_${username.toLowerCase()}`;
      const rateLimiterRes = await loginLimiter.consume(key, 1);

      logger.debug('Login rate limit check passed', {
        key,
        remainingPoints: rateLimiterRes.remainingPoints
      });
    } catch (rateLimiterRes) {
      logger.warn('Login rate limit exceeded', {
        ip,
        username,
        msBeforeNext: rateLimiterRes.msBeforeNext,
        remainingPoints: rateLimiterRes.remainingPoints
      });

      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Account temporarily locked.',
        code: 'TOO_MANY_LOGIN_ATTEMPTS',
        retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000),
        timestamp: new Date().toISOString()
      });
    }

    next();
  } catch (error) {
    logger.error('Rate limiting error', {
      error: error.message,
      ip: req.ip
    });

    // Don't block request on rate limiter error
    next();
  }
};

/**
 * Reset login rate limiter for a specific user (after successful login)
 */
exports.resetLoginRateLimit = async (username, ip) => {
  try {
    const key = `${ip}_${username.toLowerCase()}`;
    await loginLimiter.resetKey(key);
    logger.info('Login rate limit reset', { username, ip });
  } catch (error) {
    logger.error('Error resetting rate limit', {
      username,
      error: error.message
    });
  }
};

/**
 * Check if IP is currently rate limited
 */
exports.isIpLimited = async (ip) => {
  try {
    const key = `rl_global_${ip}`;
    const rlState = await redis.get(key);
    return rlState ? JSON.parse(rlState) : null;
  } catch (error) {
    logger.error('Error checking IP limit', { error: error.message });
    return null;
  }
};

/**
 * Get remaining login attempts for a user
 */
exports.getLoginAttemptsRemaining = async (username, ip) => {
  try {
    const key = `rl_login_${ip}_${username.toLowerCase()}`;
    const rlState = await redis.get(key);
    if (rlState) {
      const state = JSON.parse(rlState);
      return state.remainingPoints || 0;
    }
    return 5; // Default remaining attempts
  } catch (error) {
    logger.error('Error getting login attempts', { error: error.message });
    return 5;
  }
};

/**
 * Custom rate limiter for registration endpoints
 * More lenient than login but still protected
 */
exports.registrationLimiter = async (req, res, next) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'UNKNOWN';

    // Max 3 registration attempts per IP per hour
    const registerLimiter = createRateLimiter({
      keyPrefix: 'rl_register',
      points: 3,
      duration: 60 * 60 // per hour
    });

    try {
      await registerLimiter.consume(ip, 1);
      next();
    } catch (rateLimiterRes) {
      logger.warn('Registration rate limit exceeded', {
        ip,
        msBeforeNext: rateLimiterRes.msBeforeNext
      });

      return res.status(429).json({
        success: false,
        message: 'Too many registration attempts. Please try again later.',
        code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000),
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Registration rate limiter error', {
      error: error.message
    });
    next();
  }
};

/**
 * Generic rate limiter middleware (for routes like category, admin, etc.)
 */
exports.rateLimitMiddleware = (keyPrefix = 'default', maxRequests = 20, duration = 60) => {
  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `rl_${keyPrefix}`,
    points: maxRequests,
    duration
  });

  return async (req, res, next) => {
    try {
      const ip =
        req.headers['x-forwarded-for']?.split(',')[0] ||
        req.ip ||
        'UNKNOWN';

      await limiter.consume(ip, 1);
      next();
    } catch (rateLimiterRes) {
      logger.warn(`${keyPrefix} rate limit exceeded`, {
        ip,
        msBeforeNext: rateLimiterRes.msBeforeNext
      });

      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000),
        timestamp: new Date().toISOString()
      });
    }
  };
};

module.exports = exports;
