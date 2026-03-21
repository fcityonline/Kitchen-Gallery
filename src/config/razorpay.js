// backend/src/config/razorpay.js

const Razorpay = require('razorpay');
const logger = require('./logger');

/**
 * Razorpay Instance Configuration
 * 
 * Setup:
 * 1. Sign up at https://razorpay.com
 * 2. Get API Key & Key Secret from Dashboard
 * 3. Add to .env:
 *    RAZORPAY_KEY_ID=YOUR_KEY_ID
 *    RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET
 * 4. Setup webhook at:
 *    https://dashboard.razorpay.com/app/webhooks
 *    Event: payment.authorized, payment.captured, payment.failed
 *    URL: https://yourdomain.com/api/orders/payment/webhook
 */

let razorpayInstance = null;

const initializeRazorpay = () => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      logger.warn('Razorpay credentials not configured. Payment features will be disabled.');
      return null;
    }

    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    logger.info('✅ Razorpay initialized successfully');
    return razorpayInstance;
  } catch (error) {
    logger.error('❌ Failed to initialize Razorpay:', error.message);
    return null;
  }
};

// Initialize on module load
const razorpay = initializeRazorpay();

/**
 * Get Razorpay Instance
 * Returns the initialized Razorpay instance or null if not configured
 */
const getRazorpayInstance = () => {
  return razorpay;
};

/**
 * Check if Razorpay is available
 */
const isRazorpayAvailable = () => {
  return razorpay !== null;
};

/**
 * Razorpay Order Creation Sample
 * 
 * @param {number} amount - Amount in paise (e.g., 50000 for ₹500)
 * @param {string} currency - Currency code (default: INR)
 * @param {object} options - Additional options
 * @returns {Promise<object>} Razorpay order object
 * 
 * Usage:
 * const order = await createRazorpayOrder(50000, 'INR', {
 *   receipt: 'ORD202603200001',
 *   notes: {
 *     userId: user._id,
 *     orderNumber: 'ORD202603200001'
 *   }
 * });
 */
const createRazorpayOrder = async (amount, currency = 'INR', options = {}) => {
  if (!razorpay) {
    throw new Error('Razorpay is not configured');
  }

  try {
    const defaultOptions = {
      amount,
      currency,
      receipt: options.receipt || `RECEIPT-${Date.now()}`,
      payment_capture: 1, // Auto capture payment
      timeout: 600, // 10 minutes
      notes: options.notes || {}
    };

    const order = await razorpay.orders.create(defaultOptions);

    logger.info(`Razorpay order created: ${order.id}`, {
      orderId: order.id,
      amount: order.amount,
      status: order.status
    });

    return order;
  } catch (error) {
    logger.error('Error creating Razorpay order:', error.message);
    throw error;
  }
};

/**
 * Verify Payment Signature
 * 
 * @param {string} orderId - Razorpay order ID
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} signature - Razorpay signature from webhook
 * @returns {boolean} True if signature is valid
 * 
 * Security: This MUST be called on webhook to prevent tampering
 */
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  if (!razorpay) {
    throw new Error('Razorpay is not configured');
  }

  try {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = expectedSignature === signature;

    if (isValid) {
      logger.info('✅ Payment signature verified');
    } else {
      logger.warn('⚠️ Payment signature verification failed');
    }

    return isValid;
  } catch (error) {
    logger.error('Error verifying payment signature:', error.message);
    return false;
  }
};

/**
 * Get Payment Details
 * 
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<object>} Payment details
 */
const getPaymentDetails = async (paymentId) => {
  if (!razorpay) {
    throw new Error('Razorpay is not configured');
  }

  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    logger.error(`Error fetching payment ${paymentId}:`, error.message);
    throw error;
  }
};

/**
 * Refund Payment
 * 
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Refund amount in paise (optional, full refund if not specified)
 * @param {string} reason - Refund reason
 * @param {object} notes - Additional notes
 * @returns {Promise<object>} Refund details
 */
const refundPayment = async (paymentId, { amount = null, reason = '', notes = {} } = {}) => {
  if (!razorpay) {
    throw new Error('Razorpay is not configured');
  }

  try {
    const refundOptions = {
      amount, // null for full refund
      reason,
      notes
    };

    // Remove null amount to allow full refund
    if (refundOptions.amount === null) {
      delete refundOptions.amount;
    }

    const refund = await razorpay.payments.refund(paymentId, refundOptions);

    logger.info(`Payment refunded: ${paymentId}`, {
      refundId: refund.id,
      amount: refund.amount,
      status: refund.status
    });

    return refund;
  } catch (error) {
    logger.error(`Error refunding payment ${paymentId}:`, error.message);
    throw error;
  }
};

/**
 * Get Refund Details
 * 
 * @param {string} refundId - Razorpay refund ID
 * @returns {Promise<object>} Refund details
 */
const getRefundDetails = async (refundId) => {
  if (!razorpay) {
    throw new Error('Razorpay is not configured');
  }

  try {
    const refund = await razorpay.refunds.fetch(refundId);
    return refund;
  } catch (error) {
    logger.error(`Error fetching refund ${refundId}:`, error.message);
    throw error;
  }
};

module.exports = {
  razorpay,
  getRazorpayInstance,
  isRazorpayAvailable,
  createRazorpayOrder,
  verifyPaymentSignature,
  getPaymentDetails,
  refundPayment,
  getRefundDetails
};
