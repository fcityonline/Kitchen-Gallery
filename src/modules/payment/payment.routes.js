// backend/src/modules/payment/payment.routes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/auth.middleware');
const paymentController = require('./payment.controller');

// ==================== USER ROUTES ====================

/**
 * POST /api/payments/initiate
 * Initiate a payment for an order
 * User can only initiate payment for their own orders
 */
router.post('/initiate', protect, paymentController.initiatePayment);

/**
 * POST /api/payments/verify
 * Verify payment signature and complete payment
 * Called after Razorpay payment success
 */
router.post('/verify', protect, paymentController.verifyPayment);

/**
 * POST /api/payments/webhook
 * Razorpay webhook handler (public route)
 * No authentication required
 * Verifies request using Razorpay signature in headers
 */
router.post('/webhook', paymentController.handleWebhook);

/**
 * GET /api/payments/:orderNumber
 * Get payment status for an order
 */
router.get('/:orderNumber', protect, paymentController.getPaymentStatus);

// ==================== ADMIN ROUTES ====================

/**
 * POST /api/payments/:orderNumber/refund
 * Process refund for an order (admin only)
 * Requires admin role
 */
router.post('/:orderNumber/refund', protect, paymentController.refundOrder);

module.exports = router;
