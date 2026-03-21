// // backend/src/modules/cart/cart.routes.js
// const express = require('express');
// const cartController = require('./cart.controller');
// const { authenticate } = require('../../middlewares/auth.middleware');
// const { rateLimitMiddleware } = require('../../middlewares/bruteForce');

// const router = express.Router();

// // ==================== CART ROUTES ====================

// // Get user's cart
// router.get('/', authenticate, rateLimitMiddleware('cart', 30), cartController.getCart);

// // Add item to cart
// router.post(
//   '/items',
//   authenticate,
//   rateLimitMiddleware('cart', 20),
//   cartController.addItemToCart
// );

// // Update item quantity
// router.put(
//   '/items/:productId',
//   authenticate,
//   rateLimitMiddleware('cart', 20),
//   cartController.updateItemQuantity
// );

// // Remove item from cart
// router.delete(
//   '/items/:productId',
//   authenticate,
//   rateLimitMiddleware('cart', 20),
//   cartController.removeItemFromCart
// );

// // Clear entire cart
// router.delete('/', authenticate, rateLimitMiddleware('cart', 10), cartController.clearCart);

// // Apply shipping
// router.post(
//   '/shipping',
//   authenticate,
//   rateLimitMiddleware('cart', 20),
//   cartController.applyShipping
// );

// module.exports = router;

const express = require('express');
const cartController = require('./cart.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { rateLimitMiddleware } = require('../../middlewares/bruteForce');

const router = express.Router();

// Get user's cart
router.get('/', protect(), rateLimitMiddleware('cart', 30), cartController.getCart);

// Add item to cart
router.post(
  '/items',
  protect(),
  rateLimitMiddleware('cart', 20),
  cartController.addItemToCart
);

// Update item quantity
router.put(
  '/items/:productId',
  protect(),
  rateLimitMiddleware('cart', 20),
  cartController.updateItemQuantity
);

// Remove item from cart
router.delete(
  '/items/:productId',
  protect(),
  rateLimitMiddleware('cart', 20),
  cartController.removeItemFromCart
);

// Clear entire cart
router.delete('/', protect(), rateLimitMiddleware('cart', 10), cartController.clearCart);

// Apply shipping
router.post(
  '/shipping',
  protect(),
  rateLimitMiddleware('cart', 20),
  cartController.applyShipping
);

module.exports = router;