// backend/src/models/user.model.js

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // ==================== IDENTITY ====================
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [50, 'Username must not exceed 50 characters'],
      match: [/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscore, and hyphen'],
      index: true,
      collation: { locale: 'en', strength: 2 } // case-insensitive unique index
    },

    email: {
      type: String,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format'],
      index: true
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false // Don't return password by default
    },

    // ==================== ROLE & PERMISSIONS ====================
    role: {
      type: String,
      enum: {
        values: ['USER', 'ADMIN'],
        message: 'Role must be either USER or ADMIN'
      },
      default: 'USER',
      index: true
    },

    // ==================== ACCOUNT STATUS ====================
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED'],
        message: 'Invalid account status'
      },
      default: 'ACTIVE',
      index: true
    },

    isEmailVerified: {
      type: Boolean,
      default: false
    },

    emailVerificationToken: {
      type: String,
      select: false
    },

    emailVerificationExpiresAt: {
      type: Date,
      select: false
    },

    // ==================== SECURITY ====================
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0
    },

    lockoutUntil: {
      type: Date,
      index: true // Speed up queries for unlocking
    },

    lastLoginAt: {
      type: Date,
      default: null,
      index: true
    },

    lastLoginIp: {
      type: String,
      default: null
    },

    passwordChangedAt: {
      type: Date,
      default: null
    },

    passwordExpiresAt: {
      type: Date,
      default: null // For future password expiry policies
    },

    twoFactorSecret: {
      type: String,
      select: false
    },

    isTwoFactorEnabled: {
      type: Boolean,
      default: false
    },

    // ==================== METADATA ====================
    firstName: {
      type: String,
      trim: true,
      default: null
    },

    lastName: {
      type: String,
      trim: true,
      default: null
    },

    phone: {
      type: String,
      sparse: true,
      default: null
    },

    avatar: {
      type: String,
      default: null
    },

    // ==================== PREFERENCES ====================
    preferences: {
      emailNotifications: { type: Boolean, default: true },
      marketingEmails: { type: Boolean, default: false },
      language: { type: String, default: 'en' },
      timezone: { type: String, default: 'UTC' }
    },

    // ==================== AUDIT TRACKING ====================
    loginAttempts: [
      {
        timestamp: { type: Date, default: Date.now, index: true },
        ip: String,
        userAgent: String,
        status: { type: String, enum: ['SUCCESS', 'FAILED'], default: 'FAILED' },
        reason: String
      }
    ],

    activityLog: [
      {
        timestamp: { type: Date, default: Date.now, index: true },
        action: { type: String, index: true }, // login, logout, password_change, settings_update
        ipAddress: String,
        userAgent: String,
        details: mongoose.Schema.Types.Mixed
      }
    ],

    // ==================== COMPLIANCE ====================
    acceptedTermsAt: {
      type: Date,
      default: null
    },

    acceptedPrivacyPolicyAt: {
      type: Date,
      default: null
    },

    gdprConsentGiven: {
      type: Boolean,
      default: false
    },

    lastDataRequest: {
      type: Date,
      default: null
    },

    markedForDeletion: {
      type: Boolean,
      default: false
    },

    deletionRequestedAt: {
      type: Date,
      default: null
    },

    // ==================== WHATSAPP NOTIFICATIONS ====================
    whatsappPhone: {
      type: String,
      sparse: true,
      default: null,
      // Format: +country_codenumber (e.g., +917654321098)
      trim: true
    },

    whatsappVerifiedAt: {
      type: Date,
      default: null
    },

    whatsappNotifications: {
      orderConfirmation: { type: Boolean, default: true },
      paymentConfirmation: { type: Boolean, default: true },
      orderProcessing: { type: Boolean, default: true },
      shipmentTracking: { type: Boolean, default: true },
      deliveryConfirmation: { type: Boolean, default: true },
      promotions: { type: Boolean, default: false }
    }
  },
  {
    timestamps: true, // Adds createdAt & updatedAt
    collection: 'users'
  }
);

