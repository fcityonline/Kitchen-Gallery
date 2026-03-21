// backend/src/services/auditLogger.js

const logger = require('../config/logger');
const User = require('../models/user.model');

/**
 * Enterprise Audit Logging Service
 * Tracks all sensitive user actions for compliance and security
 */

class AuditLogger {
  /**
   * Log login attempt
   */
  static async logLoginAttempt(username, ip, userAgent, success, reason = null) {
    try {
      const user = await User.findByUsername(username);

      if (user) {
        if (success) {
          user.recordSuccessfulLogin(ip, userAgent);
          logger.info('User login successful', {
            userId: user._id,
            username: user.username,
            ip,
            timestamp: new Date()
          });
        } else {
          user.recordFailedLogin(ip, userAgent, reason);
          logger.warn('User login failed', {
            userId: user._id,
            username: user.username,
            ip,
            reason,
            attempts: user.failedLoginAttempts,
            timestamp: new Date()
          });

          // Alert on account lockout
          if (user.isAccountLocked()) {
            logger.error('Account locked due to failed login attempts', {
              userId: user._id,
              username: user.username,
              ip,
              timestamp: new Date()
            });
          }
        }

        await user.save();
      }
    } catch (error) {
      logger.error('Error logging login attempt', {
        username,
        error: error.message
      });
    }
  }

  /**
   * Log user registration
   */
  static async logUserRegistration(userId, username, role, ip, userAgent) {
    try {
      logger.info('User registered', {
        userId,
        username,
        role,
        ip,
        timestamp: new Date()
      });

      const user = await User.findById(userId);
      if (user) {
        user.addActivityLog('REGISTRATION', ip, userAgent, { role });
        await user.save();
      }
    } catch (error) {
      logger.error('Error logging user registration', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Log logout
   */
  static async logLogout(userId, ip, userAgent) {
    try {
      logger.info('User logged out', {
        userId,
        ip,
        timestamp: new Date()
      });

      const user = await User.findById(userId);
      if (user) {
        user.addActivityLog('LOGOUT', ip, userAgent);
        await user.save();
      }
    } catch (error) {
      logger.error('Error logging logout', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Log password change
   */
  static async logPasswordChange(userId, ip, userAgent) {
    try {
      logger.info('User password changed', {
        userId,
        ip,
        timestamp: new Date()
      });

      const user = await User.findById(userId);
      if (user) {
        user.addActivityLog('PASSWORD_CHANGED', ip, userAgent);
        await user.save();
      }
    } catch (error) {
      logger.error('Error logging password change', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Log suspicious activity
   */
  static logSuspiciousActivity(action, details, ip, userAgent) {
    logger.warn('Suspicious activity detected', {
      action,
      ip,
      userAgent,
      details,
      timestamp: new Date()
    });
  }

  /**
   * Log security event
   */
  static logSecurityEvent(eventType, details, severity = 'MEDIUM') {
    const levelMap = {
      LOW: 'info',
      MEDIUM: 'warn',
      HIGH: 'error'
    };

    const level = levelMap[severity] || 'warn';
    logger[level](`Security event: ${eventType}`, {
      severity,
      details,
      timestamp: new Date()
    });
  }

  /**
   * Log API error
   */
  static logApiError(endpoint, method, error, ip, userId = null) {
    logger.error('API Error', {
      endpoint,
      method,
      error: error.message,
      ip,
      userId,
      timestamp: new Date()
    });
  }
}

module.exports = AuditLogger;
