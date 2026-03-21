/**
 * WhatsApp Routes
 * Manages user WhatsApp preferences and manual message sending (admin)
 */

const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../../middlewares/auth.middleware');
const User = require('../models/user.model');
const Order = require('../models/order.model');
const whatsappService = require('../services/whatsapp.service');
const { formatPhoneNumber, isValidWhatsAppNumber } = require('../config/whatsapp');
const logger = require('../config/logger');

/**
 * GET /api/whatsapp/preferences
 * Get user's WhatsApp preferences
 */
router.get('/preferences', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      'whatsappPhone whatsappNotifications'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        whatsappPhone: user.whatsappPhone || null,
        notifications: user.whatsappNotifications || {
          orderConfirmation: true,
          paymentConfirmation: true,
          orderProcessing: true,
          shipmentTracking: true,
          deliveryConfirmation: true,
          promotions: false
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/whatsapp/preferences
 * Update WhatsApp preferences and phone number
 */
router.post('/preferences', protect, async (req, res, next) => {
  try {
    const { whatsappPhone, notifications } = req.body;

    // Validate phone number if provided
    if (whatsappPhone && !isValidWhatsAppNumber(whatsappPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid WhatsApp phone number'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        whatsappPhone: whatsappPhone || null,
        whatsappNotifications: notifications || {
          orderConfirmation: true,
          paymentConfirmation: true,
          orderProcessing: true,
          shipmentTracking: true,
          deliveryConfirmation: true,
          promotions: false
        }
      },
      { new: true }
    ).select('whatsappPhone whatsappNotifications');

    logger.info(`WhatsApp preferences updated for user ${req.user._id}`);

    res.status(200).json({
      success: true,
      data: {
        whatsappPhone: user.whatsappPhone,
        notifications: user.whatsappNotifications
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/whatsapp/verify-phone
 * Send verification code to WhatsApp number
 * (In production, would generate and send OTP)
 */
router.post('/verify-phone', protect, async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber || !isValidWhatsAppNumber(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number'
      });
    }

    // In production, generate OTP and send
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

    // Store OTP in Redis or temporary field (with expiry)
    // For now, just log for demo
    logger.info(`WhatsApp verification OTP for ${phoneNumber}: ${otp}`);

    // In production: await whatsappService.sendWhatsAppMessage(
    //   phoneNumber,
    //   `Your Kitchen Gallery verification code is: ${otp}\nValid for 10 minutes`
    // );

    res.status(200).json({
      success: true,
      message: 'Verification code sent to WhatsApp',
      // In production, don't expose OTP
      data: { expiresIn: '10 minutes' }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/whatsapp/send-message
 * Admin endpoint to send manual WhatsApp message
 * Requires admin role
 */
router.post('/send-message', adminOnly, async (req, res, next) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message required'
      });
    }

    if (!isValidWhatsAppNumber(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number'
      });
    }

    if (message.length === 0 || message.length > 1024) {
      return res.status(400).json({
        success: false,
        message: 'Message must be 1-1024 characters'
      });
    }

    const result = await whatsappService.sendWhatsAppMessage(phoneNumber, message);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to send WhatsApp message',
        reason: result.reason
      });
    }

    logger.info(`Admin sent WhatsApp to ${phoneNumber}: ${result.messageSid}`);

    res.status(200).json({
      success: true,
      data: {
        messageSid: result.messageSid,
        status: result.status,
        timestamp: result.timestamp
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/whatsapp/order/:orderNumber/resend
 * Resend last notification for an order
 */
router.get('/order/:orderNumber/resend', protect, async (req, res, next) => {
  try {
    const order = await Order.findOne({
      orderNumber: req.params.orderNumber,
      userId: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Determine which notification to resend based on order status
    let result;
    let notificationType;

    if (order.status === 'delivered') {
      result = await whatsappService.sendDeliveryConfirmation(order);
      notificationType = 'deliveryConfirmation';
    } else if (order.status === 'shipped') {
      result = await whatsappService.sendShipmentTracking(order, order.tracking);
      notificationType = 'shipmentTracking';
    } else if (order.status === 'processing') {
      result = await whatsappService.sendOrderProcessing(order);
      notificationType = 'orderProcessing';
    } else if (order.payment.status === 'completed') {
      result = await whatsappService.sendPaymentConfirmation(order);
      notificationType = 'paymentConfirmation';
    } else {
      result = await whatsappService.sendOrderConfirmation(order);
      notificationType = 'orderConfirmation';
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to resend notification',
        reason: result.reason
      });
    }

    res.status(200).json({
      success: true,
      data: {
        messageType: notificationType,
        messageSid: result.messageSid,
        status: 'resent'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/whatsapp/notifications-history/:orderNumber
 * Get notification history for an order
 */
router.get('/notifications-history/:orderNumber', protect, async (req, res, next) => {
  try {
    const order = await Order.findOne({
      orderNumber: req.params.orderNumber,
      userId: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const notifications = order.notifications || [];

    res.status(200).json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        notifications: notifications.map(n => ({
          type: n.type,
          channel: n.channel,
          status: n.status,
          sentAt: n.sentAt,
          messageSid: n.messageSid
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/whatsapp/broadcast
 * Admin endpoint to send message to multiple users
 * (For promotional campaigns)
 */
router.post('/broadcast', adminOnly, async (req, res, next) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { message, users = 'all' } = req.body;

    if (!message || message.length === 0 || message.length > 1024) {
      return res.status(400).json({
        success: false,
        message: 'Message must be 1-1024 characters'
      });
    }

    let userPhones = [];

    if (users === 'all') {
      // Get all users who opted in for promotions
      const allUsers = await User.find({
        whatsappPhone: { $exists: true, $ne: null },
        'whatsappNotifications.promotions': true
      }).select('whatsappPhone');

      userPhones = allUsers.map(u => u.whatsappPhone);
    } else if (Array.isArray(users)) {
      // Specific user IDs
      const selectedUsers = await User.find({
        _id: { $in: users },
        whatsappPhone: { $exists: true, $ne: null }
      }).select('whatsappPhone');

      userPhones = selectedUsers.map(u => u.whatsappPhone);
    }

    if (userPhones.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No users found to send message'
      });
    }

    // Send messages
    const results = [];
    for (const phone of userPhones) {
      try {
        const result = await whatsappService.sendWhatsAppMessage(phone, message);
        results.push({
          phone: phone,
          success: result.success,
          messageSid: result.messageSid
        });
      } catch (error) {
        results.push({
          phone: phone,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(
      `Broadcast completed: ${successCount}/${results.length} messages sent`
    );

    res.status(200).json({
      success: true,
      data: {
        totalRecipients: userPhones.length,
        successful: successCount,
        failed: results.length - successCount,
        results: results
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
