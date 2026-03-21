// backend/src/modules/cart/cart.controller.js
const Cart = require('../../models/cart.model');
const Product = require('../../models/product.model');
const logger = require('../../config/logger');
const { AppError, ValidationError } = require('../../utils/errors');

// ==================== GET CART ====================

exports.getCart = async (req, res, next) => {
  try {
    const cart = await Cart.getOrCreateCart(req.user.id);

    return res.status(200).json({
      success: true,
      data: cart,
      message: 'Cart retrieved successfully'
    });
  } catch (error) {
    logger.error('Error fetching cart:', error);
    next(error);
  }
};

// ==================== ADD ITEM ====================

exports.addItemToCart = async (req, res, next) => {
  try {
    const { productId, quantity = 1 } = req.body;

    // Validation
    if (!productId) {
      throw new ValidationError('Product ID is required', 'PRODUCT_ID_REQUIRED');
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw new ValidationError('Quantity must be between 1 and 999', 'INVALID_QUANTITY');
    }

    // Find product
    const product = await Product.findOne({
      _id: productId,
      isActive: true,
      deletedAt: null
    });

    if (!product) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    // Check stock
    if (product.stock.available < quantity) {
      throw new AppError(
        `Only ${product.stock.available} units available`,
        400,
        'INSUFFICIENT_STOCK'
      );
    }

    // Get or create cart
    let cart = await Cart.getOrCreateCart(req.user.id);

    // Add item
    cart.addItem(product, quantity);
    await cart.save();

    logger.info(
      `Product added to cart: ${productId} (qty: ${quantity}) for user ${req.user.id}`
    );

    return res.status(200).json({
      success: true,
      data: cart,
      message: `${product.name} added to cart`
    });
  } catch (error) {
    logger.error('Error adding to cart:', error);
    next(error);
  }
};

// ==================== UPDATE ITEM QUANTITY ====================

exports.updateItemQuantity = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    // Validation
    if (!quantity || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw new ValidationError('Quantity must be between 1 and 999', 'INVALID_QUANTITY');
    }

    // Get cart
    const cart = await Cart.findOne({ userId: req.user.id, isActive: true });

    if (!cart) {
      throw new AppError('Cart not found', 404, 'CART_NOT_FOUND');
    }

    // Find item in cart
    const item = cart.items.find((i) => i.productId.toString() === productId);

    if (!item) {
      throw new AppError('Product not in cart', 404, 'ITEM_NOT_IN_CART');
    }

    // Check stock
    const product = await Product.findById(productId);
    if (!product || product.stock.available < quantity) {
      throw new AppError(
        `Only ${product?.stock.available || 0} units available`,
        400,
        'INSUFFICIENT_STOCK'
      );
    }

    // Update quantity
    cart.updateItemQuantity(productId, quantity);
    await cart.save();

    logger.info(`Cart item updated: ${productId} (qty: ${quantity}) for user ${req.user.id}`);

    return res.status(200).json({
      success: true,
      data: cart,
      message: 'Cart updated successfully'
    });
  } catch (error) {
    logger.error('Error updating cart item:', error);
    next(error);
  }
};

// ==================== REMOVE ITEM ====================

exports.removeItemFromCart = async (req, res, next) => {
  try {
    const { productId } = req.params;

    // Get cart
    const cart = await Cart.findOne({ userId: req.user.id, isActive: true });

    if (!cart) {
      throw new AppError('Cart not found', 404, 'CART_NOT_FOUND');
    }

    // Check if item exists
    const item = cart.items.find((i) => i.productId.toString() === productId);

    if (!item) {
      throw new AppError('Product not in cart', 404, 'ITEM_NOT_IN_CART');
    }

    // Remove item
    cart.removeItem(productId);
    await cart.save();

    logger.info(`Item removed from cart: ${productId} for user ${req.user.id}`);

    return res.status(200).json({
      success: true,
      data: cart,
      message: 'Item removed from cart'
    });
  } catch (error) {
    logger.error('Error removing from cart:', error);
    next(error);
  }
};

// ==================== CLEAR CART ====================

exports.clearCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.id, isActive: true });

    if (!cart) {
      throw new AppError('Cart not found', 404, 'CART_NOT_FOUND');
    }

    // Clear items
    cart.clear();
    await cart.save();

    logger.info(`Cart cleared for user ${req.user.id}`);

    return res.status(200).json({
      success: true,
      data: cart,
      message: 'Cart cleared successfully'
    });
  } catch (error) {
    logger.error('Error clearing cart:', error);
    next(error);
  }
};

// ==================== APPLY SHIPPING ====================

exports.applyShipping = async (req, res, next) => {
  try {
    const { shippingCharge } = req.body;

    // Validation
    if (shippingCharge === undefined || shippingCharge < 0) {
      throw new ValidationError('Shipping charge must be non-negative', 'INVALID_SHIPPING');
    }

    // Get cart
    const cart = await Cart.findOne({ userId: req.user.id, isActive: true });

    if (!cart) {
      throw new AppError('Cart not found', 404, 'CART_NOT_FOUND');
    }

    // Apply shipping
    cart.setShipping(shippingCharge);
    await cart.save();

    logger.info(
      `Shipping applied to cart for user ${req.user.id}: ₹${shippingCharge}`
    );

    return res.status(200).json({
      success: true,
      data: cart,
      message: 'Shipping applied successfully'
    });
  } catch (error) {
    logger.error('Error applying shipping:', error);
    next(error);
  }
};

module.exports = exports;
