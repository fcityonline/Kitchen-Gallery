// backend/src/modules/auth/auth.service.js

const User = require('../../models/user.model');
const bcrypt = require('bcrypt');
const { generateAccessToken, generateRefreshToken } = require('../../utils/token');
const redis = require('../../config/redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../config/logger');
const AuditLogger = require('../../services/auditLogger');
const validators = require('../../utils/validators');

const SALT_ROUNDS = 12;
const MAX_ADMIN_ACCOUNTS = 2;

// ==================== ERROR CLASSES ====================

class AuthenticationError extends Error {
  constructor(message, code = 'AUTH_ERROR') {
    super(message);
    this.code = code;
    this.statusCode = 401;
  }
}

class ValidationError extends Error {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message);
    this.code = code;
    this.statusCode = 400;
  }
}

class ConflictError extends Error {
  constructor(message, code = 'CONFLICT_ERROR') {
    super(message);
    this.code = code;
    this.statusCode = 409;
  }
}

class ForbiddenError extends Error {
  constructor(message, code = 'FORBIDDEN_ERROR') {
    super(message);
    this.code = code;
    this.statusCode = 403;
  }
}

// ==================== REGISTRATION ====================

exports.registerUser = async ({ username, password, email, role, ip, userAgent }) => {
  try {
    // 1. VALIDATE INPUTS
    const validation = validators.validateRegisterRequest({
      username,
      password,
      confirmPassword: password,
      email,
      role: role || 'USER'
    });

    if (!validation.isValid) {
      throw new ValidationError(validation.errors[0]);
    }

    const validatedData = validation.data;

    // 2. CHECK IF USER ALREADY EXISTS
    const existingUser = await User.findByUsername(validatedData.username);
    if (existingUser) {
      logger.warn('Registration attempt with existing username', {
        username: validatedData.username,
        ip
      });
      throw new ConflictError('Username already taken', 'USERNAME_EXISTS');
    }

    // 3. CHECK EMAIL UNIQUENESS (if provided)
    if (validatedData.email) {
      const existingEmail = await User.findOne({ email: validatedData.email });
      if (existingEmail) {
        throw new ConflictError('Email already registered', 'EMAIL_EXISTS');
      }
    }

    // 4. ENFORCE ADMIN LIMIT
    if (validatedData.role === 'ADMIN') {
      const canCreateAdmin = await User.canCreateAdmin();
      if (!canCreateAdmin) {
        logger.warn('Admin registration rejected - limit reached', {
          username: validatedData.username,
          ip
        });
        throw new ForbiddenError('Maximum number of admin accounts reached', 'ADMIN_LIMIT_REACHED');
      }
    }

    // 5. HASH PASSWORD (with salt)
    const hashedPassword = await bcrypt.hash(validatedData.password, SALT_ROUNDS);

    // 6. CREATE USER
    const user = await User.create({
      username: validatedData.username,
      password: hashedPassword,
      email: validatedData.email || null,
      role: validatedData.role,
      status: 'ACTIVE',
      acceptedTermsAt: new Date(),
      acceptedPrivacyPolicyAt: new Date()
    });

    // 7. LOG AUDIT
    await AuditLogger.logUserRegistration(user._id, user.username, user.role, ip, userAgent);

    logger.info('User registered successfully', {
      userId: user._id,
      username: user.username,
      role: user.role,
      ip
    });

    return {
      userId: user._id,
      username: user.username,
      role: user.role,
      email: user.email,
      createdAt: user.createdAt
    };
  } catch (error) {
    logger.error('Registration error', {
      error: error.message,
      code: error.code,
      ip
    });
    throw error;
  }
};

// ==================== LOGIN ====================

