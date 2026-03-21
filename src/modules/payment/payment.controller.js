// backend/src/modules/payment/payment.controller.js

const Order = require('../../models/order.model');
const Cart = require('../../models/cart.model');
const paymentService = require('../../services/payment.service');
const whatsappService = require('../../services/whatsapp.service');
const { verifyPaymentSignature } = require('../../config/razorpay');
const logger = require('../../config/logger');
const { AppError, ValidationError } = require('../../utils/errors');

// ==================== INITIATE PAYMENT ====================

exports.initiatePayment = async (req, res, next) => {
  try {
    const { orderNumber } = req.body;

    if (!orderNumber?.trim()) {
      throw new ValidationError('Order number is required', 'ORDER_NUMBER_REQUIRED');
    }

    // Find order
    const order = await Order.findOne({
      orderNumber,
      userId: req.user._id
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Check if payment already completed
    if (order.payment.status === 'completed') {
      throw new AppError('Payment already completed for this order', 400, 'PAYMENT_ALREADY_COMPLETED');
    }

    // Check order status
    if (order.status !== 'pending') {
      throw new AppError(
        `Cannot initiate payment for order with status: ${order.status}`,
        400,
        'INVALID_ORDER_STATUS'
      );
    }

    // Initiate payment
    const paymentData = await paymentService.initiatePayment({
      orderData: order,
      orderNumber,
      totalAmount: order.pricing.totalAmount
    });

    logger.info(`Payment initiated for order ${orderNumber} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: paymentData,
      message: 'Payment initiated. Proceed to payment gateway.'
    });
  } catch (error) {
    logger.error('Error initiating payment:', error);
    next(error);
  }
};

// ==================== VERIFY PAYMENT ====================

exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, orderNumber } = req.body;

    // Validate inputs
    if (!razorpayPaymentId?.trim() || !razorpayOrderId?.trim() || !razorpaySignature?.trim()) {
      throw new ValidationError(
        'Payment verification data is incomplete',
        'INCOMPLETE_PAYMENT_DATA'
      );
    }

    if (!orderNumber?.trim()) {
      throw new ValidationError('Order number is required', 'ORDER_NUMBER_REQUIRED');
    }

    // Verify payment
    const order = await paymentService.verifyPayment({
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      orderNumber
    });

    // Ensure order belongs to user
    if (order.userId.toString() !== req.user._id.toString()) {
      throw new AppError('Unauthorized', 403, 'UNAUTHORIZED');
    }

    // Send WhatsApp payment confirmation notification (async - don't block response)
    whatsappService.sendPaymentConfirmation(order).catch(error => {
      logger.error(`Failed to send WhatsApp payment confirmation: ${error.message}`);
    });

    logger.info(`Payment verified for order ${orderNumber} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.payment.status
      },
      message: 'Payment verified successfully. Order confirmed.'
    });
  } catch (error) {
    logger.error('Error verifying payment:', error);
    next(error);
  }
};

// ==================== HANDLE WEBHOOK ====================

exports.handleWebhook = async (req, res, next) => {
  try {
    const { event, payload } = req.body;

    // Note: In production, verify webhook signature from Razorpay
    // Use: crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(req.body)).digest('hex')
    // Compare with: req.headers['x-razorpay-signature']

    logger.info(`Processing webhook: ${event}`, {
      paymentId: payload?.payment?.id,
      orderId: payload?.order?.id
    });

    // Process webhook
    const result = await paymentService.handlePaymentWebhook({
      event,
      payload
    });

    // Always return 200 to acknowledge receipt
    return res.status(200).json({
      success: true,
      acknowledged: true,
      message: `Webhook ${event} processed`
    });
  } catch (error) {
    logger.error('Error handling webhook:', error);

    // Still return 200 to prevent Razorpay retry
    return res.status(200).json({
      acknowledged: true,
      error: error.message
    });
  }
};

// ==================== GET PAYMENT STATUS ====================

exports.getPaymentStatus = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;

    const order = await Order.findOne({
      orderNumber,
      userId: req.user._id
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    const paymentStatusDisplay = paymentService.getPaymentStatusDisplay(order.payment.status);

    return res.status(200).json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        paymentMethod: order.payment.method,
        paymentStatus: order.payment.status,
        paymentStatusDisplay,
        totalAmount: order.pricing.totalAmount,
        paidAt: order.payment.paidAt,
        razorpayPaymentId: order.payment.razorpayPaymentId || null
      },
      message: 'Payment status retrieved'
    });
  } catch (error) {
    logger.error('Error getting payment status:', error);
    next(error);
  }
};

// ==================== REFUND ORDER (ADMIN) ====================

exports.refundOrder = async (req, res, next) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      throw new AppError('Only admins can process refunds', 403, 'UNAUTHORIZED');
    }

    const { orderNumber } = req.params;
    const { amount, reason = '' } = req.body;

    const order = await Order.findOne({ orderNumber });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Validate refund amount
    if (amount <= 0) {
      throw new ValidationError('Refund amount must be greater than 0', 'INVALID_REFUND_AMOUNT');
    }

    if (amount > order.pricing.totalAmount) {
      throw new AppError('Refund amount exceeds order total', 400, 'REFUND_EXCEEDS_TOTAL');
    }

    // Process refund
    const refund = await paymentService.processRefund({
      orderId: order._id,
      amount,
      reason
    });

    logger.info(`Refund processed for order ${orderNumber} by admin ${req.user._id}`, {
      refundId: refund.id,
      amount: refund.amount
    });

    return res.status(200).json({
      success: true,
      data: {
        refundId: refund.id,
        amount: refund.amount / 100, // Convert back to rupees
        status: refund.status,
        orderNumber
      },
      message: `Refund of ₹${amount} processed successfully`
    });
  } catch (error) {
    logger.error('Error processing refund:', error);
    next(error);
  }
};

module.exports = exports;
