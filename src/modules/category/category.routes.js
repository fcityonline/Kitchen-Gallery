// backend/src/modules/category/category.routes.js

const express = require('express');
const categoryController = require('./category.controller');
// const { authenticate, authorize } = require('../../middlewares/auth.middleware');
const { protect } = require('../../middlewares/auth.middleware');
const { rateLimitMiddleware } = require('../../middlewares/bruteForce');

const router = express.Router();

// ==================== PUBLIC ROUTES ====================

// Get all active categories with subcategories
router.get('/', rateLimitMiddleware('category', 30), categoryController.getCategories);

// Get category by slug with breadcrumb
router.get('/slug/:slug', rateLimitMiddleware('category', 30), categoryController.getCategoryBySlug);

// Get category details with products
router.get('/:id', rateLimitMiddleware('category', 30), categoryController.getCategoryDetails);

// Get products in category
router.get('/:id/products', rateLimitMiddleware('category', 30), categoryController.getCategoryProducts);

// ==================== ADMIN ROUTES ====================

// Create new category
router.post(
  '/',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('category-admin', 10),
  categoryController.createCategory
);

// Update category
router.put(
  '/:id',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('category-admin', 10),
  categoryController.updateCategory
);

// Soft delete category
router.delete(
  '/:id',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('category-admin', 10),
  categoryController.deleteCategory
);

// Restore soft-deleted category
router.patch(
  '/:id/restore',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('category-admin', 10),
  categoryController.restoreCategory
);

// Bulk delete categories
router.post(
  '/bulk/delete',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('category-admin', 5),
  categoryController.bulkDeleteCategories
);

// Update product counts
router.post(
  '/bulk/update-counts',
  // authenticate,
  // authorize('admin'),
  protect(['ADMIN']),
  rateLimitMiddleware('category-admin', 3),
  categoryController.updateProductCounts
);

module.exports = router;
