const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    // ==================== BASIC INFO ====================

    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [3, 'Product name must be at least 3 characters'],
      maxlength: [200, 'Product name cannot exceed 200 characters'],
      lowercase: true,
      index: true
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
      set(value) {
        return value || this.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
    },

    description: {
      short: {
        type: String,
        trim: true,
        maxlength: [300, 'Short description cannot exceed 300 characters']
      },
      detailed: {
        type: String,
        trim: true,
        maxlength: [5000, 'Detailed description cannot exceed 5000 characters']
      }
    },

    // ==================== CATEGORIZATION ====================

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
      index: true
    },

    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true
    },

    // ==================== PRICING ====================

    pricing: {
      costPrice: {
        type: Number,
        required: [true, 'Cost price is required'],
        min: [0, 'Cost price cannot be negative'],
        get: (v) => v ? parseFloat(v.toFixed(2)) : 0
      },

      sellingPrice: {
        type: Number,
        required: [true, 'Selling price is required'],
        min: [0, 'Selling price cannot be negative'],
        get: (v) => v ? parseFloat(v.toFixed(2)) : 0
      },

      discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative'],
        max: [100, 'Discount cannot exceed 100%'],
        // Calculate final price based on discount
        get: function (v) {
          return v || ((this.pricing?.sellingPrice - this.pricing?.costPrice) / this.pricing?.sellingPrice * 100).toFixed(2);
        }
      },

      tax: {
        type: Number,
        default: 0,
        min: [0, 'Tax cannot be negative'],
        max: [100, 'Tax cannot exceed 100%']
      },

      // Derived field
      finalPrice: {
        type: Number,
        get: function () {
          if (!this.pricing?.sellingPrice) return 0;
          const discounted = this.pricing.sellingPrice * (1 - this.pricing?.discount / 100);
          return parseFloat((discounted * (1 + this.pricing?.tax / 100)).toFixed(2));
        }
      }
    },

    // ==================== INVENTORY ====================

    stock: {
      quantity: {
        type: Number,
        required: [true, 'Stock quantity is required'],
        default: 0,
        min: [0, 'Stock cannot be negative'],
        index: true
      },

      lowStockLevel: {
        type: Number,
        default: 10,
        min: [0, 'Low stock level cannot be negative']
      },

      reservedQuantity: {
        type: Number,
        default: 0,
        min: [0, 'Reserved quantity cannot be negative']
      },

      // Available = quantity - reservedQuantity
      available: {
        type: Number,
        get: function () {
          return Math.max(0, (this.stock?.quantity || 0) - (this.stock?.reservedQuantity || 0));
        }
      },

      sku: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        uppercase: true,
        index: true
      }
    },

    // ==================== SPECIFICATIONS ====================

    specifications: [
      {
        _id: false,
        name: {
          type: String,
          required: true,
          trim: true
        },
        value: {
          type: String,
          required: true,
          trim: true
        },
        unit: String
      }
    ],

    attributes: {
      material: String,
      color: String,
      size: String,
      weight: String,
      dimensions: {
        length: Number,
        width: Number,
        height: Number,
        unit: {
          type: String,
          enum: ['cm', 'inch', 'm'],
          default: 'cm'
        }
      },
      warranty: {
        period: Number,
        unit: {
          type: String,
          enum: ['days', 'months', 'years'],
          default: 'months'
        }
      }
    },

    // ==================== MEDIA ====================

    images: [
      {
        _id: false,
        url: {
          type: String,
          required: true
        },
        publicId: String, // For Cloudinary
        alt: String,
        isThumbnail: {
          type: Boolean,
          default: false
        },
        uploadedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    // ==================== RELATED PRODUCTS ====================

    relatedProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        index: true
      }
    ],

    // ==================== STATUS & VISIBILITY ====================

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true
    },

    isNewArrival: {
      type: Boolean,
      default: false,
      index: true
    },

    isBestSeller: {
      type: Boolean,
      default: false,
      index: true
    },

    isOnSale: {
      type: Boolean,
      default: false,
      index: true
    },

    visibility: {
      type: String,
      enum: ['public', 'private', 'admin-only'],
      default: 'public',
      index: true
    },

    // ==================== SEO ====================

    seoTitle: {
      type: String,
      maxlength: [60, 'SEO title cannot exceed 60 characters']
    },

    seoMetaDescription: {
      type: String,
      maxlength: [160, 'SEO meta description cannot exceed 160 characters']
    },

    seoKeywords: [String],

    // ==================== RATINGS & REVIEWS ====================

    ratings: {
      average: {
        type: Number,
        default: 0,
        min: [0, 'Rating cannot be less than 0'],
        max: [5, 'Rating cannot be more than 5'],
        get: (v) => parseFloat(v.toFixed(1))
      },

      count: {
        type: Number,
        default: 0,
        min: 0
      },

      distribution: {
        5: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        1: { type: Number, default: 0 }
      }
    },

    // ==================== STATISTICS ====================

    stats: {
      viewCount: {
        type: Number,
        default: 0,
        min: 0
      },

      favouriteCount: {
        type: Number,
        default: 0,
        min: 0
      },

      sellCount: {
        type: Number,
        default: 0,
        min: 0
      }
    },

    // ==================== AUDIT ====================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    updatedAt: {
      type: Date,
      default: Date.now
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, getters: true },
    toObject: { virtuals: true, getters: true }
  }
);

