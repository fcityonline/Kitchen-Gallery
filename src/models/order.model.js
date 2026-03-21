const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    // ==================== ORDER BASIC INFO ====================

    orderNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
      uppercase: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ==================== ORDER ITEMS ====================

    items: [
      {
        _id: false,
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true
        },
        productName: String,
        productSlug: String,
        quantity: {
          type: Number,
          required: true,
          min: 1
        },
        price: {
          type: Number,
          required: true,
          min: 0
        },
        discount: {
          type: Number,
          default: 0,
          min: 0,
          max: 100
        },
        tax: {
          type: Number,
          default: 0,
          min: 0,
          max: 100
        },
        finalPrice: {
          type: Number,
          required: true
        },
        image: String
      }
    ],

    // ==================== PRICING ====================

    pricing: {
      subtotal: {
        type: Number,
        required: true,
        min: 0,
        get: (v) => parseFloat(v.toFixed(2))
      },
      totalDiscount: {
        type: Number,
        default: 0,
        min: 0,
        get: (v) => parseFloat(v.toFixed(2))
      },
      totalTax: {
        type: Number,
        default: 0,
        min: 0,
        get: (v) => parseFloat(v.toFixed(2))
      },
      shippingCharge: {
        type: Number,
        default: 0,
        min: 0,
        get: (v) => parseFloat(v.toFixed(2))
      },
      couponDiscount: {
        type: Number,
        default: 0,
        min: 0,
        get: (v) => parseFloat(v.toFixed(2))
      },
      totalAmount: {
        type: Number,
        required: true,
        min: 0,
        get: (v) => parseFloat(v.toFixed(2))
      }
    },

    // ==================== DELIVERY ADDRESS ====================

    deliveryAddress: {
      fullName: String,
      phoneNumber: String,
      email: String,
      addressLine1: String,
      addressLine2: String,
      landmark: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
      addressId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Address'
      }
    },

    // ==================== ORDER STATUS ====================

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
      default: 'pending',
      index: true
    },

    statusHistory: [
      {
        _id: false,
        status: String,
        updatedAt: {
          type: Date,
          default: Date.now
        },
        note: String,
        updateBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }
    ],

    // ==================== PAYMENT ====================

    payment: {
      method: {
        type: String,
        enum: ['cod', 'razorpay', 'upi', 'card', 'wallet'],
        default: 'cod'
      },
      status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending',
        index: true
      },
      transactionId: String,
      razorpayOrderId: String,
      razorpayPaymentId: String,
      razorpaySignature: String,
      paidAt: Date,
      refundAmount: {
        type: Number,
        default: 0,
        min: 0
      },
      refundedAt: Date
    },

    // ==================== TRACKING ====================

    tracking: {
      shippingProvider: String,
      trackingNumber: String,
      trackingUrl: String,
      estimatedDelivery: Date,
      actualDelivery: Date,
      updates: [
        {
          _id: false,
          status: String,
          timestamp: Date,
          location: String
        }
      ]
    },

    // ==================== ADDITIONAL INFO ====================

    notes: String,

    cancellationReason: String,
    cancelledAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    returnReason: String,
    returnedAt: Date,
    returnApprovalDate: Date,
    returnRefundDate: Date,

    // ==================== NOTIFICATIONS ====================
    notifications: [
      {
        _id: false,
        type: {
          type: String,
          enum: [
            'orderConfirmation',
            'paymentConfirmation',
            'orderProcessing',
            'shipmentTracking',
            'deliveryConfirmation',
            'paymentFailed',
            'returnInitiated',
            'refundProcessed'
          ]
        },
        channel: {
          type: String,
          enum: ['whatsapp', 'email', 'sms'],
          default: 'whatsapp'
        },
        status: {
          type: String,
          enum: ['sent', 'delivered', 'failed', 'disabled'],
          default: 'sent'
        },
        messageSid: String, // Twilio message ID
        sentAt: {
          type: Date,
          default: Date.now
        },
        phoneNumber: String, // For WhatsApp
        trackingNumber: String, // If notification includes tracking
        refundAmount: Number, // If notification includes refund
        errorMessage: String // If failed
      }
    ],

    // ==================== AUDIT ====================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, getters: true },
    toObject: { virtuals: true, getters: true }
  }
);

// ==================== VIRTUAL FIELDS ====================

orderSchema.virtual('itemCount').get(function () {
  return this.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
});

