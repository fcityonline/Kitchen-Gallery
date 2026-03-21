const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    label: {
      type: String,
      enum: ['home', 'work', 'other'],
      default: 'home'
    },

    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters']
    },

    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^[0-9]{10}$/, 'Phone number must be 10 digits']
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },

    addressLine1: {
      type: String,
      required: [true, 'Street address is required'],
      trim: true,
      maxlength: [100, 'Address cannot exceed 100 characters']
    },

    addressLine2: {
      type: String,
      trim: true,
      maxlength: [100, 'Address cannot exceed 100 characters']
    },

    landmark: {
      type: String,
      trim: true,
      maxlength: [100, 'Landmark cannot exceed 100 characters']
    },

    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      minlength: [2, 'City must be at least 2 characters'],
      maxlength: [50, 'City cannot exceed 50 characters']
    },

    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
      minlength: [2, 'State must be at least 2 characters'],
      maxlength: [50, 'State cannot exceed 50 characters']
    },

    postalCode: {
      type: String,
      required: [true, 'Postal code is required'],
      trim: true,
      match: [/^[0-9]{6}$/, 'Postal code must be 6 digits']
    },

    country: {
      type: String,
      default: 'India',
      maxlength: [50, 'Country cannot exceed 50 characters']
    },

    isDefault: {
      type: Boolean,
      default: false,
      index: true
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ==================== VIRTUAL FIELDS ====================

// Full address as single string
addressSchema.virtual('fullAddress').get(function () {
  const parts = [
    this.addressLine1,
    this.addressLine2,
    this.landmark,
    this.city,
    this.state,
    this.postalCode,
    this.country
  ];
  return parts.filter(Boolean).join(', ');
});

// ==================== INDEXES ====================

addressSchema.index({ userId: 1, isActive: 1 });
addressSchema.index({ userId: 1, isDefault: 1 });
addressSchema.index({ createdAt: -1 });

// ==================== INSTANCE METHODS ====================

addressSchema.methods.isComplete = function () {
  return !!(
    this.fullName &&
    this.phoneNumber &&
    this.email &&
    this.addressLine1 &&
    this.city &&
    this.state &&
    this.postalCode
  );
};

// ==================== STATIC METHODS ====================

addressSchema.statics.getActiveAddressesForUser = function (userId) {
  return this.find({
    userId,
    isActive: true
  }).sort({ isDefault: -1, createdAt: -1 });
};

addressSchema.statics.getDefaultAddressForUser = function (userId) {
  return this.findOne({
    userId,
    isDefault: true,
    isActive: true
  });
};

// ==================== MIDDLEWARE ====================

// Set as default if it's first address
addressSchema.pre('save', async function (next) {
  if (!this.isNew) {
    this.updatedAt = Date.now();
    return next();
  }

  try {
    const existingAddresses = await this.constructor.countDocuments({
      userId: this.userId,
      isActive: true
    });

    if (existingAddresses === 0) {
      this.isDefault = true;
    }
    next();
  } catch (error) {
    next(error);
  }
});

// ==================== EXPORT ====================

const Address = mongoose.model('Address', addressSchema);
module.exports = Address;
