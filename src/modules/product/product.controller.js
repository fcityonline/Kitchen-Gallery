const Product = require('../../models/product.model');
const Category = require('../../models/category.model');
const logger = require('../../config/logger');
const { AppError, ValidationError } = require('../../utils/errors');

// ==================== PUBLIC CONTROLLERS ====================

/**
 * Search products
 * GET /api/products/search?q=kitchen&categoryId=xxx&page=1&limit=12
 */
exports.searchProducts = async (req, res, next) => {
  try {
    const { q, categoryId, page = 1, limit = 12, minPrice, maxPrice } = req.query;

    if (!q || q.trim().length < 2) {
      throw new ValidationError('Search query must be at least 2 characters', 'INVALID_QUERY');
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const filters = {
      categoryId: categoryId || undefined,
      minPrice: minPrice ? Math.max(0, parseFloat(minPrice)) : undefined,
      maxPrice: maxPrice ? Math.max(0, parseFloat(maxPrice)) : undefined
    };

    if (filters.minPrice && filters.maxPrice && filters.minPrice > filters.maxPrice) {
      throw new ValidationError('Min price cannot be greater than max price', 'INVALID_PRICE_RANGE');
    }

    const products = await Product.search(q.trim(), filters, pageNum, limitNum);

    const totalCount = await Product.countDocuments({
      $text: { $search: q.trim() },
      isActive: true,
      deletedAt: null,
      visibility: 'public',
      ...(filters.categoryId && { category: filters.categoryId }),
      ...(filters.minPrice && { 'pricing.finalPrice': { $gte: filters.minPrice } }),
      ...(filters.maxPrice && { 'pricing.finalPrice': { $lte: filters.maxPrice } })
    });

    logger.info(`Product search: "${q.trim()}" - found ${totalCount} results`);

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
      message: 'Search results retrieved successfully'
    });
  } catch (error) {
    logger.error('Error searching products:', error);
    next(error);
  }
};

/**
 * Get featured products
 * GET /api/products/featured?limit=12
 */
exports.getFeaturedProducts = async (req, res, next) => {
  try {
    const { limit = 12 } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const products = await Product.getFeatured(limitNum);

    return res.status(200).json({
      success: true,
      data: products,
      message: 'Featured products retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching featured products:', error);
    next(error);
  }
};

/**
 * Get best sellers
 * GET /api/products/best-sellers?limit=12
 */
exports.getBestSellers = async (req, res, next) => {
  try {
    const { limit = 12 } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const products = await Product.getBestSellers(limitNum);

    return res.status(200).json({
      success: true,
      data: products,
      message: 'Best sellers retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching best sellers:', error);
    next(error);
  }
};

/**
 * Get product by slug
 * GET /api/products/slug/:slug
 */
exports.getProductBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    if (!slug || slug.trim() === '') {
      throw new ValidationError('Product slug is required', 'INVALID_SLUG');
    }

    const product = await Product.findOne({
      slug: slug.toLowerCase(),
      isActive: true,
      deletedAt: null
    })
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .populate('relatedProducts', 'name slug images pricing.finalPrice ratings.average');

    if (!product) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    // Increment view count (async, don't wait)
    product.incrementViewCount().catch((err) => {
      logger.error('Error incrementing view count:', err);
    });

    return res.status(200).json({
      success: true,
      data: product,
      message: 'Product retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching product by slug:', error);
    next(error);
  }
};

/**
 * Get product details
 * GET /api/products/:id
 */
exports.getProductDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await Product.findOne({
      _id: id,
      isActive: true,
      deletedAt: null
    })
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .populate('createdBy', 'name email')
      .populate('relatedProducts', 'name slug images pricing.finalPrice ratings.average');

    if (!product) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    // Increment view count (async)
    product.incrementViewCount().catch((err) => {
      logger.error('Error incrementing view count:', err);
    });

    return res.status(200).json({
      success: true,
      data: product,
      message: 'Product details retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching product details:', error);
    next(error);
  }
};

// ==================== ADMIN CONTROLLERS ====================

/**
 * Create product
 * POST /api/products
 */
