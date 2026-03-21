// backend/src/modules/product/product.routes.js
const express = require('express');
const productController = require('./product.controller');
// const { authenticate, authorize } = require('../../middlewares/auth.middleware');
const { protect } = require('../../middlewares/auth.middleware');
const { rateLimitMiddleware } = require('../../middlewares/bruteForce');

const router = express.Router();

// ==================== PUBLIC ROUTES ====================

// Search products
router.get('/search', rateLimitMiddleware('product', 20), productController.searchProducts);

// Get featured products
router.get('/featured', rateLimitMiddleware('product', 30), productController.getFeaturedProducts);

// Get best sellers
router.get('/best-sellers', rateLimitMiddleware('product', 30), productController.getBestSellers);

// Get product by slug
router.get('/slug/:slug', rateLimitMiddleware('product', 30), productController.getProductBySlug);

// Get product details
router.get('/:id', rateLimitMiddleware('product', 30), productController.getProductDetails);

// ==================== ADMIN ROUTES ====================

// Create product
router.post(
  '/',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('product-admin', 10),
  productController.createProduct
);

// Update product
router.put(
  '/:id',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('product-admin', 10),
  productController.updateProduct
);

// Upload product images
router.post(
  '/:id/images',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('product-admin', 10),
  productController.uploadImages
);

// Delete product image
router.delete(
  '/:id/images/:imageId',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('product-admin', 10),
  productController.deleteImage
);

// Set product as featured
router.patch(
  '/:id/featured',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('product-admin', 10),
  productController.toggleFeatured
);

// Set product as best seller
router.patch(
  '/:id/bestseller',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('product-admin', 10),
  productController.toggleBestSeller
);

// Update stock
router.patch(
  '/:id/stock',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('product-admin', 15),
  productController.updateStock
);

// Soft delete product
router.delete(
  '/:id',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('product-admin', 10),
  productController.deleteProduct
);

// Restore product
router.patch(
  '/:id/restore',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('product-admin', 10),
  productController.restoreProduct
);

// Bulk delete products
router.post(
  '/bulk/delete',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('product-admin', 5),
  productController.bulkDeleteProducts
);

// Bulk update products
router.post(
  '/bulk/update',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('product-admin', 5),
  productController.bulkUpdateProducts
);

module.exports = router;
