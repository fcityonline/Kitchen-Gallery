const express = require('express');
const orderController = require('./order.controller');
const { protect, adminOnly } = require('../../middlewares/auth.middleware');
const { rateLimitMiddleware } = require('../../middlewares/bruteForce');

const router = express.Router();

// ==================== USER ROUTES ====================

// Get user's orders
router.get('/', protect, rateLimitMiddleware('order', 20), orderController.getUserOrders);

// Get order details
router.get(
  '/:orderNumber',
  protect,
  rateLimitMiddleware('order', 20),
  orderController.getOrderDetails
);

// Create order from cart
router.post('/', protect, rateLimitMiddleware('order', 5), orderController.createOrder);

// Cancel order
router.patch(
  '/:orderNumber/cancel',
  protect,
  rateLimitMiddleware('order', 10),
  orderController.cancelOrder
);

// Initiate return
router.patch(
  '/:orderNumber/return',
  protect,
  rateLimitMiddleware('order', 10),
  orderController.initiateReturn
);

// ==================== ADMIN ROUTES ====================

// Get all orders (admin)
router.get(
  '/admin/all-orders',
  protect,
  adminOnly,
  rateLimitMiddleware('order-admin', 10),
  orderController.getAllOrders
);

// Get orders by status (admin)
router.get(
  '/admin/by-status/:status',
  protect,
  adminOnly,
  rateLimitMiddleware('order-admin', 10),
  orderController.getOrdersByStatus
);

// Update order status (admin)
router.patch(
  '/:orderNumber/status',
  protect,
  adminOnly,
  rateLimitMiddleware('order-admin', 10),
  orderController.updateOrderStatus
);

// Update tracking (admin)
router.patch(
  '/:orderNumber/tracking',
  protect,
  adminOnly,
  rateLimitMiddleware('order-admin', 10),
  orderController.updateTracking
);

// Process refund (admin)
router.post(
  '/:orderNumber/refund',
  protect,
  adminOnly,
  rateLimitMiddleware('order-admin', 5),
  orderController.processRefund
);

// ==================== PAYMENT ROUTES ====================

// Update payment status (webhook from Razorpay)
router.post(
  '/payment/webhook',
  rateLimitMiddleware('payment', 100),
  orderController.handlePaymentWebhook
);

module.exports = router;