exports.createProduct = async (req, res, next) => {
  try {
    const {
      name,
      description,
      category,
      subCategory,
      pricing,
      stock,
      specifications,
      attributes,
      images,
      relatedProducts,
      seoTitle,
      seoMetaDescription,
      seoKeywords
    } = req.body;

    // Validation
    if (!name || name.trim().length < 3 || name.length > 200) {
      throw new ValidationError('Product name must be between 3-200 characters', 'INVALID_NAME');
    }

    if (!category) {
      throw new ValidationError('Category is required', 'CATEGORY_REQUIRED');
    }

    // Check if category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists || categoryExists.deletedAt) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    // Validate pricing
    if (!pricing || !pricing.costPrice || !pricing.sellingPrice) {
      throw new ValidationError('Cost price and selling price are required', 'INVALID_PRICING');
    }

    if (pricing.costPrice < 0 || pricing.sellingPrice < 0) {
      throw new ValidationError('Prices cannot be negative', 'INVALID_PRICING');
    }

    // Validate stock
    if (!stock || stock.quantity === undefined) {
      throw new ValidationError('Stock quantity is required', 'INVALID_STOCK');
    }

    // Check for duplicate product name
    const existingProduct = await Product.findOne({
      name: name.trim(),
      deletedAt: null
    });
    if (existingProduct) {
      throw new AppError('Product with this name already exists', 409, 'PRODUCT_EXISTS');
    }

    // Create product
    const product = new Product({
      name: name.trim(),
      description: description || {},
      category,
      subCategory: subCategory || null,
      pricing,
      stock,
      specifications: specifications || [],
      attributes: attributes || {},
      images: images || [],
      relatedProducts: relatedProducts || [],
      seoTitle: seoTitle?.trim() || '',
      seoMetaDescription: seoMetaDescription?.trim() || '',
      seoKeywords: seoKeywords || [],
      createdBy: req.user._id
    });

    await product.save();

    // Update category product count
    await Category.updateOne({ _id: category }, { $inc: { productCount: 1 } });

    logger.info(`Product created: ${product._id} in category ${category} by user ${req.user._id}`);

    return res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully'
    });
  } catch (error) {
    logger.error('Error creating product:', error);
    next(error);
  }
};

/**
 * Update product
 * PUT /api/products/:id
 */
exports.updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      category,
      subCategory,
      pricing,
      stock,
      specifications,
      attributes,
      relatedProducts,
      isActive,
      isFeatured,
      isNewArrival,
      isBestSeller,
      isOnSale,
      visibility,
      seoTitle,
      seoMetaDescription,
      seoKeywords
    } = req.body;

    // Find product
    const product = await Product.findById(id);
    if (!product || product.deletedAt) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    // Validate name if changing
    if (name && (name.trim().length < 3 || name.length > 200)) {
      throw new ValidationError('Product name must be between 3-200 characters', 'INVALID_NAME');
    }

    // Check for duplicate name (excluding current product)
    if (name && name.trim() !== product.name) {
      const duplicate = await Product.findOne({
        name: name.trim(),
        _id: { $ne: id },
        deletedAt: null
      });
      if (duplicate) {
        throw new AppError('Product with this name already exists', 409, 'PRODUCT_EXISTS');
      }
    }

    // Validate category if changing
    if (category && category !== product.category.toString()) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists || categoryExists.deletedAt) {
        throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
      }
    }

    // Validate pricing if provided
    if (pricing) {
      if (pricing.costPrice !== undefined && pricing.costPrice < 0) {
        throw new ValidationError('Cost price cannot be negative', 'INVALID_PRICING');
      }
      if (pricing.sellingPrice !== undefined && pricing.sellingPrice < 0) {
        throw new ValidationError('Selling price cannot be negative', 'INVALID_PRICING');
      }
    }

    // Update fields
    if (name) product.name = name.trim();
    if (description) product.description = description;
    if (category) product.category = category;
    if (subCategory !== undefined) product.subCategory = subCategory || null;
    if (pricing) product.pricing = { ...product.pricing.toObject(), ...pricing };
    if (stock) product.stock = { ...product.stock.toObject(), ...stock };
    if (specifications !== undefined) product.specifications = specifications;
    if (attributes !== undefined) product.attributes = attributes;
    if (relatedProducts !== undefined) product.relatedProducts = relatedProducts;
    if (isActive !== undefined) product.isActive = isActive;
    if (isFeatured !== undefined) product.isFeatured = isFeatured;
    if (isNewArrival !== undefined) product.isNewArrival = isNewArrival;
    if (isBestSeller !== undefined) product.isBestSeller = isBestSeller;
    if (isOnSale !== undefined) product.isOnSale = isOnSale;
    if (visibility !== undefined) product.visibility = visibility;
    if (seoTitle !== undefined) product.seoTitle = seoTitle?.trim() || '';
    if (seoMetaDescription !== undefined) product.seoMetaDescription = seoMetaDescription?.trim() || '';
    if (seoKeywords !== undefined) product.seoKeywords = seoKeywords || [];

    product.updatedBy = req.user._id;
    await product.save();

    logger.info(`Product updated: ${id} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: product,
      message: 'Product updated successfully'
    });
  } catch (error) {
    logger.error('Error updating product:', error);
    next(error);
  }
};

/**
 * Upload product images
 * POST /api/products/:id/images
 */
exports.uploadImages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { images } = req.body;

    if (!Array.isArray(images) || images.length === 0) {
      throw new ValidationError('Images array is required', 'INVALID_IMAGES');
    }

    if (images.length > 10) {
      throw new ValidationError('Cannot upload more than 10 images', 'TOO_MANY_IMAGES');
    }

    const product = await Product.findById(id);
    if (!product || product.deletedAt) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    // Add new images
    images.forEach((img) => {
      if (img.url && img.url.trim() !== '') {
        product.images.push({
          url: img.url,
          publicId: img.publicId || '',
          alt: img.alt || product.name,
          isThumbnail: img.isThumbnail || false
        });
      }
    });

    // Limit total images to 10
    if (product.images.length > 10) {
      product.images = product.images.slice(-10);
    }

    product.updatedBy = req.user._id;
    await product.save();

    logger.info(`Uploaded ${images.length} images for product ${id} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: product.images,
      message: 'Images uploaded successfully'
    });
  } catch (error) {
    logger.error('Error uploading images:', error);
    next(error);
  }
};

