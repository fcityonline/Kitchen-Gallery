const Address = require('../../models/address.model');
const logger = require('../../config/logger');
const { AppError, ValidationError } = require('../../utils/errors');

// ==================== GET ADDRESSES ====================

exports.getAddresses = async (req, res, next) => {
  try {
    const addresses = await Address.getActiveAddressesForUser(req.user._id);

    return res.status(200).json({
      success: true,
      data: addresses,
      message: 'Addresses retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching addresses:', error);
    next(error);
  }
};

// ==================== GET ADDRESS BY ID ====================

exports.getAddressById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const address = await Address.findOne({
      _id: id,
      userId: req.user._id,
      isActive: true
    });

    if (!address) {
      throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
    }

    return res.status(200).json({
      success: true,
      data: address,
      message: 'Address retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching address:', error);
    next(error);
  }
};

// ==================== GET DEFAULT ADDRESS ====================

exports.getDefaultAddress = async (req, res, next) => {
  try {
    const address = await Address.getDefaultAddressForUser(req.user._id);

    if (!address) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No default address set'
      });
    }

    return res.status(200).json({
      success: true,
      data: address,
      message: 'Default address retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching default address:', error);
    next(error);
  }
};

// ==================== CREATE ADDRESS ====================

exports.createAddress = async (req, res, next) => {
  try {
    const {
      label,
      fullName,
      phoneNumber,
      email,
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      postalCode,
      country
    } = req.body;

    // Validation
    if (!fullName?.trim()) {
      throw new ValidationError('Full name is required', 'NAME_REQUIRED');
    }

    if (!phoneNumber?.trim() || !/^[0-9]{10}$/.test(phoneNumber)) {
      throw new ValidationError('Phone number must be 10 digits', 'INVALID_PHONE');
    }

    if (!email?.trim()) {
      throw new ValidationError('Email is required', 'EMAIL_REQUIRED');
    }

    if (!addressLine1?.trim()) {
      throw new ValidationError('Address line 1 is required', 'ADDRESS_REQUIRED');
    }

    if (!city?.trim()) {
      throw new ValidationError('City is required', 'CITY_REQUIRED');
    }

    if (!state?.trim()) {
      throw new ValidationError('State is required', 'STATE_REQUIRED');
    }

    if (!postalCode?.trim() || !/^[0-9]{6}$/.test(postalCode)) {
      throw new ValidationError('Postal code must be 6 digits', 'INVALID_POSTAL');
    }

    // Create address
    const address = new Address({
      userId: req.user._id,
      label: label || 'home',
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.trim(),
      email: email.toLowerCase().trim(),
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2?.trim() || '',
      landmark: landmark?.trim() || '',
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.trim(),
      country: country?.trim() || 'India'
    });

    await address.save();

    logger.info(`Address created for user ${req.user._id}: ${address._id}`);

    return res.status(201).json({
      success: true,
      data: address,
      message: 'Address created successfully'
    });
  } catch (error) {
    logger.error('Error creating address:', error);
    next(error);
  }
};

// ==================== UPDATE ADDRESS ====================

exports.updateAddress = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      label,
      fullName,
      phoneNumber,
      email,
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      postalCode,
      country
    } = req.body;

    // Find address
    const address = await Address.findOne({
      _id: id,
      userId: req.user._id,
      isActive: true
    });

    if (!address) {
      throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
    }

    // Validate required fields if provided
    if (fullName !== undefined) {
      if (!fullName.trim()) {
        throw new ValidationError('Full name cannot be empty', 'INVALID_NAME');
      }
      address.fullName = fullName.trim();
    }

    if (phoneNumber !== undefined) {
      if (!/^[0-9]{10}$/.test(phoneNumber)) {
        throw new ValidationError('Phone number must be 10 digits', 'INVALID_PHONE');
      }
      address.phoneNumber = phoneNumber.trim();
    }

    if (email !== undefined) {
      if (!email.trim()) {
        throw new ValidationError('Email cannot be empty', 'INVALID_EMAIL');
      }
      address.email = email.toLowerCase().trim();
    }

    if (addressLine1 !== undefined && addressLine1.trim()) {
      address.addressLine1 = addressLine1.trim();
    }

    if (addressLine2 !== undefined) {
      address.addressLine2 = addressLine2.trim() || '';
    }

    if (landmark !== undefined) {
      address.landmark = landmark.trim() || '';
    }

    if (city !== undefined) {
      if (!city.trim()) {
        throw new ValidationError('City cannot be empty', 'INVALID_CITY');
      }
      address.city = city.trim();
    }

    if (state !== undefined) {
      if (!state.trim()) {
        throw new ValidationError('State cannot be empty', 'INVALID_STATE');
      }
      address.state = state.trim();
    }

    if (postalCode !== undefined) {
      if (!/^[0-9]{6}$/.test(postalCode)) {
        throw new ValidationError('Postal code must be 6 digits', 'INVALID_POSTAL');
      }
      address.postalCode = postalCode.trim();
    }

    if (country !== undefined) {
      address.country = country.trim() || 'India';
    }

    if (label !== undefined) {
      address.label = label;
    }

    await address.save();

    logger.info(`Address updated for user ${req.user._id}: ${id}`);

    return res.status(200).json({
      success: true,
      data: address,
      message: 'Address updated successfully'
    });
  } catch (error) {
    logger.error('Error updating address:', error);
    next(error);
  }
};

// ==================== SET AS DEFAULT ====================

exports.setAsDefault = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find address
    const address = await Address.findOne({
      _id: id,
      userId: req.user._id,
      isActive: true
    });

    if (!address) {
      throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
    }

    // Remove default from other addresses
    await Address.updateMany(
      { userId: req.user._id, _id: { $ne: id } },
      { isDefault: false }
    );

    // Set this as default
    address.isDefault = true;
    await address.save();

    logger.info(`Default address set for user ${req.user._id}: ${id}`);

    return res.status(200).json({
      success: true,
      data: address,
      message: 'Address set as default successfully'
    });
  } catch (error) {
    logger.error('Error setting default address:', error);
    next(error);
  }
};

// ==================== DELETE ADDRESS ====================

exports.deleteAddress = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find address
    const address = await Address.findOne({
      _id: id,
      userId: req.user._id,
      isActive: true
    });

    if (!address) {
      throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
    }

    // Deactivate instead of deleting
    address.isActive = false;
    await address.save();

    logger.info(`Address deleted for user ${req.user._id}: ${id}`);

    return res.status(200).json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting address:', error);
    next(error);
  }
};

module.exports = exports;