// ==================== INDEXES ====================

productSchema.index({ name: 'text', description: 'text', 'specifications.value': 'text' });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ category: 1, subCategory: 1, isActive: 1 });
productSchema.index({ 'pricing.finalPrice': 1, isActive: 1 });
productSchema.index({ 'stock.quantity': 1, isActive: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ isBestSeller: 1, isActive: 1 });
productSchema.index({ createdAt: -1, isActive: 1 });
productSchema.index({ 'ratings.average': -1, isActive: 1 });

// ==================== INSTANCE METHODS ====================

/**
 * Check if product is in stock
 */
productSchema.methods.isInStock = function () {
  return this.stock.available > 0;
};

/**
 * Check if low on stock
 */
productSchema.methods.isLowStock = function () {
  return this.stock.available <= this.stock.lowStockLevel;
};

/**
 * Get discount percentage (pre-calculated or derived)
 */
productSchema.methods.getDiscount = function () {
  if (this.pricing.discount) {
    return this.pricing.discount;
  }
  if (this.pricing.costPrice && this.pricing.sellingPrice) {
    return ((this.pricing.sellingPrice - this.pricing.costPrice) / this.pricing.sellingPrice * 100).toFixed(2);
  }
  return 0;
};

/**
 * Get thumbnail image
 */
productSchema.methods.getThumbnail = function () {
  if (!this.images || this.images.length === 0) {
    return null;
  }
  const thumbnail = this.images.find((img) => img.isThumbnail);
  return thumbnail || this.images[0];
};

/**
 * Reserve stock for order
 */
productSchema.methods.reserveStock = async function (quantity) {
  if (this.stock.available < quantity) {
    throw new Error('Insufficient stock available');
  }
  this.stock.reservedQuantity += quantity;
  await this.save();
  return this.stock.available;
};

/**
 * Release reserved stock (when order cancelled)
 */
productSchema.methods.releaseStock = async function (quantity) {
  this.stock.reservedQuantity = Math.max(0, this.stock.reservedQuantity - quantity);
  await this.save();
  return this.stock.available;
};

/**
 * Confirm stock for order (convert reserved to sold)
 */
productSchema.methods.confirmStock = async function (quantity) {
  this.stock.quantity -= quantity;
  this.stock.reservedQuantity = Math.max(0, this.stock.reservedQuantity - quantity);
  this.stats.sellCount += 1;
  await this.save();
  return this;
};

/**
 * Update rating
 */