/**
 * Delete product image
 * DELETE /api/products/:id/images/:imageId
 */
exports.deleteImage = async (req, res, next) => {
  try {
    const { id, imageId } = req.params;

    const product = await Product.findById(id);
    if (!product || product.deletedAt) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    const imageIndex = product.images.findIndex((img) => img._id.toString() === imageId);
    if (imageIndex === -1) {
      throw new AppError('Image not found', 404, 'IMAGE_NOT_FOUND');
    }

    if (product.images.length === 1) {
      throw new AppError('Cannot delete the only image. Product must have at least one image.', 400, 'LAST_IMAGE');
    }

    product.images.splice(imageIndex, 1);
    product.updatedBy = req.user._id;
    await product.save();

    logger.info(`Deleted image ${imageId} from product ${id} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: product.images,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting image:', error);
    next(error);
  }
};

/**
 * Toggle featured status
 * PATCH /api/products/:id/featured
 */
exports.toggleFeatured = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isFeatured } = req.body;

    if (isFeatured === undefined) {
      throw new ValidationError('isFeatured boolean is required', 'INVALID_REQUEST');
    }

    const product = await Product.findById(id);
    if (!product || product.deletedAt) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    product.isFeatured = isFeatured;
    product.updatedBy = req.user._id;
    await product.save();

    logger.info(`Product ${id} featured status updated to ${isFeatured} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: { id: product._id, isFeatured: product.isFeatured },
      message: `Product ${isFeatured ? 'featured' : 'unfeatured'} successfully`
    });
  } catch (error) {
    logger.error('Error toggling featured:', error);
    next(error);
  }
};

/**
 * Toggle best seller status
 * PATCH /api/products/:id/bestseller
 */
exports.toggleBestSeller = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isBestSeller } = req.body;

    if (isBestSeller === undefined) {
      throw new ValidationError('isBestSeller boolean is required', 'INVALID_REQUEST');
    }

    const product = await Product.findById(id);
    if (!product || product.deletedAt) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    product.isBestSeller = isBestSeller;
    product.updatedBy = req.user._id;
    await product.save();

    logger.info(`Product ${id} best seller status updated to ${isBestSeller} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: { id: product._id, isBestSeller: product.isBestSeller },
      message: `Product marked as ${isBestSeller ? 'best seller' : 'not best seller'} successfully`
    });
  } catch (error) {
    logger.error('Error toggling best seller:', error);
    next(error);
  }
};

/**
 * Update stock
 * PATCH /api/products/:id/stock
 */
exports.updateStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity, lowStockLevel } = req.body;

    if (quantity === undefined && lowStockLevel === undefined) {
      throw new ValidationError('At least one stock field must be provided', 'INVALID_REQUEST');
    }

    if (quantity !== undefined && (quantity < 0 || !Number.isInteger(quantity))) {
      throw new ValidationError('Quantity must be a non-negative integer', 'INVALID_QUANTITY');
    }

    if (lowStockLevel !== undefined && (lowStockLevel < 0 || !Number.isInteger(lowStockLevel))) {
      throw new ValidationError('Low stock level must be a non-negative integer', 'INVALID_LOW_STOCK');
    }

    const product = await Product.findById(id);
    if (!product || product.deletedAt) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    if (quantity !== undefined) product.stock.quantity = quantity;
    if (lowStockLevel !== undefined) product.stock.lowStockLevel = lowStockLevel;

    product.updatedBy = req.user._id;
    await product.save();

    logger.info(`Product ${id} stock updated by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: product.stock,
      message: 'Stock updated successfully'
    });
  } catch (error) {
    logger.error('Error updating stock:', error);
    next(error);
  }
};

