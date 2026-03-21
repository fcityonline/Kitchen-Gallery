// backend/src/services/payment.service.js

const { createRazorpayOrder, verifyPaymentSignature, refundPayment } = require('../config/razorpay');
const whatsappService = require('./whatsapp.service');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

/**
 * Payment Service
 * Handles all payment-related operations
 */

// ==================== CREATE PAYMENT ====================

/**
 * Create payment for an order
 * 
 * @param {Object} orderData - {orderId, userId, totalAmount, orderNumber}
 * @returns {Promise<Object>} {razorpayOrderId, razorpayKey, amount, currency}
 */
exports.initiatePayment = async (orderData) => {
  const { orderData: order, orderNumber, totalAmount } = orderData;

  try {
    // Amount in paise (convert rupees to paise)
    const amountInPaise = Math.round(totalAmount * 100);

    // Create Razorpay order
    const razorpayOrder = await createRazorpayOrder(amountInPaise, 'INR', {
      receipt: orderNumber,
      notes: {
        orderId: order._id.toString(),
        orderNumber,
        userId: order.userId.toString()
      }
    });

    // Update order with Razorpay order ID
    await Order.findByIdAndUpdate(order._id, {
      'payment.razorpayOrderId': razorpayOrder.id
    });

    logger.info(`Payment initiated for order ${orderNumber}: ${razorpayOrder.id}`);

    return {
      razorpayOrderId: razorpayOrder.id,
      razorpayKey: process.env.RAZORPAY_KEY_ID,
      amount: amountInPaise,
      currency: 'INR',
      orderNumber
    };
  } catch (error) {
    logger.error(`Error initiating payment for order ${orderNumber}:`, error.message);
    throw new AppError('Failed to initiate payment', 500, 'PAYMENT_INITIATION_FAILED');
  }
};

// ==================== VERIFY PAYMENT ====================

/**
 * Verify payment after successful transaction
 * 
 * @param {Object} paymentData - {razorpayPaymentId, razorpayOrderId, razorpaySignature, orderNumber}
 * @returns {Promise<Object>} Updated order object
 */
exports.verifyPayment = async (paymentData) => {
  const { razorpayPaymentId, razorpayOrderId, razorpaySignature, orderNumber } = paymentData;

  try {
    // Verify signature (CRITICAL for security)
    const isSignatureValid = verifyPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isSignatureValid) {
      logger.warn(`Invalid signature for order ${orderNumber}`);
      throw new AppError('Payment verification failed', 400, 'INVALID_PAYMENT_SIGNATURE');
    }

    // Find order
    const order = await Order.findOne({ orderNumber });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Check if already paid
    if (order.payment.status === 'completed') {
      logger.warn(`Order ${orderNumber} already marked as paid`);
      return order;
    }

    // Update order payment status
    order.markPaymentCompleted(razorpayPaymentId, 'razorpay');
    order.payment.razorpaySignature = razorpaySignature;
    order.updateStatus('confirmed', 'Payment successful - Order confirmed');

    await order.save();

    logger.info(`Payment verified for order ${orderNumber}`);

    return order;
  } catch (error) {
    logger.error(`Error verifying payment for order ${orderNumber}:`, error.message);
    throw error;
  }
};

// ==================== HANDLE PAYMENT WEBHOOK ====================

/**
 * Handle Razorpay webhook
 * Called when payment succeeds, fails, or times out
 * 
 * @param {Object} webhookData - Razorpay webhook payload
 * @returns {Promise<Object>} Webhook processing result
 */
exports.handlePaymentWebhook = async (webhookData) => {
  try {
    const { event, payload } = webhookData;

    logger.info(`Processing Razorpay webhook: ${event}`, {
      orderId: payload?.order?.entity?.id
    });

    switch (event) {
      case 'payment.authorized':
        return await handlePaymentAuthorized(payload);

      case 'payment.captured':
        return await handlePaymentCaptured(payload);

      case 'payment.failed':
        return await handlePaymentFailed(payload);

      case 'payment.international.conversion_requested':
        return { acknowledged: true };

      default:
        logger.warn(`Unhandled webhook event: ${event}`);
        return { acknowledged: true };
    }
  } catch (error) {
    logger.error('Error processing webhook:', error.message);
    throw error;
  }
};

// ==================== WEBHOOK HANDLERS ====================

/**
 * Handle payment.authorized event
 */
