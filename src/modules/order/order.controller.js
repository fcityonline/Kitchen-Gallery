const Order = require('../../models/order.model');
const Cart = require('../../models/cart.model');
const Product = require('../../models/product.model');
const Address = require('../../models/address.model');
const logger = require('../../config/logger');
const { AppError, ValidationError } = require('../../utils/errors');

// ==================== GET USER ORDERS ====================

exports.getUserOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

    const orders = await Order.getUserOrders(req.user._id, pageNum, limitNum);

    const totalCount = await Order.countDocuments({ userId: req.user._id });

    return res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          pages: Math.ceil(totalCount / limitNum)
        }
      },
      message: 'Orders retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching user orders:', error);
    next(error);
  }
};

// ==================== GET ORDER DETAILS ====================

exports.getOrderDetails = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;

    const order = await Order.findOne({
      orderNumber,
      userId: req.user._id
    })
      .populate('userId', 'name email')
      .populate('items.productId', 'slug')
      .lean();

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    return res.status(200).json({
      success: true,
      data: order,
      message: 'Order details retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching order details:', error);
    next(error);
  }
};

// ==================== CREATE ORDER ====================

exports.createOrder = async (req, res, next) => {
  try {
    const { addressId, paymentMethod = 'cod', notes = '' } = req.body;

    // Get user's cart
    const cart = await Cart.findOne({ userId: req.user._id, isActive: true });

    if (!cart || cart.isEmpty) {
      throw new AppError('Cart is empty', 400, 'EMPTY_CART');
    }

    // Get delivery address
    let deliveryAddress;

    if (addressId) {
      deliveryAddress = await Address.findOne({
        _id: addressId,
        userId: req.user._id,
        isActive: true
      });

      if (!deliveryAddress) {
        throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
      }
    } else {
      // Get default address
      deliveryAddress = await Address.getDefaultAddressForUser(req.user._id);

      if (!deliveryAddress) {
        throw new AppError('No delivery address provided', 400, 'ADDRESS_REQUIRED');
      }
    }

    // Validate address completeness
    if (!deliveryAddress.isComplete()) {
      throw new ValidationError('Address is incomplete', 'INCOMPLETE_ADDRESS');
    }

    // Validate stock for all items
    for (const item of cart.items) {
      const product = await Product.findById(item.productId);

      if (!product) {
        throw new AppError(`Product ${item.productName} not found`, 404, 'PRODUCT_NOT_FOUND');
      }

      if (product.stock.available < item.quantity) {
        throw new AppError(
          `Insufficient stock for ${item.productName}. Only ${product.stock.available} available`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }
    }

    // Create order
    const order = new Order({
      userId: req.user._id,
      items: cart.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        productSlug: item.productSlug,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount,
        tax: item.tax,
        finalPrice: item.finalPrice,
        image: item.image
      })),
      pricing: {
        subtotal: cart.summary.subtotal,
        totalDiscount: cart.summary.totalDiscount,
        totalTax: cart.summary.totalTax,
        shippingCharge: cart.summary.shippingCharge,
        totalAmount: cart.summary.total
      },
      deliveryAddress: {
        fullName: deliveryAddress.fullName,
        phoneNumber: deliveryAddress.phoneNumber,
        email: deliveryAddress.email,
        addressLine1: deliveryAddress.addressLine1,
        addressLine2: deliveryAddress.addressLine2,
        landmark: deliveryAddress.landmark,
        city: deliveryAddress.city,
        state: deliveryAddress.state,
        postalCode: deliveryAddress.postalCode,
        country: deliveryAddress.country,
        addressId: deliveryAddress._id
      },
      payment: {
        method: paymentMethod,
        status: paymentMethod === 'cod' ? 'pending' : 'pending'
      },
      notes,
      status: 'pending',
      createdBy: req.user._id
    });

    await order.save();

    // Reserve stock for all items
    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      await product.reserveStock(item.quantity);
    }

    // Clear cart
    cart.clear();
    await cart.save();

    logger.info(`Order created: ${order.orderNumber} for user ${req.user._id}`);

    return res.status(201).json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        totalAmount: order.pricing.totalAmount,
        paymentMethod: order.payment.method
      },
      message: 'Order created successfully'
    });
  } catch (error) {
    logger.error('Error creating order:', error);
    next(error);
  }
};

// ==================== CANCEL ORDER ====================

exports.cancelOrder = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;
    const { reason = '' } = req.body;

    const order = await Order.findOne({
      orderNumber,
      userId: req.user._id
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Check if can be cancelled
    if (!order.canBeCancelled()) {
      throw new AppError(
        `Cannot cancel order with status: ${order.status}`,
        400,
        'CANNOT_CANCEL_ORDER'
      );
    }

    // Cancel order
    order.cancelOrder(reason, req.user._id);

    // Release reserved stock
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        await product.releaseStock(item.quantity);
      }
    }

    await order.save();

    logger.info(`Order cancelled: ${orderNumber} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: order,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    logger.error('Error cancelling order:', error);
    next(error);
  }
};

// ==================== INITIATE RETURN ====================

exports.initiateReturn = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;
    const { reason = '' } = req.body;

    const order = await Order.findOne({
      orderNumber,
      userId: req.user._id
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Check if can be returned
    if (!order.canBeReturned()) {
      throw new AppError('Return window has expired or order is not delivered', 400, 'CANNOT_RETURN_ORDER');
    }

    // Initiate return
    order.initiateReturn(reason);
    await order.save();

    logger.info(`Return initiated: ${orderNumber} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: order,
      message: 'Return initiated. Our team will contact you shortly.'
    });
  } catch (error) {
    logger.error('Error initiating return:', error);
    next(error);
  }
};

