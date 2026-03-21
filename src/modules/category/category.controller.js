const Category = require('../../models/category.model');
const Product = require('../../models/product.model');
const logger = require('../../config/logger');
const { AppError, ValidationError } = require('../../utils/errors');

// ==================== PUBLIC CONTROLLERS ====================

/**
 * Get all active categories with subcategories
 * GET /api/categories
 */
exports.getCategories = async (req, res, next) => {
  try {
    const categories = await Category.getActiveWithSubcategories();

    return res.status(200).json({
      success: true,
      data: categories,
      message: 'Categories retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    next(error);
  }
};

/**
 * Get category by slug with breadcrumb
 * GET /api/categories/slug/:slug
 */
exports.getCategoryBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    if (!slug || slug.trim() === '') {
      throw new ValidationError('Category slug is required', 'INVALID_SLUG');
    }

    const category = await Category.findBySlugWithPath(slug);

    if (!category) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    return res.status(200).json({
      success: true,
      data: category,
      message: 'Category retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching category by slug:', error);
    next(error);
  }
};

/**
 * Get category details with statistics
 * GET /api/categories/:id
 */
exports.getCategoryDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id)
      .populate('parentCategory', 'name slug')
      .lean();

    if (!category || category.deletedAt) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    // Get breadcrumb
    const breadcrumb = await category.getParentChain();

    // Get child categories
    const childCategories = await Category.find({
      parentCategory: id,
      isActive: true,
      deletedAt: null
    })
      .select('name slug icon image displayOrder productCount')
      .sort({ displayOrder: 1 });

    return res.status(200).json({
      success: true,
      data: {
        ...category,
        breadcrumb,
        childCategories
      },
      message: 'Category details retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching category details:', error);
    next(error);
  }
};

/**
 * Get products in category with filters
 * GET /api/categories/:id/products?page=1&limit=12&sortBy=newest&minPrice=0&maxPrice=10000
 */
exports.getCategoryProducts = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 12, sortBy = 'newest', minPrice, maxPrice, inStockOnly } = req.query;

    // Validate category exists
    const category = await Category.findById(id);
    if (!category || category.deletedAt) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    // Build filters
    const filters = {
      sortBy: ['newest', 'price_asc', 'price_desc', 'rating', 'popular'].includes(sortBy)
        ? sortBy
        : 'newest',
      minPrice: minPrice ? Math.max(0, parseFloat(minPrice)) : undefined,
      maxPrice: maxPrice ? Math.max(0, parseFloat(maxPrice)) : undefined,
      inStockOnly: inStockOnly === 'true'
    };

    // Validate price range
    if (filters.minPrice && filters.maxPrice && filters.minPrice > filters.maxPrice) {
      throw new ValidationError('Min price cannot be greater than max price', 'INVALID_PRICE_RANGE');
    }

    const products = await Product.getByCategoryWithFilters(id, filters, pageNum, limitNum);

    const totalCount = await Product.countDocuments({
      category: id,
      isActive: true,
      deletedAt: null,
      visibility: 'public',
      ...(filters.minPrice && { 'pricing.finalPrice': { $gte: filters.minPrice } }),
      ...(filters.maxPrice && { 'pricing.finalPrice': { $lte: filters.maxPrice } }),
      ...(filters.inStockOnly && { 'stock.available': { $gt: 0 } })
    });

    return res.status(200).json({
      success: true,
      data: {
        products,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          pages: Math.ceil(totalCount / limitNum)
        }
      },
      message: 'Products retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching category products:', error);
    next(error);
  }
};

// ==================== ADMIN CONTROLLERS ====================

/**
 * Create new category
 * POST /api/categories
 */
exports.createCategory = async (req, res, next) => {
  try {
    const { name, description, icon, image, parentCategory, displayOrder, seoTitle, seoMetaDescription, seoKeywords } = req.body;

    // Validation
    if (!name || name.trim().length < 2 || name.length > 100) {
      throw new ValidationError('Category name must be between 2-100 characters', 'INVALID_NAME');
    }

    // Check if category already exists
    const existingCategory = await Category.findOne({ name: name.trim(), deletedAt: null });
    if (existingCategory) {
      throw new AppError('Category with this name already exists', 409, 'CATEGORY_EXISTS');
    }

    // Validate parent category if provided
    if (parentCategory) {
      const parentCat = await Category.findById(parentCategory);
      if (!parentCat || parentCat.deletedAt) {
        throw new AppError('Parent category not found', 404, 'PARENT_CATEGORY_NOT_FOUND');
      }
    }

    // Create category
    const category = new Category({
      name: name.trim(),
      description: description?.trim() || '',
      icon: icon || '📦',
      image: image || { url: '', publicId: '' },
      parentCategory: parentCategory || null,
      displayOrder: displayOrder || 0,
      seoTitle: seoTitle?.trim() || '',
      seoMetaDescription: seoMetaDescription?.trim() || '',
      seoKeywords: seoKeywords || [],
      createdBy: req.user._id
    });

    await category.save();

    // Update parent category's subcategories count if it's a subcategory
    if (parentCategory) {
      const parentCat = await Category.findByIdAndUpdate(
        parentCategory,
        { $push: { subcategories: category._id } },
        { new: true }
      );
    }

    logger.info(`Category created: ${category._id} by user ${req.user._id}`);

    return res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully'
    });
  } catch (error) {
    logger.error('Error creating category:', error);
    next(error);
  }
};

/**
 * Update category
 * PUT /api/categories/:id
 */