const handlePaymentAuthorized = async (payload) => {
  try {
    const { payment, order } = payload;

    if (!payment?.id || !order?.id) {
      throw new Error('Missing payment or order ID in webhook');
    }

    const dbOrder = await Order.findOne({ 'payment.razorpayOrderId': order.id });

    if (!dbOrder) {
      logger.warn(`Order not found for Razorpay order: ${order.id}`);
      return { acknowledged: true };
    }

    // Update payment status (authorized = pending capture)
    dbOrder.payment.razorpayPaymentId = payment.id;
    dbOrder.payment.status = 'pending'; // Awaiting capture

    await dbOrder.save();

    logger.info(`Payment authorized for order ${dbOrder.orderNumber}`);

    return { acknowledged: true };
  } catch (error) {
    logger.error('Error in payment.authorized webhook:', error.message);
    return { acknowledged: true }; // Always return true to prevent retry
  }
};

/**
 * Handle payment.captured event
 */
const handlePaymentCaptured = async (payload) => {
  try {
    const { payment, order } = payload;

    if (!payment?.id || !order?.id) {
      throw new Error('Missing payment or order ID in webhook');
    }

    const dbOrder = await Order.findOne({ 'payment.razorpayOrderId': order.id });

    if (!dbOrder) {
      logger.warn(`Order not found for Razorpay order: ${order.id}`);
      return { acknowledged: true };
    }

    // Mark payment as completed
    dbOrder.markPaymentCompleted(payment.id, 'razorpay');
    dbOrder.updateStatus('confirmed', 'Payment captured - Order confirmed');

    await dbOrder.save();

    // Send WhatsApp notification (async - don't block webhook response)
    whatsappService.sendPaymentConfirmation(dbOrder).catch(error => {
      logger.error(`Failed to send WhatsApp payment confirmation: ${error.message}`);
    });

    logger.info(`Payment captured for order ${dbOrder.orderNumber}`);

    return { acknowledged: true };
  } catch (error) {
    logger.error('Error in payment.captured webhook:', error.message);
    return { acknowledged: true };
  }
};

/**
 * Handle payment.failed event
 */
const handlePaymentFailed = async (payload) => {
  try {
    const { payment, order } = payload;

    if (!payment?.id || !order?.id) {
      throw new Error('Missing payment or order ID in webhook');
    }

    const dbOrder = await Order.findOne({ 'payment.razorpayOrderId': order.id });

    if (!dbOrder) {
      logger.warn(`Order not found for Razorpay order: ${order.id}`);
      return { acknowledged: true };
    }

    // Mark payment as failed
    dbOrder.payment.razorpayPaymentId = payment.id;
    dbOrder.markPaymentFailed();
    dbOrder.updateStatus('pending', 'Payment failed - Please retry');

    await dbOrder.save();

    // Send WhatsApp payment failed notification (async)
    whatsappService.sendPaymentFailed(dbOrder).catch(error => {
      logger.error(`Failed to send WhatsApp payment failed notification: ${error.message}`);
    });

    logger.warn(`Payment failed for order ${dbOrder.orderNumber}: ${payment.description}`);

    return { acknowledged: true };
  } catch (error) {
    logger.error('Error in payment.failed webhook:', error.message);
    return { acknowledged: true };
  }
};

// ==================== REFUND OPERATIONS ====================

/**
 * Process refund for an order
 * 
 * @param {Object} refundData - {orderId, amount, reason}
 * @returns {Promise<Object>} Refund details
 */
exports.processRefund = async (refundData) => {
  const { orderId, amount, reason = 'Merchant requested refund' } = refundData;

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    if (!order.payment.razorpayPaymentId) {
      throw new AppError('No payment to refund', 400, 'NO_PAYMENT_TO_REFUND');
    }

    if (order.payment.status !== 'completed') {
      throw new AppError('Only completed payments can be refunded', 400, 'PAYMENT_NOT_COMPLETED');
    }

    // Process refund
    const refund = await refundPayment(order.payment.razorpayPaymentId, {
      amount: amount ? Math.round(amount * 100) : null, // Convert to paise
      reason,
      notes: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        refundedAt: new Date().toISOString()
      }
    });

    // Update order
    order.payment.status = 'refunded';
    order.payment.refundAmount = amount || order.pricing.totalAmount;
    order.payment.refundedAt = new Date();

    await order.save();

    logger.info(`Refund processed for order ${order.orderNumber}`, {
      refundId: refund.id,
      amount: refund.amount,
      status: refund.status
    });

    return refund;
  } catch (error) {
    logger.error(`Error processing refund for order ${orderId}:`, error.message);
    throw error;
  }
};

// ==================== PAYMENT STATUS HELPERS ====================

/**
 * Get payment status for user display
 */
exports.getPaymentStatusDisplay = (paymentStatus) => {
  const statusMap = {
    pending: { badge: 'yellow', label: 'Pending Payment', icon: '⏳' },
    completed: { badge: 'green', label: 'Paid', icon: '✓' },
    failed: { badge: 'red', label: 'Payment Failed', icon: '❌' },
    refunded: { badge: 'blue', label: 'Refunded', icon: '↩️' }
  };

  return statusMap[paymentStatus] || statusMap.pending;
};

module.exports.exports = exports;
