// backend/server.js

require('dotenv').config();

const logger = require('./src/config/logger');
const morgan = require('morgan');
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const securityHeaders = require('./src/middlewares/securityHeaders');
const errorHandler = require('./src/middlewares/errorHandler');

const authRoutes = require('./src/modules/auth/auth.routes');
const dashboardRoutes = require('./src/modules/dashboard/dashboard.routes');
const categoryRoutes = require('./src/modules/category/category.routes');
const productRoutes = require('./src/modules/product/product.routes');
const cartRoutes = require('./src/modules/cart/cart.routes');
const addressRoutes = require('./src/modules/address/address.routes');
const orderRoutes = require('./src/modules/order/order.routes');
const paymentRoutes = require('./src/modules/payment/payment.routes');
// const whatsappRoutes = require('./src/modules/whatsapp/whatsapp.routes');

// Initialize WhatsApp (optional if configured)
const { initializeWhatsApp } = require('./src/config/whatsapp');

const app = express();

// ==================== SECURITY & HEADERS ====================
app.disable('x-powered-by');
app.use(helmet());
app.use(securityHeaders);
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy: origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ==================== BODY PARSING ====================
app.use(express.json({ limit: '10kb' })); // Limit payload size
app.use(express.urlencoded({ limit: '10kb', extended: true }));
app.use(cookieParser());

// ==================== LOGGING ====================
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// ==================== REQUEST VALIDATION ====================
// Sanitize request body to prevent NoSQL injection
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }
  next();
});

// ==================== RATE LIMITING ====================
if (process.env.NODE_ENV === 'production') {
  const globalRateLimit = 100;
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: globalRateLimit, // Limit each IP per window
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/health' // Skip health check
  });

  app.use('/api/', globalLimiter);
} else {
  logger.info('Development mode: global rate limiter disabled.');
}

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ==================== ROUTES ====================
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
// app.use('/api/whatsapp', whatsappRoutes);

// ==================== 404 HANDLER ====================
app.use((req, res) => {
  logger.warn('404 Not Found', {
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// ==================== GLOBAL ERROR HANDLER ====================
app.use(errorHandler);

// ==================== DATABASE CONNECTION ====================

// Initialize WhatsApp (before database connection)
initializeWhatsApp();

let mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kitchen-gallery';
let isDbConnected = false;

const connectToMongo = async () => {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isDbConnected = true;
    logger.info('✅ MongoDB Connected successfully', { mongoUri });
  } catch (error) {
    isDbConnected = false;
    logger.error('❌ MongoDB Connection Error', {
      message: error.message || 'unknown',
      code: error.code || 'N/A',
      stack: error.stack,
      mongoUri
    });

    if (process.env.NODE_ENV !== 'production' && mongoUri !== 'mongodb://127.0.0.1:27017/kitchen-gallery') {
      logger.warn('Trying local MongoDB fallback URI in development.');
      mongoUri = 'mongodb://127.0.0.1:27017/kitchen-gallery';
    }

    setTimeout(connectToMongo, 5000); // retry until connected
  }
};

connectToMongo();

app.use((req, res, next) => {
  if (!isDbConnected && process.env.NODE_ENV !== 'production') {
    return res.status(503).json({
      success: false,
      message: 'MongoDB is not connected yet, please retry in a few seconds.',
      code: 'DB_NOT_CONNECTED'
    });
  }
  next();
});


// Start server regardless of DB connection
const port = process.env.PORT || 5000;
const server = app.listen(port, () => {
  logger.info(`🚀 Server running on port ${port}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
});

// ==================== UNHANDLED REJECTION ====================
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    promise
  });
});

// ==================== UNCAUGHT EXCEPTION ====================
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

module.exports = app;