exports.updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, icon, image, parentCategory, displayOrder, isActive, seoTitle, seoMetaDescription, seoKeywords } = req.body;

    // Find category
    const category = await Category.findById(id);
    if (!category || category.deletedAt) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    // Validate name if being updated
    if (name && (name.trim().length < 2 || name.length > 100)) {
      throw new ValidationError('Category name must be between 2-100 characters', 'INVALID_NAME');
    }

    // Check for duplicate name
    if (name && name.trim() !== category.name) {
      const duplicate = await Category.findOne({
        name: name.trim(),
        _id: { $ne: id },
        deletedAt: null
      });
      if (duplicate) {
        throw new AppError('Category with this name already exists', 409, 'CATEGORY_EXISTS');
      }
    }

    // Prevent category from becoming its own parent
    if (parentCategory && parentCategory === id) {
      throw new ValidationError('Category cannot be its own parent', 'INVALID_PARENT');
    }

    // Validate parent category
    if (parentCategory && parentCategory !== (category.parentCategory?.toString() || null)) {
      const parentCat = await Category.findById(parentCategory);
      if (!parentCat || parentCat.deletedAt) {
        throw new AppError('Parent category not found', 404, 'PARENT_CATEGORY_NOT_FOUND');
      }
    }

    // Update fields
    if (name) category.name = name.trim();
    if (description !== undefined) category.description = description?.trim() || '';
    if (icon) category.icon = icon;
    if (image) category.image = image;
    if (parentCategory !== undefined) category.parentCategory = parentCategory || null;
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    if (isActive !== undefined) category.isActive = isActive;
    if (seoTitle !== undefined) category.seoTitle = seoTitle?.trim() || '';
    if (seoMetaDescription !== undefined) category.seoMetaDescription = seoMetaDescription?.trim() || '';
    if (seoKeywords !== undefined) category.seoKeywords = seoKeywords || [];

    category.updatedBy = req.user._id;
    await category.save();

    logger.info(`Category updated: ${id} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: category,
      message: 'Category updated successfully'
    });
  } catch (error) {
    logger.error('Error updating category:', error);
    next(error);
  }
};

/**
 * Soft delete category
 * DELETE /api/categories/:id
 */
exports.deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category || category.deletedAt) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    // Check if category can be deleted
    const canDelete = await category.canBeDeleted();
    if (!canDelete) {
      throw new AppError('Category has active products or subcategories and cannot be deleted', 400, 'CATEGORY_HAS_DEPENDENCIES');
    }

    // Soft delete
    category.deletedAt = new Date();
    category.updatedBy = req.user._id;
    await category.save();

    logger.info(`Category soft deleted: ${id} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting category:', error);
    next(error);
  }
};

/**
 * Restore soft-deleted category
 * PATCH /api/categories/:id/restore
 */
exports.restoreCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id).setOptions({ includeSoftDeleted: true });
    if (!category) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    if (!category.deletedAt) {
      throw new AppError('Category is not deleted', 400, 'CATEGORY_NOT_DELETED');
    }

    // Restore
    category.deletedAt = null;
    category.updatedBy = req.user._id;
    await category.save();

    logger.info(`Category restored: ${id} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: category,
      message: 'Category restored successfully'
    });
  } catch (error) {
    logger.error('Error restoring category:', error);
    next(error);
  }
};

/**
 * Bulk delete categories
 * POST /api/categories/bulk/delete
 */
exports.bulkDeleteCategories = async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError('Category IDs array is required', 'INVALID_IDS');
    }

    if (ids.length > 100) {
      throw new ValidationError('Cannot delete more than 100 categories at once', 'TOO_MANY_IDS');
    }

    const results = {
      deleted: 0,
      failed: 0,
      errors: []
    };

    for (const id of ids) {
      try {
        const category = await Category.findById(id);
        if (!category || category.deletedAt) {
          results.failed++;
          results.errors.push({ id, error: 'Category not found' });
          continue;
        }

        const canDelete = await category.canBeDeleted();
        if (!canDelete) {
          results.failed++;
          results.errors.push({ id, error: 'Category has dependencies' });
          continue;
        }

        category.deletedAt = new Date();
        category.updatedBy = req.user._id;
        await category.save();
        results.deleted++;
      } catch (err) {
        results.failed++;
        results.errors.push({ id, error: err.message });
      }
    }

    logger.info(`Bulk deleted categories: ${results.deleted} successful, ${results.failed} failed by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: results,
      message: `Bulk delete completed: ${results.deleted} deleted, ${results.failed} failed`
    });
  } catch (error) {
    logger.error('Error bulk deleting categories:', error);
    next(error);
  }
};

/**
 * Update product counts for all categories
 * POST /api/categories/bulk/update-counts
 */
exports.updateProductCounts = async (req, res, next) => {
  try {
    const { categoryIds } = req.body;

    let query = { deletedAt: null };
    if (categoryIds && Array.isArray(categoryIds) && categoryIds.length > 0) {
      if (categoryIds.length > 100) {
        throw new ValidationError('Cannot update more than 100 categories at once', 'TOO_MANY_IDS');
      }
      query._id = { $in: categoryIds };
    }

    const categories = await Category.find(query);

    for (const category of categories) {
      const count = await Product.countByCategory(category._id);
      category.productCount = count;
      category.updatedBy = req.user._id;
      await category.save();
    }

    logger.info(`Updated product counts for ${categories.length} categories by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: { updated: categories.length },
      message: `Updated product counts for ${categories.length} categories`
    });
  } catch (error) {
    logger.error('Error updating product counts:', error);
    next(error);
  }
};

module.exports = exports;
