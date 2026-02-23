const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const ticketRoutes = require('./routes/tickets');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const shiftRoutes = require('./routes/shifts');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const templateRoutes = require('./routes/templates');
const aiReviewRoutes = require('./routes/aiReview');

const app = express();

app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isDevLocalOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  if (process.env.NODE_ENV === 'development') {
    return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/i.test(origin);
  }

  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (isDevLocalOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
    });
  },
});

// Disable rate limiting in development to avoid blocking local testing.
if (process.env.NODE_ENV !== 'development') {
  app.use('/api/', limiter);
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/ai-review', aiReviewRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'IT Ticketing System API is running',
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

module.exports = app;
