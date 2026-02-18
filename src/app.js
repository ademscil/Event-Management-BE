const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./config/logger');
const { applySecurityMiddleware, configureAuthRateLimit } = require('./config/security');

/**
 * Initialize Express application
 */
const app = express();

/**
 * Security Middleware Configuration
 */

// Apply comprehensive security middleware (Helmet, CORS, Rate Limiting)
applySecurityMiddleware(app);

// Rate limiting - Authentication endpoints (stricter)
app.use('/api/v1/auth/login', configureAuthRateLimit());

// Rate limiting - Password reset endpoints (stricter)
const rateLimit = require('express-rate-limit');
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: {
    error: 'Too many password reset attempts',
    message: 'Too many password reset attempts, please try again later.'
  },
  handler: (req, res) => {
    logger.warn('Password reset rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email
    });
    res.status(429).json({
      error: 'Too many password reset attempts',
      message: 'Too many password reset attempts, please try again later.'
    });
  }
});

app.use('/api/v1/auth/reset-password', passwordResetLimiter);
app.use('/api/v1/auth/forgot-password', passwordResetLimiter);

// Additional security middleware
const { 
  securityHeaders, 
  contentTypeValidation, 
  requestSizeValidation,
  xssProtection,
  sqlInjectionProtection
} = require('./middleware/security');

app.use(securityHeaders);
app.use(requestSizeValidation(config.upload.maxFileSizeMB * 1024 * 1024));

// Body parsing middleware
app.use(express.json({ limit: `${config.upload.maxFileSizeMB}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${config.upload.maxFileSizeMB}mb` }));

// Input sanitization and validation
app.use(xssProtection);
app.use(sqlInjectionProtection);
app.use(contentTypeValidation);

// Extensionless page routes for cleaner URLs
const adminStaticDir = path.join(__dirname, '../public/admin');
const surveyStaticDir = path.join(__dirname, '../public/survey');

function registerExtensionlessPageRoutes(basePath, staticDir, defaultPage) {
  app.get([basePath, `${basePath}/`], (req, res) => {
    res.redirect(`${basePath}/${defaultPage}`);
  });

  // Redirect old .html URLs to extensionless paths
  app.get(`${basePath}/:page.html`, (req, res) => {
    res.redirect(301, `${basePath}/${req.params.page}`);
  });

  // Serve HTML pages without exposing .html in URL
  app.get(`${basePath}/:page`, (req, res, next) => {
    const page = req.params.page;

    // Skip static assets and nested paths
    if (!page || page.includes('.')) {
      return next();
    }

    const htmlPath = path.join(staticDir, `${page}.html`);
    if (fs.existsSync(htmlPath)) {
      return res.sendFile(htmlPath);
    }

    return next();
  });
}

registerExtensionlessPageRoutes('/admin', adminStaticDir, 'login');
registerExtensionlessPageRoutes('/survey', surveyStaticDir, 'index');

// Serve static files
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
app.use('/survey', express.static(path.join(__dirname, '../public/survey')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Request logging middleware
app.use((req, res, next) => {
  const monitoringService = require('./services/monitoringService');
  monitoringService.incrementRequests();
  
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Audit logging middleware (applied globally for all API routes)
const { auditLoggerMiddleware } = require('./middleware/auditLogger');
app.use('/api/v1', auditLoggerMiddleware({
  skipPaths: [
    '/api/v1/auth/validate',
    '/api/v1/health',
    '/api/v1/monitoring/health',
    '/api/v1/monitoring/uptime',
    '/api/v1/audit'
  ],
  logGetRequests: false // Only log state-changing operations by default
}));

// Health check endpoint (simple)
app.get('/health', async (req, res) => {
  const db = require('./database/connection');
  try {
    await db.getPool();
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      environment: config.env,
      version: '1.0.0'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

// API routes
const authRoutes = require('./routes/authRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes');
const apiRoutes = require('./routes/apiRoutes');

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/monitoring', monitoringRoutes);
app.use('/api/v1', apiRoutes);

// API health check endpoint (detailed)
app.get('/api/v1/health', async (req, res) => {
  const monitoringService = require('./services/monitoringService');
  try {
    const health = await monitoringService.getHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Default API route
app.use('/api', (req, res) => {
  res.json({ 
    message: 'CSI Portal API',
    version: '1.0.0',
    environment: config.env
  });
});

// Import error handling middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// 404 handler (must be before error handler)
app.use(notFoundHandler);

// Global error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
