// backend/src/middlewares/securityHeaders.js

const logger = require('../config/logger');

/**
 * Security headers middleware
 * Adds important security headers to all responses
 */
module.exports = (req, res, next) => {
  try {
    // Prevent MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Enable browser XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Prevent clickjacking/iframe embedding
    res.setHeader('X-Frame-Options', 'DENY');

    // Control referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Force HTTPS in production
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'"
    );

    // Permissions Policy (formerly Feature-Policy)
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()'
    );

    // Disable caching for sensitive endpoints
    if (req.path.includes('/api/auth') || req.path.includes('/api/dashboard')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    // Remove powered-by header
    res.removeHeader('X-Powered-By');

    next();
  } catch (error) {
    logger.error('Security headers middleware error', {
      error: error.message
    });
    next();
  }
};
