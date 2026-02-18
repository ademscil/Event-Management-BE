const express = require('express');
const router = express.Router();
const monitoringService = require('../services/monitoringService');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const logger = require('../config/logger');

/**
 * @route GET /api/v1/monitoring/health
 * @desc Get system health status
 * @access Public
 */
router.get('/health', async (req, res) => {
  try {
    const health = await monitoringService.getHealthStatus();
    
    const statusCode = health.status === 'healthy' ? 200 
      : health.status === 'degraded' ? 200 
      : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * @route GET /api/v1/monitoring/metrics
 * @desc Get application metrics
 * @access Private (SuperAdmin only)
 */
router.get('/metrics', requireAuth, requireRole('SuperAdmin'), async (req, res) => {
  try {
    const metrics = monitoringService.getMetricsReport();
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v1/monitoring/metrics/reset
 * @desc Reset application metrics
 * @access Private (SuperAdmin only)
 */
router.post('/metrics/reset', requireAuth, requireRole('SuperAdmin'), (req, res) => {
  try {
    monitoringService.resetMetrics();
    
    logger.audit('Metrics reset', {
      userId: req.user.userId,
      username: req.user.username
    });
    
    res.json({
      success: true,
      message: 'Metrics reset successfully'
    });
  } catch (error) {
    logger.error('Failed to reset metrics:', error);
    res.status(500).json({
      error: 'Failed to reset metrics',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v1/monitoring/uptime
 * @desc Get application uptime
 * @access Public
 */
router.get('/uptime', (req, res) => {
  try {
    const uptime = monitoringService.getUptime();
    res.json({
      uptime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get uptime:', error);
    res.status(500).json({
      error: 'Failed to retrieve uptime',
      message: error.message
    });
  }
});

/**
 * @route GET /api/v1/monitoring/system
 * @desc Get system information
 * @access Private (SuperAdmin only)
 */
router.get('/system', requireAuth, requireRole('SuperAdmin'), (req, res) => {
  try {
    const system = monitoringService.getSystemMetrics();
    res.json({
      system,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get system info:', error);
    res.status(500).json({
      error: 'Failed to retrieve system information',
      message: error.message
    });
  }
});

module.exports = router;
