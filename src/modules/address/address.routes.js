const express = require('express');
const addressController = require('./address.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { rateLimitMiddleware } = require('../../middlewares/bruteForce');

const router = express.Router();

// ==================== ADDRESS ROUTES ====================

// Get all addresses for user
router.get('/', protect, rateLimitMiddleware('address', 30), addressController.getAddresses);

// Get specific address
router.get('/:id', protect, rateLimitMiddleware('address', 30), addressController.getAddressById);

// Get default address
router.get(
  '/default/address',
  protect,
  rateLimitMiddleware('address', 30),
  addressController.getDefaultAddress
);

// Create new address
router.post('/', protect, rateLimitMiddleware('address', 20), addressController.createAddress);

// Update address
router.put(
  '/:id',
  protect,
  rateLimitMiddleware('address', 20),
  addressController.updateAddress
);

// Set as default
router.patch(
  '/:id/default',
  protect,
  rateLimitMiddleware('address', 20),
  addressController.setAsDefault
);

// Delete address (soft)
router.delete('/:id', protect, rateLimitMiddleware('address', 20), addressController.deleteAddress);

module.exports = router;
