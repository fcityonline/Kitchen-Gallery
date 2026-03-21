// backend/src/utils/validators.js

const validator = require('validator');

/**
 * Enterprise-grade input validation utilities
 * Used across all endpoints for consistency
 */

// ==================== PASSWORD VALIDATION ====================

exports.validatePassword = (password) => {
  const errors = [];

  if (!password) {
    errors.push('Password is required');
    return { isValid: false, errors };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (password.length > 128) {
    errors.push('Password must not exceed 128 characters');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
    strength: calculatePasswordStrength(password)
  };
};

/**
 * Calculate password strength (1-5)
 */
function calculatePasswordStrength(password) {
  let strength = 0;

  if (password.length >= 12) strength++;
  if (password.length >= 16) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength++;

  return strength;
}

// ==================== USERNAME VALIDATION ====================

exports.validateUsername = (username) => {
  const errors = [];

  if (!username) {
    errors.push('Username is required');
    return { isValid: false, errors };
  }

  username = username.trim();

  if (username.length < 3) {
    errors.push('Username must be at least 3 characters');
  }

  if (username.length > 50) {
    errors.push('Username must not exceed 50 characters');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.push(
      'Username can only contain letters, numbers, underscore, and hyphen'
    );
  }

  if (/^[-_]/.test(username)) {
    errors.push('Username cannot start with hyphen or underscore');
  }

  if (/[-_]$/.test(username)) {
    errors.push('Username cannot end with hyphen or underscore');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: username.toLowerCase()
  };
};

// ==================== EMAIL VALIDATION ====================

exports.validateEmail = (email) => {
  const errors = [];

  if (!email) {
    return { isValid: true, errors }; // Email is optional for now
  }

  email = email.trim().toLowerCase();

  if (!validator.isEmail(email)) {
    errors.push('Invalid email format');
  }

  if (email.length > 254) {
    errors.push('Email must not exceed 254 characters');
  }

  // Check for disposable email domains (basic check)
  const disposableDomains = ['tempmail.com', '10minutemail.com', 'guerrillamail.com'];
  const domain = email.split('@')[1];
  if (disposableDomains.includes(domain)) {
    errors.push('Disposable email addresses are not allowed');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: email
  };
};

// ==================== ROLE VALIDATION ====================

exports.validateRole = (role) => {
  const validRoles = ['USER', 'ADMIN'];
  const errors = [];

  if (!role) {
    errors.push('Role is required');
  } else if (!validRoles.includes(role)) {
    errors.push(`Role must be one of: ${validRoles.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: role ? role.toUpperCase() : null
  };
};

// ==================== GENERAL INPUT SANITIZATION ====================

exports.sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .substring(0, 1000); // Limit length
};

exports.validateLoginRequest = (body) => {
  const errors = [];

  // Validate username
  const usernameValidation = exports.validateUsername(body.username);
  if (!usernameValidation.isValid) {
    errors.push(...usernameValidation.errors);
  }

  // Validate password
  if (!body.password) {
    errors.push('Password is required');
  } else if (typeof body.password !== 'string' || body.password.length === 0) {
    errors.push('Invalid password format');
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: errors.length === 0
      ? {
          username: usernameValidation.sanitized,
          password: body.password
        }
      : null
  };
};

exports.validateRegisterRequest = (body) => {
  const errors = [];

  // Validate username
  const usernameValidation = exports.validateUsername(body.username);
  if (!usernameValidation.isValid) {
    errors.push(...usernameValidation.errors);
  }

  // Validate password
  const passwordValidation = exports.validatePassword(body.password);
  if (!passwordValidation.isValid) {
    errors.push(...passwordValidation.errors);
  }

  // Validate password confirmation
  if (body.password !== body.confirmPassword) {
    errors.push('Passwords do not match');
  }

  // Validate email if provided
  let emailValidation = { isValid: true };
  if (body.email) {
    emailValidation = exports.validateEmail(body.email);
    if (!emailValidation.isValid) {
      errors.push(...emailValidation.errors);
    }
  }

  // Validate role
  const roleValidation = exports.validateRole(body.role || 'USER');
  if (!roleValidation.isValid) {
    errors.push(...roleValidation.errors);
  }

  return {
    isValid: errors.length === 0,
    errors,
    data:
      errors.length === 0
        ? {
            username: usernameValidation.sanitized,
            password: body.password,
            email: body.email ? emailValidation.sanitized : null,
            role: roleValidation.sanitized,
            passwordStrength: passwordValidation.strength
          }
        : null
  };
};

module.exports = exports;
