// backend/src/middlewares/auth.middleware.js

const jwt = require('jsonwebtoken');
const redis = require('../config/redis');
const logger = require('../config/logger');

/**
 * Protect middleware - Verify JWT and attach user to request
 * Optionally enforce specific roles
 */
exports.protect = (requiredRoles = []) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      // 1. CHECK FOR AUTHORIZATION HEADER
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Missing or invalid Authorization header', {
          ip: req.ip,
          path: req.path
        });

        return res.status(401).json({
          success: false,
          message: 'Unauthorized - missing or invalid token',
          code: 'MISSING_TOKEN',
          timestamp: new Date().toISOString()
        });
      }

      const token = authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized - token is empty',
          code: 'EMPTY_TOKEN',
          timestamp: new Date().toISOString()
        });
      }

      // 2. CHECK IF TOKEN IS BLACKLISTED
      const isBlacklisted = await redis.get(`bl_${token}`);
      if (isBlacklisted) {
        logger.warn('Attempting to use blacklisted token', {
          ip: req.ip,
          path: req.path
        });

        return res.status(401).json({
          success: false,
          message: 'Token has been revoked',
          code: 'TOKEN_REVOKED',
          timestamp: new Date().toISOString()
        });
      }

      // 3. VERIFY TOKEN SIGNATURE
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      } catch (err) {
        if (err.name === 'TokenExpiredError') {
          logger.warn('Token expired', {
            userId: err.decoded?.id,
            ip: req.ip
          });

          return res.status(401).json({
            success: false,
            message: 'Token has expired',
            code: 'TOKEN_EXPIRED',
            timestamp: new Date().toISOString()
          });
        }

        if (err.name === 'JsonWebTokenError') {
          logger.warn('Invalid token signature', {
            error: err.message,
            ip: req.ip
          });

          return res.status(401).json({
            success: false,
            message: 'Invalid token',
            code: 'INVALID_TOKEN',
            timestamp: new Date().toISOString()
          });
        }

        throw err;
      }

      // 4. CHECK ROLE IF REQUIRED
      if (requiredRoles.length > 0 && !requiredRoles.includes(decoded.role)) {
        logger.warn('Insufficient permissions', {
          userId: decoded.id,
          userRole: decoded.role,
          requiredRoles,
          ip: req.ip,
          path: req.path
        });

        return res.status(403).json({
          success: false,
          message: 'Forbidden - insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          timestamp: new Date().toISOString()
        });
      }

      // 5. ATTACH USER TO REQUEST
      req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role
      };

      next();
    } catch (error) {
      logger.error('Auth middleware error', {
        error: error.message,
        ip: req.ip,
        path: req.path
      });

      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'AUTH_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };
};

/**
 * Optional auth middleware - doesn't fail if no token, but attaches if present
 */
exports.optionalAuth = () => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
      }

      const token = authHeader.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role
      };

      next();
    } catch (error) {
      // If token is invalid, just continue without user
      next();
    }
  };
};

/**
 * Admin-only middleware
 */
exports.adminOnly = exports.protect(['ADMIN']);

/**
 * User-only middleware
 */
exports.userOnly = exports.protect(['USER']);

//   };
// };