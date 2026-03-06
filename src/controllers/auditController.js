const { param, query, validationResult } = require('express-validator');
const auditService = require('../services/auditService');
const logger = require('../config/logger');

/**
 * Get audit logs
 * GET /api/v1/audit/logs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getAuditLogs(req, res) {
  try {
    const { 
      startDate, 
      endDate, 
      userId, 
      username,
      keyword,
      searchBy,
      action, 
      entityType,
      entityId,
      page,
      pageSize,
      limit
    } = req.query;

    const filter = {};
    if (startDate) filter.startDate = new Date(startDate);
    if (endDate) filter.endDate = new Date(endDate);
    if (userId) filter.userId = userId;
    if (username) filter.username = username;
    if (keyword) filter.keyword = keyword;
    if (searchBy) filter.searchBy = searchBy;
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;
    if (page) filter.page = parseInt(page, 10);
    if (pageSize) filter.pageSize = parseInt(pageSize, 10);
    if (limit) filter.pageSize = parseInt(limit, 10);

    const result = await auditService.getAuditLogs(filter);

    res.json({
      success: true,
      logs: result.data || [],
      total: result.pagination?.totalRecords || 0,
      page: result.pagination?.page || 1,
      pageSize: result.pagination?.pageSize || 50,
      totalPages: result.pagination?.totalPages || 1
    });

  } catch (error) {
    logger.error('Get audit logs controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching audit logs'
    });
  }
}

/**
 * Get entity history
 * GET /api/v1/audit/entity-history/:entityType/:entityId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getEntityHistory(req, res) {
  try {
    const entityType = req.params.entityType;
    const entityId = req.params.entityId;

    const history = await auditService.getEntityHistory(entityType, entityId);

    res.json({
      success: true,
      history: history.history || [],
      totalChanges: history.totalChanges || 0,
      entityType: history.entityType || entityType,
      entityId: history.entityId || entityId
    });

  } catch (error) {
    logger.error('Get entity history controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching entity history'
    });
  }
}

/**
 * Log action (manual logging endpoint - typically done via middleware)
 * POST /api/v1/audit/log
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function logAction(req, res) {
  try {
    const log = {
      ...req.body,
      userId: req.user?.userId,
      username: req.user?.username,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    };

    const result = await auditService.logAction(log);

    if (!result.success) {
      return res.status(400).json({
        error: 'Logging failed',
        message: result.errorMessage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Action logged successfully',
      logId: result.logId
    });

  } catch (error) {
    logger.error('Log action controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while logging action'
    });
  }
}

module.exports = {
  getAuditLogs,
  getEntityHistory,
  logAction
};
