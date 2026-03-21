const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters'],
      maxlength: [100, 'Category name cannot exceed 100 characters'],
      unique: true,
      lowercase: true,
      index: true
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
      // Auto-generated from name
      set(value) {
        return value || this.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
    },

    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },

    // Visual
    icon: {
      type: String, // Icon class (e.g., "fas fa-chair") or emoji
      trim: true
    },

    image: {
      url: {
        type: String,
        trim: true
      },
      publicId: String // For Cloudinary deletion
    },

    // Hierarchy
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true
    },

    subcategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
      }
    ],

    // Status & Display
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    displayOrder: {
      type: Number,
      default: 0,
      index: true
    },

    // Metadata
    seoTitle: {
      type: String,
      maxlength: [60, 'SEO title cannot exceed 60 characters']
    },

    seoMetaDescription: {
      type: String,
      maxlength: [160, 'SEO meta description cannot exceed 160 characters']
    },

    seoKeywords: [String],

    // Statistics (Denormalized for performance)
    productCount: {
      type: Number,
      default: 0,
      min: 0
    },

    // Audit
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ==================== INDEXES ====================

categorySchema.index({ name: 1, isActive: 1 });
categorySchema.index({ slug: 1, isActive: 1 });
categorySchema.index({ parentCategory: 1, isActive: 1 });
categorySchema.index({ displayOrder: 1, isActive: 1 });
categorySchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================

categorySchema.virtual('breadcrumb').get(async function () {
  if (!this.parentCategory) return [this.name];
  const parent = await this.constructor.findById(this.parentCategory);
  return [...(parent?.breadcrumb || []), this.name];
});

// ==================== INSTANCE METHODS ====================

/**
 * Get parent category chain
 */
categorySchema.methods.getParentChain = async function () {
  const chain = [this];
  let current = this;

  while (current.parentCategory) {
    current = await this.constructor.findById(current.parentCategory);
    if (!current) break;
    chain.unshift(current);
  }

  return chain;
};

/**
 * Get all subcategories recursively
 */
categorySchema.methods.getSubcategoriesRecursive = async function () {
  const all = [...this.subcategories];
  const subs = await this.constructor.find({ parentCategory: this._id });

  for (const sub of subs) {
    const nestedSubs = await sub.getSubcategoriesRecursive();
    all.push(...nestedSubs);
  }

  return all;
};

/**
 * Check if category can be deleted (no products or subcategories)
 */
categorySchema.methods.canBeDeleted = async function () {
  const hasProducts = await mongoose.model('Product').countDocuments({
    category: this._id,
    deletedAt: null
  });

  const hasSubcategories = await this.constructor.countDocuments({
    parentCategory: this._id,
    deletedAt: null
  });

  return hasProducts === 0 && hasSubcategories === 0;
};

// ==================== STATIC METHODS ====================

/**
 * Get all active root categories with subcategories
 */
categorySchema.statics.getActiveWithSubcategories = function () {
  return this.find({
    isActive: true,
    deletedAt: null,
    parentCategory: null
  })
    .populate({
      path: 'subcategories',
      match: { isActive: true, deletedAt: null },
      select: 'name slug icon image'
    })
    .sort({ displayOrder: 1 })
    .select('name slug icon image subcategories displayOrder');
};

/**
 * Get category by slug with full path
 */
categorySchema.statics.findBySlugWithPath = async function (slug) {
  const category = await this.findOne({
    slug,
    isActive: true,
    deletedAt: null
  });

  if (!category) return null;

  category.parentChain = await category.getParentChain();
  return category;
};

/**
 * Bulk update product count
 */
categorySchema.statics.updateProductCounts = async function (categoryIds) {
  const Product = mongoose.model('Product');

  for (const catId of categoryIds) {
    const count = await Product.countDocuments({
      category: catId,
      isActive: true,
      deletedAt: null
    });

    await this.findByIdAndUpdate(
      catId,
      { productCount: count },
      { new: true, runValidators: false }
    );
  }
};

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Generate slug if not provided
 */
categorySchema.pre('save', function (next) {
  if (!this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

/**
 * Pre-save: Auto-update timestamp
 */
categorySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

/**
 * Pre-find: Exclude soft-deleted categories
 */
categorySchema.pre(/^find/, function (next) {
  if (!this.options.includeSoftDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

// ==================== EXPORT ====================

const Category = mongoose.model('Category', categorySchema);
module.exports = Category;
