const { param, query, validationResult } = require('express-validator');
const reportService = require('../services/reportService');
const logger = require('../config/logger');

/**
 * Generate report
 * POST /api/v1/reports/generate
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function generateReport(req, res) {
  try {
    const request = req.body;
    const report = await reportService.generateReport(request);

    res.json({
      success: true,
      report
    });

  } catch (error) {
    logger.error('Generate report controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while generating report'
    });
  }
}

/**
 * Generate before takeout report
 * POST /api/v1/reports/before-takeout
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function generateBeforeTakeoutReport(req, res) {
  try {
    const request = req.body;
    const report = await reportService.generateBeforeTakeoutReport(request);

    res.json({
      success: true,
      report
    });

  } catch (error) {
    logger.error('Generate before takeout report controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while generating report'
    });
  }
}

/**
 * Generate after takeout report
 * POST /api/v1/reports/after-takeout
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function generateAfterTakeoutReport(req, res) {
  try {
    const request = req.body;
    const report = await reportService.generateAfterTakeoutReport(request);

    res.json({
      success: true,
      report
    });

  } catch (error) {
    logger.error('Generate after takeout report controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while generating report'
    });
  }
}

/**
 * Get report selection list
 * GET /api/v1/reports/selection-list
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getReportSelectionList(req, res) {
  try {
    const list = await reportService.getReportSelectionList();

    res.json({
      success: true,
      surveys: list
    });

  } catch (error) {
    logger.error('Get report selection list controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching report selection list'
    });
  }
}

/**
 * Get takeout comparison table
 * GET /api/v1/reports/takeout-comparison/:surveyId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getTakeoutComparisonTable(req, res) {
  try {
    const surveyId = parseInt(req.params.surveyId);
    const { functionId } = req.query;

    const comparison = await reportService.getTakeoutComparisonTable(
      surveyId,
      functionId ? parseInt(functionId) : null
    );

    res.json({
      success: true,
      comparison
    });

  } catch (error) {
    logger.error('Get takeout comparison controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching comparison'
    });
  }
}

/**
 * Get Department Head review
 * GET /api/v1/reports/department-head-review/:departmentId/:surveyId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getDepartmentHeadReview(req, res) {
  try {
    const departmentId = parseInt(req.params.departmentId);
    const surveyId = parseInt(req.params.surveyId);

    const review = await reportService.getDepartmentHeadReview(departmentId, surveyId);

    res.json({
      success: true,
      review
    });

  } catch (error) {
    logger.error('Get Department Head review controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching review'
    });
  }
}

/**
 * Get scores by function
 * GET /api/v1/reports/scores-by-function/:departmentId/:surveyId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getScoresByFunction(req, res) {
  try {
    const departmentId = parseInt(req.params.departmentId);
    const surveyId = parseInt(req.params.surveyId);

    const scores = await reportService.getScoresByFunction(departmentId, surveyId);

    res.json({
      success: true,
      scores
    });

  } catch (error) {
    logger.error('Get scores by function controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching scores'
    });
  }
}

/**
 * Get approved takeouts
 * GET /api/v1/reports/approved-takeouts/:departmentId/:surveyId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getApprovedTakeouts(req, res) {
  try {
    const departmentId = parseInt(req.params.departmentId);
    const surveyId = parseInt(req.params.surveyId);

    const takeouts = await reportService.getApprovedTakeouts(departmentId, surveyId);

    res.json({
      success: true,
      takeouts
    });

  } catch (error) {
    logger.error('Get approved takeouts controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching takeouts'
    });
  }
}

/**
 * Export report to Excel
 * POST /api/v1/reports/export/excel
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function exportToExcel(req, res) {
  try {
    const request = req.body;
    const buffer = await reportService.exportToExcel(request);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');
    res.send(buffer);

  } catch (error) {
    logger.error('Export to Excel controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while exporting to Excel'
    });
  }
}

/**
 * Export report to PDF
 * POST /api/v1/reports/export/pdf
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function exportToPdf(req, res) {
  try {
    const request = req.body;
    const buffer = await reportService.exportToPdf(request);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');
    res.send(buffer);

  } catch (error) {
    logger.error('Export to PDF controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while exporting to PDF'
    });
  }
}

/**
 * Get aggregate statistics
 * POST /api/v1/reports/statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getAggregateStatistics(req, res) {
  try {
    const request = req.body;
    const statistics = await reportService.getAggregateStatistics(request);

    res.json({
      success: true,
      statistics
    });

  } catch (error) {
    logger.error('Get aggregate statistics controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching statistics'
    });
  }
}

module.exports = {
  generateReport,
  generateBeforeTakeoutReport,
  generateAfterTakeoutReport,
  getReportSelectionList,
  getTakeoutComparisonTable,
  getDepartmentHeadReview,
  getScoresByFunction,
  getApprovedTakeouts,
  exportToExcel,
  exportToPdf,
  getAggregateStatistics
};