/**
 * Soft delete product
 * DELETE /api/products/:id
 */
exports.deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product || product.deletedAt) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    product.deletedAt = new Date();
    product.updatedBy = req.user._id;
    await product.save();

    // Update category product count
    await Category.updateOne({ _id: product.category }, { $inc: { productCount: -1 } });

    logger.info(`Product soft deleted: ${id} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting product:', error);
    next(error);
  }
};

/**
 * Restore product
 * PATCH /api/products/:id/restore
 */
exports.restoreProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id).setOptions({ includeSoftDeleted: true });
    if (!product) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    if (!product.deletedAt) {
      throw new AppError('Product is not deleted', 400, 'PRODUCT_NOT_DELETED');
    }

    product.deletedAt = null;
    product.updatedBy = req.user._id;
    await product.save();

    // Update category product count
    await Category.updateOne({ _id: product.category }, { $inc: { productCount: 1 } });

    logger.info(`Product restored: ${id} by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: product,
      message: 'Product restored successfully'
    });
  } catch (error) {
    logger.error('Error restoring product:', error);
    next(error);
  }
};

/**
 * Bulk delete products
 * POST /api/products/bulk/delete
 */
exports.bulkDeleteProducts = async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError('Product IDs array is required', 'INVALID_IDS');
    }

    if (ids.length > 100) {
      throw new ValidationError('Cannot delete more than 100 products at once', 'TOO_MANY_IDS');
    }

    const results = {
      deleted: 0,
      failed: 0,
      errors: []
    };

    for (const id of ids) {
      try {
        const product = await Product.findById(id);
        if (!product || product.deletedAt) {
          results.failed++;
          results.errors.push({ id, error: 'Product not found' });
          continue;
        }

        product.deletedAt = new Date();
        product.updatedBy = req.user._id;
        await product.save();

        // Update category count
        await Category.updateOne({ _id: product.category }, { $inc: { productCount: -1 } });

        results.deleted++;
      } catch (err) {
        results.failed++;
        results.errors.push({ id, error: err.message });
      }
    }

    logger.info(`Bulk deleted products: ${results.deleted} successful, ${results.failed} failed by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: results,
      message: `Bulk delete completed: ${results.deleted} deleted, ${results.failed} failed`
    });
  } catch (error) {
    logger.error('Error bulk deleting products:', error);
    next(error);
  }
};

/**
 * Bulk update products
 * POST /api/products/bulk/update
 */
exports.bulkUpdateProducts = async (req, res, next) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ValidationError('Updates array is required', 'INVALID_UPDATES');
    }

    if (updates.length > 50) {
      throw new ValidationError('Cannot update more than 50 products at once', 'TOO_MANY_UPDATES');
    }

    const results = {
      updated: 0,
      failed: 0,
      errors: []
    };

    for (const update of updates) {
      try {
        const product = await Product.findById(update.id);
        if (!product || product.deletedAt) {
          results.failed++;
          results.errors.push({ id: update.id, error: 'Product not found' });
          continue;
        }

        if (update.data.isFeatured !== undefined) product.isFeatured = update.data.isFeatured;
        if (update.data.isBestSeller !== undefined) product.isBestSeller = update.data.isBestSeller;
        if (update.data.isActive !== undefined) product.isActive = update.data.isActive;
        if (update.data.visibility !== undefined) product.visibility = update.data.visibility;

        product.updatedBy = req.user._id;
        await product.save();
        results.updated++;
      } catch (err) {
        results.failed++;
        results.errors.push({ id: update.id, error: err.message });
      }
    }

    logger.info(`Bulk updated products: ${results.updated} successful, ${results.failed} failed by user ${req.user._id}`);

    return res.status(200).json({
      success: true,
      data: results,
      message: `Bulk update completed: ${results.updated} updated, ${results.failed} failed`
    });
  } catch (error) {
    logger.error('Error bulk updating products:', error);
    next(error);
  }
};

module.exports = exports;