productSchema.methods.updateRating = async function (newRating) {
  const totalRatings = this.ratings.count + 1;
  this.ratings.average = ((this.ratings.average * this.ratings.count) + newRating) / totalRatings;
  this.ratings.count = totalRatings;
  this.ratings.distribution[newRating] = (this.ratings.distribution[newRating] || 0) + 1;
  await this.save();
  return this.ratings;
};

/**
 * Increment view counter
 */
productSchema.methods.incrementViewCount = async function () {
  this.stats.viewCount += 1;
  await this.save({ validateBeforeSave: false });
};

// ==================== STATIC METHODS ====================

/**
 * Get featured products
 */
productSchema.statics.getFeatured = function (limit = 12) {
  return this.find({
    isFeatured: true,
    isActive: true,
    deletedAt: null
  })
    .select('name slug images pricing ratings.average stock.available isBestSeller')
    .limit(limit)
    .sort({ createdAt: -1 });
};

/**
 * Get best sellers
 */
productSchema.statics.getBestSellers = function (limit = 12) {
  return this.find({
    isBestSeller: true,
    isActive: true,
    deletedAt: null
  })
    .select('name slug images pricing ratings.average stock.available')
    .limit(limit)
    .sort({ 'stats.sellCount': -1 });
};

/**
 * Get by category with pagination and filters
 */
productSchema.statics.getByCategoryWithFilters = function (categoryId, filters = {}, page = 1, limit = 12) {
  const skip = (page - 1) * limit;
  let query = {
    category: categoryId,
    isActive: true,
    deletedAt: null,
    visibility: 'public'
  };

  // Price filter
  if (filters.minPrice || filters.maxPrice) {
    query['pricing.finalPrice'] = {};
    if (filters.minPrice) query['pricing.finalPrice'].$gte = filters.minPrice;
    if (filters.maxPrice) query['pricing.finalPrice'].$lte = filters.maxPrice;
  }

  // Ratings filter
  if (filters.minRating) {
    query['ratings.average'] = { $gte: filters.minRating };
  }

  // In stock only
  if (filters.inStockOnly) {
    query['stock.available'] = { $gt: 0 };
  }

  // Sort
  const sortOptions = {
    newest: { createdAt: -1 },
    price_asc: { 'pricing.finalPrice': 1 },
    price_desc: { 'pricing.finalPrice': -1 },
    rating: { 'ratings.average': -1 },
    popular: { 'stats.viewCount': -1 }
  };

  const sort = sortOptions[filters.sortBy] || sortOptions.newest;

  return this.find(query)
    .select('name slug images pricing ratings.average stock.available isBestSeller isNewArrival')
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
};

/**
 * Count by category
 */
productSchema.statics.countByCategory = function (categoryId) {
  return this.countDocuments({
    category: categoryId,
    isActive: true,
    deletedAt: null
  });
};

/**
 * Search products
 */
productSchema.statics.search = function (searchTerm, filters = {}, page = 1, limit = 12) {
  const skip = (page - 1) * limit;
  const query = {
    $text: { $search: searchTerm },
    isActive: true,
    deletedAt: null,
    visibility: 'public'
  };

  if (filters.categoryId) {
    query.category = filters.categoryId;
  }

  if (filters.minPrice || filters.maxPrice) {
    query['pricing.finalPrice'] = {};
    if (filters.minPrice) query['pricing.finalPrice'].$gte = filters.minPrice;
    if (filters.maxPrice) query['pricing.finalPrice'].$lte = filters.maxPrice;
  }

  return this.find(query)
    .select('name slug images pricing ratings.average stock.available -_id score: { $meta: "textScore" }')
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(limit)
    .lean();
};

// ==================== MIDDLEWARE ====================

productSchema.pre('save', function (next) {
  if (!this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  this.updatedAt = Date.now();
  next();
});

productSchema.pre(/^find/, function (next) {
  if (!this.options.includeSoftDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

// ==================== EXPORT ====================

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
