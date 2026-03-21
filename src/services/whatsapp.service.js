/**
 * WhatsApp Notification Service
 * Handles all WhatsApp messages for orders, payments, tracking
 * 
 * Message Types:
 * 1. Order Confirmation - When order is placed
 * 2. Payment Confirmation - When payment is successful
 * 3. Order Processing - When order moves to processing
 * 4. Order Shipped - When order is shipped with tracking
 * 5. Order Delivered - When order is delivered
 * 6. Return Initiated - When return is requested
 * 7. Refund Processed - When refund is issued
 */

const {
  sendWhatsAppMessage,
  formatPhoneNumber,
  isValidWhatsAppNumber,
  isWhatsAppAvailable
} = require('../config/whatsapp');
const logger = require('../config/logger');

/**
 * Message Templates - Can be customized
 */
const messageTemplates = {
  orderConfirmation: (orderNumber, amount) => `
🎉 Order Confirmed!

Order #${orderNumber}
Total: ₹${amount.toLocaleString('en-IN')}

We're processing your order. You'll receive payment details shortly.

View order: https://kitchengallery.com/orders/${orderNumber}
`,

  paymentConfirmed: (orderNumber, amount, paymentMethod) => `
✅ Payment Received!

Order #${orderNumber}
Amount: ₹${amount.toLocaleString('en-IN')}
Method: ${paymentMethod === 'razorpay' ? '💳 Online' : '💵 Cash on Delivery'}

Thank you for your purchase! Your order will be processed soon.
`,

  orderProcessing: (orderNumber) => `
📦 Order Processing

Order #${orderNumber}
Status: Processing

Your order is being carefully prepared. We'll notify you when it ships.
`,

  orderShipped: (orderNumber, trackingNumber, carrier) => `
🚚 Order Shipped!

Order #${orderNumber}
Tracking: ${trackingNumber}
Carrier: ${carrier}

Track your package:
${getTrackingUrl(carrier, trackingNumber)}

Delivery expected within 3-5 business days.
`,

  orderDelivered: (orderNumber) => `
✨ Order Delivered!

Order #${orderNumber}
Status: Delivered

Thank you for shopping with Kitchen Gallery! 

We'd love your feedback. Rate your order: https://kitchengallery.com/orders/${orderNumber}/review
`,

  returnInitiated: (orderNumber, reason) => `
↩️ Return Initiated

Order #${orderNumber}
Reason: ${reason}

Your return request has been received. We'll arrange pickup within 24 hours.
`,

  refundProcessed: (orderNumber, amount) => `
💰 Refund Processed

Order #${orderNumber}
Refund Amount: ₹${amount.toLocaleString('en-IN')}

Refund will reflect in your account within 5-7 business days.
`,

  paymentFailed: (orderNumber) => `
❌ Payment Failed

Order #${orderNumber}
Status: Pending Payment

Your payment could not be processed. Please retry:
https://kitchengallery.com/orders/${orderNumber}/retry-payment
`,

  userPromo: (promoCode, discount) => `
🎁 Special Offer for You!

Use code: ${promoCode}
Get ${discount}% off your next order

Shop now: https://kitchengallery.com
Valid for 7 days only!
`
};

/**
 * Get tracking URL based on carrier
 * @param {string} carrier - Shipping carrier name
 * @param {string} trackingNumber - Tracking number
 * @returns {string} - Tracking URL
 */
const getTrackingUrl = (carrier, trackingNumber) => {
  const urls = {
    'DHL': `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
    'FedEx': `https://tracking.fedex.com/en/tracking/search?shipments=${trackingNumber}`,
    'UPS': `https://www.ups.com/track?tracknum=${trackingNumber}`,
    'DTDC': `https://tracking.dtdc.com/tracking/track?trackingNumber=${trackingNumber}`,
    'Ecom Express': `https://tracking.ecomexpress.in/?awb=${trackingNumber}`,
    'FirstFlight': `https://www.firstflight.in/track`,
    'default': 'https://kitchengallery.com/order-tracking'
  };
  
  return urls[carrier] || urls['default'];
};

/**
 * Send order confirmation message
 * @param {Object} order - Order document
 * @returns {Promise<Object>} - {success, messageSid}
 */
