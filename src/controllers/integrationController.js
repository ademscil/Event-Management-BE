const { query, validationResult } = require('express-validator');
const sapSyncService = require('../services/sapSyncService');
const logger = require('../config/logger');

/**
 * Trigger SAP sync
 * POST /api/v1/integrations/sap/sync
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function triggerSAPSync(req, res) {
  try {
    const result = await sapSyncService.syncOrganizationalData();

    if (!result.success) {
      return res.status(400).json({
        error: 'SAP sync failed',
        message: result.errorMessage,
        details: result.errors
      });
    }

    res.json({
      success: true,
      message: 'SAP sync completed successfully',
      summary: {
        added: result.added,
        updated: result.updated,
        deactivated: result.deactivated,
        errors: result.errors
      }
    });

  } catch (error) {
    logger.error('Trigger SAP sync controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during SAP sync'
    });
  }
}

/**
 * Get SAP sync status
 * GET /api/v1/integrations/sap/sync/status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getSAPSyncStatus(req, res) {
  try {
    const status = await sapSyncService.getSyncStatus();

    res.json({
      success: true,
      status
    });

  } catch (error) {
    logger.error('Get SAP sync status controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching sync status'
    });
  }
}

/**
 * Get SAP sync history
 * GET /api/v1/integrations/sap/sync/history
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getSAPSyncHistory(req, res) {
  try {
    const { limit, offset } = req.query;

    const filter = {};
    if (limit) filter.limit = parseInt(limit);
    if (offset) filter.offset = parseInt(offset);

    const history = await sapSyncService.getSyncHistory(filter);

    res.json({
      success: true,
      history: history.logs,
      total: history.total
    });

  } catch (error) {
    logger.error('Get SAP sync history controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching sync history'
    });
  }
}

/**
 * Test SAP connection
 * GET /api/v1/integrations/sap/test-connection
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function testSAPConnection(req, res) {
  try {
    const result = await sapSyncService.testConnection();

    if (!result.success) {
      return res.status(400).json({
        error: 'Connection test failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'SAP connection successful',
      details: result.details
    });

  } catch (error) {
    logger.error('Test SAP connection controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while testing connection'
    });
  }
}

module.exports = {
  triggerSAPSync,
  getSAPSyncStatus,
  getSAPSyncHistory,
  testSAPConnection
};
