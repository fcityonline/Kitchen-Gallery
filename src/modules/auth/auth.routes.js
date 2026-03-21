// backend/src/modules/auth/auth.routes.js

const { loginLimiter } = require('../../middlewares/bruteForce');
const router = require('express').Router();
const controller = require('./auth.controller');
const { protect } = require('../../middlewares/auth.middleware');
const logger = require('../../config/logger');

// ==================== USER ROUTES ====================

const userRegisterMiddleware = process.env.NODE_ENV === 'production' ? loginLimiter : (req, res, next) => next();
const userLoginMiddleware = process.env.NODE_ENV === 'production' ? loginLimiter : (req, res, next) => next();

/**
 * POST /api/auth/user/register
 * Register a new user account
 */
router.post('/user/register', userRegisterMiddleware, async (req, res, next) => {
  try {
    req.body.role = 'USER';
    await controller.register(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/user/login
 * Login as a user
 */
router.post('/user/login', userLoginMiddleware, async (req, res, next) => {
  try {
    await controller.login(req, res, next);
  } catch (err) {
    next(err);
  }
});

// ==================== ADMIN ROUTES ====================

/**
 * POST /api/auth/admin/register
 * Register a new admin account (max 2)
 */
router.post('/admin/register', loginLimiter, async (req, res, next) => {
  try {
    req.body.role = 'ADMIN';
    await controller.register(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/admin/login
 * Login as an admin
 */
router.post('/admin/login', loginLimiter, async (req, res, next) => {
  try {
    await controller.login(req, res, next);
  } catch (err) {
    next(err);
  }
});

// ==================== TOKEN MANAGEMENT ====================

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    await controller.refreshToken(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Logout and invalidate tokens
 */
router.post('/logout', protect(), async (req, res, next) => {
  try {
    await controller.logout(req, res, next);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user info
 */
router.get('/me', protect(), async (req, res, next) => {
  try {
    return res.json({
      success: true,
      data: {
        user: req.user
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
