// backend/src/middlewares/errorHandler.js

const logger = require('../config/logger');

/**
 * Centralized error handler middleware
 * All errors should pass through here for consistent formatting
 */
module.exports = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'UNKNOWN';

  // Log error
  if (statusCode === 500) {
    logger.error('Server error', {
      message: err.message,
      code: err.code,
      stack: err.stack,
      path: req.path,
      method: req.method,
      ip
    });
  }

  // Handle specific error types
  if (err.message === 'USER_EXISTS') {
    return res.status(409).json({
      success: false,
      message: 'User already exists',
      code: 'USER_EXISTS',
      timestamp: new Date().toISOString()
    });
  }

  if (err.message === 'INVALID_CREDENTIALS') {
    return res.status(401).json({
      success: false,
      message: 'Invalid username or password',
      code: 'INVALID_CREDENTIALS',
      timestamp: new Date().toISOString()
    });
  }

  if (err.message === 'ADMIN_LIMIT_REACHED') {
    return res.status(403).json({
      success: false,
      message: 'Maximum admin accounts reached (limit: 2)',
      code: 'ADMIN_LIMIT_REACHED',
      timestamp: new Date().toISOString()
    });
  }

  if (err.message === 'ADMIN_CREATION_DISABLED') {
    return res.status(403).json({
      success: false,
      message: 'Admin creation is disabled',
      code: 'ADMIN_CREATION_DISABLED',
      timestamp: new Date().toISOString()
    });
  }

  if (err.message === 'ACCOUNT_LOCKED') {
    return res.status(423).json({
      success: false,
      message: 'Account is locked due to too many failed login attempts',
      code: 'ACCOUNT_LOCKED',
      timestamp: new Date().toISOString()
    });
  }

  if (err.message === 'ACCOUNT_SUSPENDED') {
    return res.status(403).json({
      success: false,
      message: 'Account is suspended',
      code: 'ACCOUNT_SUSPENDED',
      timestamp: new Date().toISOString()
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
      code: 'DUPLICATE_KEY',
      timestamp: new Date().toISOString()
    });
  }

  // Default error response
  return res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
};
