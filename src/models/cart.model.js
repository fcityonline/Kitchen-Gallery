const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

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
          min: [1, 'Quantity must be at least 1'],
          max: [999, 'Quantity cannot exceed 999']
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
          get: function () {
            if (!this.price) return 0;
            const discounted = this.price * (1 - this.discount / 100);
            return parseFloat((discounted * (1 + this.tax / 100)).toFixed(2));
          }
        },
        image: String,
        addedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    summary: {
      subtotal: {
        type: Number,
        default: 0,
        get: (v) => parseFloat(v.toFixed(2))
      },
      totalDiscount: {
        type: Number,
        default: 0,
        get: (v) => parseFloat(v.toFixed(2))
      },
      totalTax: {
        type: Number,
        default: 0,
        get: (v) => parseFloat(v.toFixed(2))
      },
      shippingCharge: {
        type: Number,
        default: 0,
        min: 0,
        get: (v) => parseFloat(v.toFixed(2))
      },
      total: {
        type: Number,
        default: 0,
        get: (v) => parseFloat(v.toFixed(2))
      }
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    lastUpdated: {
      type: Date,
      default: Date.now,
      index: true
    },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, getters: true },
    toObject: { virtuals: true, getters: true }
  }
);

// ==================== VIRTUAL FIELDS ====================

cartSchema.virtual('itemCount').get(function () {
  return this.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
});

cartSchema.virtual('isEmpty').get(function () {
  return !this.items || this.items.length === 0;
});

// ==================== INDEXES ====================

cartSchema.index({ userId: 1, isActive: 1 });
cartSchema.index({ lastUpdated: -1 });

// ==================== INSTANCE METHODS ====================

/**
 * Add product to cart or increase quantity if already exists
 */
cartSchema.methods.addItem = function (product, quantity = 1) {
  const existingItem = this.items.find((item) => item.productId.toString() === product._id.toString());

  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.addedAt = Date.now();
  } else {
    this.items.push({
      productId: product._id,
      productName: product.name,
      productSlug: product.slug,
      quantity,
      price: product.pricing.finalPrice,
      discount: product.pricing.discount,
      tax: product.pricing.tax,
      image: product.images?.[0]?.url || ''
    });
  }

  this.updateSummary();
  return this;
};

/**
 * Remove product from cart
 */
cartSchema.methods.removeItem = function (productId) {
  this.items = this.items.filter((item) => item.productId.toString() !== productId.toString());
  this.updateSummary();
  return this;
};

/**
 * Update item quantity
 */
cartSchema.methods.updateItemQuantity = function (productId, quantity) {
  const item = this.items.find((item) => item.productId.toString() === productId.toString());

  if (!item) {
    throw new Error('Item not found in cart');
  }

  if (quantity <= 0) {
    return this.removeItem(productId);
  }

  item.quantity = quantity;
  this.updateSummary();
  return this;
};

/**
 * Clear all items from cart
 */
cartSchema.methods.clear = function () {
  this.items = [];
  this.updateSummary();
  return this;
};

/**
 * Calculate and update summary
 */
cartSchema.methods.updateSummary = function () {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  this.items.forEach((item) => {
    const itemSubtotal = item.price * item.quantity;
    const itemDiscount = itemSubtotal * (item.discount / 100);
    const itemDiscounted = itemSubtotal - itemDiscount;
    const itemTax = itemDiscounted * (item.tax / 100);

    subtotal += itemSubtotal;
    totalDiscount += itemDiscount;
    totalTax += itemTax;
  });

  this.summary.subtotal = parseFloat(subtotal.toFixed(2));
  this.summary.totalDiscount = parseFloat(totalDiscount.toFixed(2));
  this.summary.totalTax = parseFloat(totalTax.toFixed(2));
  this.summary.total = parseFloat(
    (this.summary.subtotal - this.summary.totalDiscount + this.summary.totalTax + this.summary.shippingCharge).toFixed(2)
  );

  this.lastUpdated = Date.now();
  return this;
};

/**
 * Apply or update shipping charge
 */
cartSchema.methods.setShipping = function (charge) {
  this.summary.shippingCharge = Math.max(0, parseFloat(charge.toFixed(2)));
  this.summary.total = parseFloat(
    (this.summary.subtotal - this.summary.totalDiscount + this.summary.totalTax + this.summary.shippingCharge).toFixed(2)
  );
  this.lastUpdated = Date.now();
  return this;
};

/**
 * Check if product has stock for requested quantity
 */
cartSchema.methods.validateStock = async function (productId, maxAvailable) {
  const item = this.items.find((item) => item.productId.toString() === productId.toString());

  if (!item) {
    throw new Error('Item not found in cart');
  }

  if (item.quantity > maxAvailable) {
    throw new Error(`Only ${maxAvailable} units available for ${item.productName}`);
  }

  return true;
};

/**
 * Get cart for order creation
 */
cartSchema.methods.getForOrder = function () {
  return {
    items: this.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.finalPrice,
      productName: item.productName
    })),
    summary: this.summary
  };
};

// ==================== STATIC METHODS ====================

/**
 * Get or create cart for user
 */
cartSchema.statics.getOrCreateCart = async function (userId) {
  let cart = await this.findOne({ userId, isActive: true });

  if (!cart) {
    cart = await this.create({
      userId,
      items: [],
      isActive: true
    });
  }

  return cart;
};

/**
 * Get cart summary for user
 */
cartSchema.statics.getCartSummary = function (userId) {
  return this.findOne({ userId, isActive: true }).select(
    'itemCount summary isActive lastUpdated'
  );
};

// ==================== MIDDLEWARE ====================

// Update lastUpdated on save
cartSchema.pre('save', function (next) {
  this.lastUpdated = Date.now();
  next();
});

// TTL index for automatic deletion of expired carts
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ==================== EXPORT ====================

const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart;