// ==================== INDEXES ====================
// Compound indexes for common queries
userSchema.index({ username: 1, status: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'loginAttempts.timestamp': -1 });

// ==================== VIRTUALS ====================
userSchema.virtual('fullName').get(function () {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.firstName || this.lastName || this.username;
});

// ==================== INSTANCE METHODS ====================

/**
 * Check if account is currently locked
 */
userSchema.methods.isAccountLocked = function () {
  return this.lockoutUntil && this.lockoutUntil > new Date();
};

/**
 * Lock account for security reasons
 */
userSchema.methods.lockAccount = function (durationMinutes = 30) {
  this.status = 'LOCKED';
  this.lockoutUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
};

/**
 * Unlock account
 */
userSchema.methods.unlockAccount = function () {
  this.status = 'ACTIVE';
  this.lockoutUntil = null;
  this.failedLoginAttempts = 0;
};

/**
 * Record failed login attempt
 */
userSchema.methods.recordFailedLogin = function (ip, userAgent, reason = 'Invalid password') {
  this.failedLoginAttempts += 1;

  // Add to login attempts audit log
  this.loginAttempts.unshift({
    timestamp: new Date(),
    ip,
    userAgent,
    status: 'FAILED',
    reason
  });

  // Keep only last 100 login attempts
  if (this.loginAttempts.length > 100) {
    this.loginAttempts = this.loginAttempts.slice(0, 100);
  }

  // Lock account after 5 failed attempts
  if (this.failedLoginAttempts >= 5) {
    this.lockAccount(30); // Lock for 30 minutes
  }
};

/**
 * Record successful login
 */
userSchema.methods.recordSuccessfulLogin = function (ip, userAgent) {
  this.failedLoginAttempts = 0;
  this.lockoutUntil = null;
  this.lastLoginAt = new Date();
  this.lastLoginIp = ip;

  // Add to login attempts audit log
  this.loginAttempts.unshift({
    timestamp: new Date(),
    ip,
    userAgent,
    status: 'SUCCESS'
  });

  // Keep only last 100 login attempts
  if (this.loginAttempts.length > 100) {
    this.loginAttempts = this.loginAttempts.slice(0, 100);
  }
};

/**
 * Add activity log entry
 */
userSchema.methods.addActivityLog = function (action, ip, userAgent, details = {}) {
  this.activityLog.unshift({
    timestamp: new Date(),
    action,
    ipAddress: ip,
    userAgent,
    details
  });

  // Keep only last 500 activity logs
  if (this.activityLog.length > 500) {
    this.activityLog = this.activityLog.slice(0, 500);
  }
};

/**
 * Check if password needs to be changed
 */
userSchema.methods.isPasswordExpired = function () {
  if (!this.passwordExpiresAt) return false;
  return new Date() > this.passwordExpiresAt;
};

/**
 * Get sanitized user object (remove sensitive fields)
 */
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.twoFactorSecret;
  delete user.emailVerificationToken;
  delete user.loginAttempts;
  delete user.activityLog;
  return user;
};

// ==================== QUERY HELPERS ====================

userSchema.statics.findByUsername = function (username) {
  return this.findOne({
    username: username.toLowerCase().trim()
  });
};

userSchema.statics.findActiveByUsername = function (username) {
  return this.findOne({
    username: username.toLowerCase().trim(),
    status: 'ACTIVE'
  });
};

/**
 * Count total admins
 */
userSchema.statics.getAdminCount = function () {
  return this.countDocuments({ role: 'ADMIN', status: { $ne: 'DELETED' } });
};

/**
 * Get admin limit status
 */
userSchema.statics.canCreateAdmin = async function () {
  const adminCount = await this.getAdminCount();
  return adminCount < 2; // Max 2 admins
};

module.exports = mongoose.model('User', userSchema);