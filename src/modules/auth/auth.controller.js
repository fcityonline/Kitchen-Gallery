// backend/src/modules/auth/auth.controller.js

const { resetLoginRateLimit } = require('../../middlewares/bruteForce');
const authService = require('./auth.service');
const logger = require('../../config/logger');
const {
  AuthenticationError,
  ValidationError,
  ConflictError,
  ForbiddenError
} = authService;

// ==================== UTILITIES ====================

/**
 * Extract client IP from request
 */
const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket.remoteAddress ||
    'UNKNOWN'
  );
};

/**
 * Extract user agent from request
 */
const getUserAgent = (req) => {
  return req.headers['user-agent'] || 'UNKNOWN';
};

/**
 * Format user response (sanitized)
 */
const formatUserResponse = (user) => {
  return {
    userId: user.userId || user._id,
    username: user.username,
    email: user.email || null,
    role: user.role,
    fullName: user.fullName || null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null
  };
};

// ==================== REGISTER ====================

exports.register = async (req, res, next) => {
  const startTime = Date.now();
  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);

  try {
    const { username, password, confirmPassword, email } = req.body;
    const { role } = req.params || { role: 'USER' }; // From route params

    logger.info('Registration attempt', {
      username,
      role,
      ip,
      timestamp: new Date()
    });

    // Call service layer
    const user = await authService.registerUser({
      username,
      password,
      email,
      role,
      ip,
      userAgent
    });

    const responseTime = Date.now() - startTime;
    logger.info('Registration successful', {
      userId: user.userId,
      username: user.username,
      responseTime: `${responseTime}ms`,
      ip
    });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: formatUserResponse(user)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    if (error instanceof ValidationError) {
      logger.warn('Registration validation error', {
        error: error.message,
        responseTime: `${responseTime}ms`,
        ip
      });

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        code: error.code,
        errors: [error.message],
        timestamp: new Date().toISOString()
      });
    }

    if (error instanceof ConflictError) {
      logger.warn('Registration conflict', {
        error: error.message,
        responseTime: `${responseTime}ms`,
        ip
      });

      return res.status(409).json({
        success: false,
        message: 'Registration failed',
        code: error.code,
        errors: [error.message],
        timestamp: new Date().toISOString()
      });
    }

    if (error instanceof ForbiddenError) {
      logger.warn('Registration forbidden', {
        error: error.message,
        responseTime: `${responseTime}ms`,
        ip
      });

      return res.status(403).json({
        success: false,
        message: 'Registration not allowed',
        code: error.code,
        errors: [error.message],
        timestamp: new Date().toISOString()
      });
    }

    // Unexpected error
    logger.error('Unexpected registration error', {
      error: error.message,
      stack: error.stack,
      responseTime: `${responseTime}ms`,
      ip
    });

    return next(error);
  }
};

// ==================== LOGIN ====================

exports.login = async (req, res, next) => {
  const startTime = Date.now();
  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);

  try {
    const { username, password } = req.body;

    logger.info('Login attempt', {
      username,
      ip,
      timestamp: new Date()
    });

    // Call service layer
    const result = await authService.loginUser({
      username,
      password,
      ip,
      userAgent
    });

    const responseTime = Date.now() - startTime;
    logger.info('Login successful', {
      userId: result.userId,
      username: result.username,
      responseTime: `${responseTime}ms`,
      ip
    });

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Also send tokenId for manual storage if needed
    res.cookie('tokenId', result.tokenId || result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: formatUserResponse(result),
        accessToken: result.accessToken,
        expiresIn: 15 * 60, // 15 minutes in seconds
        tokenType: 'Bearer'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    if (error instanceof ValidationError) {
      logger.warn('Login validation error', {
        error: error.message,
        responseTime: `${responseTime}ms`,
        ip
      });

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        code: error.code,
        errors: [error.message],
        timestamp: new Date().toISOString()
      });
    }

    if (error instanceof AuthenticationError) {
      logger.warn('Login authentication failed', {
        error: error.message,
        responseTime: `${responseTime}ms`,
        ip
      });

      return res.status(401).json({
        success: false,
        message: 'Authentication failed',
        code: error.code,
        errors: [error.message],
        timestamp: new Date().toISOString()
      });
    }

    if (error instanceof ForbiddenError) {
      logger.warn('Login forbidden', {
        error: error.message,
        responseTime: `${responseTime}ms`,
        ip
      });

      return res.status(403).json({
        success: false,
        message: 'Access denied',
        code: error.code,
        errors: [error.message],
        timestamp: new Date().toISOString()
      });
    }

    // Unexpected error
    logger.error('Unexpected login error', {
      error: error.message,
      stack: error.stack,
      responseTime: `${responseTime}ms`,
      ip
    });

    return next(error);
  }
};

// ==================== LOGOUT ====================

exports.logout = async (req, res, next) => {
  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);

  try {
    const userId = req.user?.id;
    const tokenId = req.cookies?.tokenId || null;

    logger.info('Logout attempt', {
      userId,
      ip,
      timestamp: new Date()
    });

    if (userId) {
      await authService.logoutUser({
        tokenId,
        userId,
        ip,
        userAgent
      });
    }

    // Clear cookies
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.clearCookie('tokenId', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    return res.json({
      success: true,
      message: 'Logged out successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Logout error', {
      error: error.message,
      ip
    });

    // Still clear cookies even on error
    res.clearCookie('refreshToken');
    res.clearCookie('tokenId');

    return res.json({
      success: true,
      message: 'Logged out',
      timestamp: new Date().toISOString()
    });
  }
};

// ==================== REFRESH TOKEN ====================

exports.refreshToken = async (req, res, next) => {
  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);

  try {
    const tokenId = req.cookies?.tokenId || req.body?.tokenId;

    if (!tokenId) {
      logger.warn('Token refresh attempt without tokenId', { ip });
      return res.status(401).json({
        success: false,
        message: 'Token ID is missing',
        code: 'MISSING_TOKEN_ID',
        timestamp: new Date().toISOString()
      });
    }

    const result = await authService.refreshAccessToken({
      tokenId,
      ip,
      userAgent
    });

    // Update refresh token cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.cookie('tokenId', result.tokenId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    logger.info('Token refreshed successfully', {
      ip,
      timestamp: new Date()
    });

    return res.json({
      success: true,
      message: 'Token refreshed',
      data: {
        accessToken: result.accessToken,
        expiresIn: 15 * 60,
        tokenType: 'Bearer'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.warn('Token refresh failed', {
      error: error.message,
      ip
    });

    return res.status(401).json({
      success: false,
      message: 'Token refresh failed',
      code: error.code || 'REFRESH_FAILED',
      errors: [error.message],
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = exports;