orderSchema.virtual('daysSinceOrder').get(function () {
  const now = new Date();
  const orderDate = new Date(this.createdAt);
  return Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));
});

// ==================== INDEXES ====================

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'payment.status': 1 });
orderSchema.index({ createdAt: -1 });

// ==================== INSTANCE METHODS ====================

/**
 * Update order status with history
 */
orderSchema.methods.updateStatus = function (newStatus, note = '', updatedBy = null) {
  if (this.status === newStatus) {
    throw new Error('Cannot update to same status');
  }

  // Add to history
  this.statusHistory.push({
    status: newStatus,
    updatedAt: new Date(),
    note,
    updateBy: updatedBy
  });

  this.status = newStatus;
  this.updatedAt = Date.now();

  return this;
};

/**
 * Mark payment as completed
 */
orderSchema.methods.markPaymentCompleted = function (transactionId, method = 'razorpay') {
  this.payment.status = 'completed';
  this.payment.transactionId = transactionId;
  this.payment.method = method;
  this.payment.paidAt = new Date();
  return this;
};

/**
 * Mark payment as failed
 */
orderSchema.methods.markPaymentFailed = function () {
  this.payment.status = 'failed';
  this.payment.paidAt = null;
  return this;
};

/**
 * Cancel order
 */
orderSchema.methods.cancelOrder = function (reason = '', userId = null) {
  if (['shipped', 'delivered', 'cancelled'].includes(this.status)) {
    throw new Error(`Cannot cancel order with status: ${this.status}`);
  }

  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.cancelledAt = new Date();
  this.cancelledBy = userId;

  // Refund if paid
  if (this.payment.status === 'completed') {
    this.payment.status = 'refunded';
    this.payment.refundAmount = this.pricing.totalAmount;
    this.payment.refundedAt = new Date();
  }

  return this;
};

/**
 * Add tracking information
 */
orderSchema.methods.updateTracking = function (trackingNumber, provider, trackingUrl) {
  this.tracking.trackingNumber = trackingNumber;
  this.tracking.shippingProvider = provider;
  this.tracking.trackingUrl = trackingUrl;
  return this;
};

/**
 * Check if order can be cancelled
 */
orderSchema.methods.canBeCancelled = function () {
  return !['shipped', 'delivered', 'cancelled'].includes(this.status);
};

/**
 * Check if order can be returned
 */
orderSchema.methods.canBeReturned = function () {
  if (this.status !== 'delivered') return false;
  if (!this.tracking.actualDelivery) return false;

  const deliveryDate = new Date(this.tracking.actualDelivery);
  const now = new Date();
  const daysSinceDelivery = Math.floor((now - deliveryDate) / (1000 * 60 * 60 * 24));

  return daysSinceDelivery <= 7; // 7 days return window
};

/**
 * Initiate return
 */
orderSchema.methods.initiateReturn = function (reason) {
  if (!this.canBeReturned()) {
    throw new Error('Return window has expired');
  }

  this.returnReason = reason;
  this.status = 'returned';
  this.returnedAt = new Date();

  return this;
};

// ==================== STATIC METHODS ====================

/**
 * Generate unique order number
 */
orderSchema.statics.generateOrderNumber = async function () {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  const count = await this.countDocuments({
    createdAt: {
      $gte: new Date(year, date.getMonth(), date.getDate()),
      $lt: new Date(year, date.getMonth(), date.getDate() + 1)
    }
  });

  return `ORD${year}${month}${day}${String(count + 1).padStart(5, '0')}`;
};

/**
 * Get user orders with pagination
 */
orderSchema.statics.getUserOrders = function (userId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('orderNumber status pricing.totalAmount payment.status createdAt')
    .lean();
};

/**
 * Get orders by status
 */
orderSchema.statics.getOrdersByStatus = function (status, limit = 50) {
  return this.find({ status })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

// ==================== MIDDLEWARE ====================

// Generate order number on create
orderSchema.pre('save', async function (next) {
  if (!this.orderNumber) {
    this.orderNumber = await this.constructor.generateOrderNumber();
  }
  this.updatedAt = Date.now();
  next();
});

// Update status history on first status change
orderSchema.pre('save', function (next) {
  if (this.isModified('status') && this.statusHistory.length === 0) {
    this.statusHistory.push({
      status: this.status,
      updatedAt: new Date()
    });
  }
  next();
});

// ==================== EXPORT ====================

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