exports.loginUser = async ({ username, password, ip, userAgent }) => {
  try {
    // 1. VALIDATE INPUTS
    const validation = validators.validateLoginRequest({
      username,
      password
    });

    if (!validation.isValid) {
      await AuditLogger.logLoginAttempt(username, ip, userAgent, false, validation.errors[0]);
      throw new ValidationError(validation.errors[0]);
    }

    const validatedUsername = validation.data.username;

    // 2. FIND USER
    const user = await User.findByUsername(validatedUsername).select('+password');

    if (!user) {
      logger.warn('Login attempt with non-existent username', {
        username: validatedUsername,
        ip
      });
      // Don't reveal if user exists or not (security best practice)
      throw new AuthenticationError('Invalid username or password', 'INVALID_CREDENTIALS');
    }

    // 3. CHECK ACCOUNT STATUS
    if (user.status === 'LOCKED') {
      if (user.isAccountLocked()) {
        logger.warn('Login attempt on locked account', {
          userId: user._id,
          username: user.username,
          ip
        });
        throw new ForbiddenError('Account is locked due to too many failed login attempts', 'ACCOUNT_LOCKED');
      } else {
        // Unlock if lockout period expired
        user.unlockAccount();
        await user.save();
      }
    }

    if (user.status === 'SUSPENDED') {
      logger.warn('Login attempt on suspended account', {
        userId: user._id,
        username: user.username,
        ip
      });
      throw new ForbiddenError('Account is suspended', 'ACCOUNT_SUSPENDED');
    }

    if (user.status === 'INACTIVE') {
      throw new ForbiddenError('Account is inactive', 'ACCOUNT_INACTIVE');
    }

    // 4. VERIFY PASSWORD
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      user.recordFailedLogin(ip, userAgent, 'Invalid password');
      await user.save();

      await AuditLogger.logLoginAttempt(validatedUsername, ip, userAgent, false, 'Invalid password');

      if (user.isAccountLocked()) {
        logger.error('Account locked after failed password attempt', {
          userId: user._id,
          username: user.username,
          ip,
          attempts: user.failedLoginAttempts
        });
        throw new ForbiddenError('Account is locked due to too many failed login attempts', 'ACCOUNT_LOCKED');
      }

      throw new AuthenticationError('Invalid username or password', 'INVALID_CREDENTIALS');
    }

    // 5. CHECK PASSWORD EXPIRY (if applicable)
    if (user.isPasswordExpired()) {
      logger.warn('Login blocked - password expired', {
        userId: user._id,
        username: user.username
      });
      throw new ForbiddenError('Password has expired. Please reset it.', 'PASSWORD_EXPIRED');
    }

    // 6. RECORD SUCCESSFUL LOGIN
    user.recordSuccessfulLogin(ip, userAgent);
    await user.save();

    // 7. GENERATE TOKENS
    const accessToken = generateAccessToken({
      id: user._id,
      role: user.role,
      username: user.username
    });

    const tokenId = uuidv4();
    const refreshToken = generateRefreshToken({
      id: user._id,
      role: user.role,
      tokenId
    });

    // 8. STORE REFRESH TOKEN IN REDIS
    await redis.set(
      `refresh:${tokenId}`,
      JSON.stringify({
        userId: user._id.toString(),
        username: user.username,
        role: user.role,
        issuedAt: Date.now()
      }),
      {
        ex: 7 * 24 * 60 * 60 // 7 days
      }
    );

    // 9. LOG SUCCESSFUL LOGIN
    await AuditLogger.logLoginAttempt(validatedUsername, ip, userAgent, true);

    logger.info('User logged in successfully', {
      userId: user._id,
      username: user.username,
      ip,
      lastLogin: user.lastLoginAt
    });

    return {
      userId: user._id,
      username: user.username,
      role: user.role,
      email: user.email,
      accessToken,
      refreshToken,
      lastLoginAt: user.lastLoginAt
    };
  } catch (error) {
    logger.error('Login error', {
      error: error.message,
      code: error.code,
      ip
    });
    throw error;
  }
};

// ==================== LOGOUT ====================

exports.logoutUser = async ({ tokenId, userId, ip, userAgent }) => {
  try {
    // 1. INVALIDATE REFRESH TOKEN
    if (tokenId) {
      await redis.del(`refresh:${tokenId}`);
    }

    // 2. LOG AUDIT
    await AuditLogger.logLogout(userId, ip, userAgent);

    logger.info('User logged out', {
      userId,
      ip,
      timestamp: new Date()
    });

    return {
      message: 'Logged out successfully'
    };
  } catch (error) {
    logger.error('Logout error', {
      userId,
      error: error.message
    });
    throw error;
  }
};

// ==================== TOKEN REFRESH ====================

exports.refreshAccessToken = async ({ tokenId, ip, userAgent }) => {
  try {
    if (!tokenId) {
      throw new AuthenticationError('Token ID is missing', 'MISSING_TOKEN_ID');
    }

    // 1. VERIFY REFRESH TOKEN IN REDIS
    const storedToken = await redis.get(`refresh:${tokenId}`);

    if (!storedToken) {
      logger.warn('Refresh token not found or expired', { tokenId, ip });
      throw new AuthenticationError('Refresh token invalid or expired', 'INVALID_REFRESH_TOKEN');
    }

    const tokenData = JSON.parse(storedToken);

    // 2. VERIFY USER STILL EXISTS AND IS ACTIVE
    const user = await User.findById(tokenData.userId);

    if (!user || user.status !== 'ACTIVE') {
      logger.warn('User not found or inactive during token refresh', {
        userId: tokenData.userId,
        ip
      });
      await redis.del(`refresh:${tokenId}`);
      throw new AuthenticationError('User account is no longer valid', 'USER_NOT_VALID');
    }

    // 3. ROTATE TOKENS (invalidate old, issue new)
    await redis.del(`refresh:${tokenId}`);

    const newTokenId = uuidv4();
    const newAccessToken = generateAccessToken({
      id: user._id,
      role: user.role,
      username: user.username
    });

    const newRefreshToken = generateRefreshToken({
      id: user._id,
      role: user.role,
      tokenId: newTokenId
    });

    // 4. STORE NEW REFRESH TOKEN
    await redis.set(
      `refresh:${newTokenId}`,
      JSON.stringify({
        userId: user._id.toString(),
        username: user.username,
        role: user.role,
        issuedAt: Date.now()
      }),
      {
        ex: 7 * 24 * 60 * 60
      }
    );

    logger.info('Token refreshed successfully', {
      userId: user._id,
      ip
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenId: newTokenId
    };
  } catch (error) {
    logger.error('Token refresh error', {
      error: error.message,
      ip
    });
    throw error;
  }
};

// ==================== EXPORTS ====================

module.exports = exports;
module.exports.AuthenticationError = AuthenticationError;
module.exports.ValidationError = ValidationError;
module.exports.ConflictError = ConflictError;
module.exports.ForbiddenError = ForbiddenError;