const sendOrderConfirmation = async (order) => {
  try {
    if (!isWhatsAppAvailable()) {
      logger.warn('WhatsApp not configured, order confirmation not sent');
      return { success: false, reason: 'WhatsApp_disabled' };
    }

    const phoneNumber = order.deliveryAddress?.phoneNumber;
    if (!phoneNumber || !isValidWhatsAppNumber(phoneNumber)) {
      logger.warn(`Invalid phone number for order ${order.orderNumber}`);
      return { success: false, reason: 'Invalid_phone' };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const message = messageTemplates.orderConfirmation(
      order.orderNumber,
      order.pricing.totalAmount
    );

    const result = await sendWhatsAppMessage(formattedPhone, message);

    // Store in order for audit trail
    if (!order.notifications) {
      order.notifications = [];
    }
    order.notifications.push({
      type: 'orderConfirmation',
      channel: 'whatsapp',
      status: result.status,
      messageSid: result.messageSid,
      sentAt: new Date(),
      phoneNumber: phoneNumber
    });
    await order.save();

    logger.info(`Order confirmation sent: ${order.orderNumber}`);
    return { success: true, messageSid: result.messageSid };
  } catch (error) {
    logger.error(`Failed to send order confirmation: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

/**
 * Send payment confirmation message
 * @param {Object} order - Order document
 * @returns {Promise<Object>} - {success, messageSid}
 */
const sendPaymentConfirmation = async (order) => {
  try {
    if (!isWhatsAppAvailable()) {
      return { success: false, reason: 'WhatsApp_disabled' };
    }

    const phoneNumber = order.deliveryAddress?.phoneNumber;
    if (!phoneNumber || !isValidWhatsAppNumber(phoneNumber)) {
      return { success: false, reason: 'Invalid_phone' };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const message = messageTemplates.paymentConfirmed(
      order.orderNumber,
      order.pricing.totalAmount,
      order.payment.method
    );

    const result = await sendWhatsAppMessage(formattedPhone, message);

    if (!order.notifications) {
      order.notifications = [];
    }
    order.notifications.push({
      type: 'paymentConfirmation',
      channel: 'whatsapp',
      status: result.status,
      messageSid: result.messageSid,
      sentAt: new Date(),
      phoneNumber: phoneNumber
    });
    await order.save();

    logger.info(`Payment confirmation sent: ${order.orderNumber}`);
    return { success: true, messageSid: result.messageSid };
  } catch (error) {
    logger.error(`Failed to send payment confirmation: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

/**
 * Send order processing message
 * @param {Object} order - Order document
 * @returns {Promise<Object>}
 */
const sendOrderProcessing = async (order) => {
  try {
    if (!isWhatsAppAvailable()) {
      return { success: false, reason: 'WhatsApp_disabled' };
    }

    const phoneNumber = order.deliveryAddress?.phoneNumber;
    if (!phoneNumber || !isValidWhatsAppNumber(phoneNumber)) {
      return { success: false, reason: 'Invalid_phone' };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const message = messageTemplates.orderProcessing(order.orderNumber);

    const result = await sendWhatsAppMessage(formattedPhone, message);

    if (!order.notifications) {
      order.notifications = [];
    }
    order.notifications.push({
      type: 'orderProcessing',
      channel: 'whatsapp',
      status: result.status,
      messageSid: result.messageSid,
      sentAt: new Date()
    });
    await order.save();

    return { success: true, messageSid: result.messageSid };
  } catch (error) {
    logger.error(`Failed to send order processing: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

/**
 * Send shipment tracking message
 * @param {Object} order - Order document
 * @param {Object} tracking - {trackingNumber, shippingProvider}
 * @returns {Promise<Object>}
 */
const sendShipmentTracking = async (order, tracking) => {
  try {
    if (!isWhatsAppAvailable()) {
      return { success: false, reason: 'WhatsApp_disabled' };
    }

    const phoneNumber = order.deliveryAddress?.phoneNumber;
    if (!phoneNumber || !isValidWhatsAppNumber(phoneNumber)) {
      return { success: false, reason: 'Invalid_phone' };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const message = messageTemplates.orderShipped(
      order.orderNumber,
      tracking.trackingNumber,
      tracking.shippingProvider
    );

    const result = await sendWhatsAppMessage(formattedPhone, message);

    if (!order.notifications) {
      order.notifications = [];
    }
    order.notifications.push({
      type: 'shipmentTracking',
      channel: 'whatsapp',
      status: result.status,
      messageSid: result.messageSid,
      sentAt: new Date(),
      trackingNumber: tracking.trackingNumber
    });
    await order.save();

    logger.info(`Shipment tracking sent: ${order.orderNumber}`);
    return { success: true, messageSid: result.messageSid };
  } catch (error) {
    logger.error(`Failed to send shipment tracking: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

/**
 * Send delivery confirmation message
 * @param {Object} order - Order document
 * @returns {Promise<Object>}
 */
const sendDeliveryConfirmation = async (order) => {
  try {
    if (!isWhatsAppAvailable()) {
      return { success: false, reason: 'WhatsApp_disabled' };
    }

    const phoneNumber = order.deliveryAddress?.phoneNumber;
    if (!phoneNumber || !isValidWhatsAppNumber(phoneNumber)) {
      return { success: false, reason: 'Invalid_phone' };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const message = messageTemplates.orderDelivered(order.orderNumber);

    const result = await sendWhatsAppMessage(formattedPhone, message);

    if (!order.notifications) {
      order.notifications = [];
    }
    order.notifications.push({
      type: 'deliveryConfirmation',
      channel: 'whatsapp',
      status: result.status,
      messageSid: result.messageSid,
      sentAt: new Date()
    });
    await order.save();

    logger.info(`Delivery confirmation sent: ${order.orderNumber}`);
    return { success: true, messageSid: result.messageSid };
  } catch (error) {
    logger.error(`Failed to send delivery confirmation: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

/**
 * Send payment failure message
 * @param {Object} order - Order document
 * @returns {Promise<Object>}
 */
const sendPaymentFailed = async (order) => {
  try {
    if (!isWhatsAppAvailable()) {
      return { success: false, reason: 'WhatsApp_disabled' };
    }

    const phoneNumber = order.deliveryAddress?.phoneNumber;
    if (!phoneNumber || !isValidWhatsAppNumber(phoneNumber)) {
      return { success: false, reason: 'Invalid_phone' };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const message = messageTemplates.paymentFailed(order.orderNumber);

    const result = await sendWhatsAppMessage(formattedPhone, message);

    if (!order.notifications) {
      order.notifications = [];
    }
    order.notifications.push({
      type: 'paymentFailed',
      channel: 'whatsapp',
      status: result.status,
      messageSid: result.messageSid,
      sentAt: new Date()
    });
    await order.save();

    return { success: true, messageSid: result.messageSid };
  } catch (error) {
    logger.error(`Failed to send payment failed notification: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

/**
 * Send return initiated message
 * @param {Object} order - Order document
 * @param {string} reason - Return reason
 * @returns {Promise<Object>}
 */
const sendReturnInitiated = async (order, reason = 'Quality issue') => {
  try {
    if (!isWhatsAppAvailable()) {
      return { success: false, reason: 'WhatsApp_disabled' };
    }

    const phoneNumber = order.deliveryAddress?.phoneNumber;
    if (!phoneNumber || !isValidWhatsAppNumber(phoneNumber)) {
      return { success: false, reason: 'Invalid_phone' };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const message = messageTemplates.returnInitiated(order.orderNumber, reason);

    const result = await sendWhatsAppMessage(formattedPhone, message);

    if (!order.notifications) {
      order.notifications = [];
    }
    order.notifications.push({
      type: 'returnInitiated',
      channel: 'whatsapp',
      status: result.status,
      messageSid: result.messageSid,
      sentAt: new Date()
    });
    await order.save();

    return { success: true, messageSid: result.messageSid };
  } catch (error) {
    logger.error(`Failed to send return initiated: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

/**
 * Send refund processed message
 * @param {Object} order - Order document
 * @param {number} refundAmount - Refund amount in rupees
 * @returns {Promise<Object>}
 */
const sendRefundProcessed = async (order, refundAmount) => {
  try {
    if (!isWhatsAppAvailable()) {
      return { success: false, reason: 'WhatsApp_disabled' };
    }

    const phoneNumber = order.deliveryAddress?.phoneNumber;
    if (!phoneNumber || !isValidWhatsAppNumber(phoneNumber)) {
      return { success: false, reason: 'Invalid_phone' };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const message = messageTemplates.refundProcessed(order.orderNumber, refundAmount);

    const result = await sendWhatsAppMessage(formattedPhone, message);

    if (!order.notifications) {
      order.notifications = [];
    }
    order.notifications.push({
      type: 'refundProcessed',
      channel: 'whatsapp',
      status: result.status,
      messageSid: result.messageSid,
      sentAt: new Date(),
      refundAmount
    });
    await order.save();

    logger.info(`Refund notification sent: ${order.orderNumber}`);
    return { success: true, messageSid: result.messageSid };
  } catch (error) {
    logger.error(`Failed to send refund processed: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

/**
 * Send promotional message to user
 * @param {string} phoneNumber - User phone number
 * @param {string} promoCode - Promo code
 * @param {number} discount - Discount percentage
 * @returns {Promise<Object>}
 */
const sendPromotion = async (phoneNumber, promoCode, discount) => {
  try {
    if (!isWhatsAppAvailable()) {
      return { success: false, reason: 'WhatsApp_disabled' };
    }

    if (!isValidWhatsAppNumber(phoneNumber)) {
      return { success: false, reason: 'Invalid_phone' };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const message = messageTemplates.userPromo(promoCode, discount);

    const result = await sendWhatsAppMessage(formattedPhone, message);

    logger.info(`Promotional message sent to ${phoneNumber}`);
    return { success: true, messageSid: result.messageSid };
  } catch (error) {
    logger.error(`Failed to send promotional message: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

module.exports = {
  sendOrderConfirmation,
  sendPaymentConfirmation,
  sendOrderProcessing,
  sendShipmentTracking,
  sendDeliveryConfirmation,
  sendPaymentFailed,
  sendReturnInitiated,
  sendRefundProcessed,
  sendPromotion,
  messageTemplates
};