// ==================== GET ALL ORDERS (ADMIN) ====================

exports.getAllOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let query = {};
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('orderNumber userId status pricing.totalAmount payment.status createdAt')
      .lean();

    const totalCount = await Order.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          pages: Math.ceil(totalCount / limitNum)
        }
      },
      message: 'Orders retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching all orders:', error);
    next(error);
  }
};

// ==================== GET ORDERS BY STATUS (ADMIN) ====================

exports.getOrdersByStatus = async (req, res, next) => {
  try {
    const { status } = req.params;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

    if (!validStatuses.includes(status)) {
      throw new ValidationError('Invalid status', 'INVALID_STATUS');
    }

    const orders = await Order.getOrdersByStatus(status, 50);

    return res.status(200).json({
      success: true,
      data: orders,
      message: `Orders with status '${status}' retrieved successfully`
    });
  } catch (error) {
    logger.error('Error fetching orders by status:', error);
    next(error);
  }
};

// ==================== UPDATE ORDER STATUS (ADMIN) ====================

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;
    const { status, note = '' } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

    if (!validStatuses.includes(status)) {
      throw new ValidationError('Invalid status', 'INVALID_STATUS');
    }

    const order = await Order.findOne({ orderNumber });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Update status
    order.updateStatus(status, note, req.user._id);
    await order.save();

    logger.info(`Order status updated: ${orderNumber} to ${status} by admin ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: order,
      message: `Order status updated to ${status}`
    });
  } catch (error) {
    logger.error('Error updating order status:', error);
    next(error);
  }
};

// ==================== UPDATE TRACKING (ADMIN) ====================

exports.updateTracking = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;
    const { trackingNumber, shippingProvider, trackingUrl } = req.body;

    if (!trackingNumber?.trim()) {
      throw new ValidationError('Tracking number is required', 'TRACKING_REQUIRED');
    }

    const order = await Order.findOne({ orderNumber });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Update tracking
    order.updateTracking(trackingNumber, shippingProvider || '', trackingUrl || '');

    // Auto-update status to shipped if not already
    if (order.status === 'processing') {
      order.updateStatus('shipped', 'Tracking number added', req.user._id);
    }

    await order.save();

    logger.info(
      `Tracking updated for order ${orderNumber}: ${trackingNumber} by admin ${req.user._id}`
    );

    return res.status(200).json({
      success: true,
      data: order,
      message: 'Tracking information updated'
    });
  } catch (error) {
    logger.error('Error updating tracking:', error);
    next(error);
  }
};

// ==================== PROCESS REFUND (ADMIN) ====================

exports.processRefund = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;
    const { amount, reason = '' } = req.body;

    if (!amount || amount <= 0) {
      throw new ValidationError('Refund amount must be greater than 0', 'INVALID_AMOUNT');
    }

    const order = await Order.findOne({ orderNumber });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    if (order.payment.status !== 'completed') {
      throw new AppError('Order payment not completed', 400, 'PAYMENT_NOT_COMPLETED');
    }

    if (amount > order.pricing.totalAmount) {
      throw new AppError('Refund amount exceeds order total', 400, 'REFUND_EXCEEDS_TOTAL');
    }

    // Process refund
    order.payment.status = 'refunded';
    order.payment.refundAmount = amount;
    order.payment.refundedAt = new Date();

    await order.save();

    logger.info(
      `Refund processed for order ${orderNumber}: ₹${amount} by admin ${req.user._id}`
    );

    return res.status(200).json({
      success: true,
      data: order,
      message: `Refund of ₹${amount} processed successfully`
    });
  } catch (error) {
    logger.error('Error processing refund:', error);
    next(error);
  }
};

// ==================== PAYMENT WEBHOOK ====================

exports.handlePaymentWebhook = async (req, res, next) => {
  try {
    const { orderId, paymentId, signature } = req.body;

    // TODO: Verify signature with Razorpay

    const order = await Order.findOne({
      'payment.razorpayOrderId': orderId
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Update payment
    order.markPaymentCompleted(paymentId, 'razorpay');
    order.payment.razorpayPaymentId = paymentId;
    order.payment.razorpaySignature = signature;
    order.updateStatus('confirmed', 'Payment successful');

    await order.save();

    logger.info(`Payment confirmed for order ${order.orderNumber}: ${paymentId}`);

    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully'
    });
  } catch (error) {
    logger.error('Error handling payment webhook:', error);
    // Important: Always return 200 to Razorpay webhook
    res.status(200).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = exports;
