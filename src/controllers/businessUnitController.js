const { body, param, validationResult } = require('express-validator');
const businessUnitService = require('../services/businessUnitService');
const bulkImportService = require('../services/bulkImportService');
const ExcelJS = require('exceljs');
const logger = require('../config/logger');

function handleServiceError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    logger.error(fallbackMessage, error);
    return res.status(500).json({
      error: 'Internal server error',
      message: fallbackMessage
    });
  }

  return res.status(statusCode).json({
    error: error.name || 'Request failed',
    message: error.message
  });
}

/**
 * Validation rules for creating a business unit
 */
const createBusinessUnitValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters')
];

/**
 * Validation rules for updating a business unit
 */
const updateBusinessUnitValidation = [
  param('id').isUUID().withMessage('Business Unit ID must be a valid UUID'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be boolean')
];

/**
 * Create a new business unit
 * POST /api/v1/business-units
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createBusinessUnit(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name } = req.body;
    const businessUnit = await businessUnitService.createBusinessUnit({ name });

    res.status(201).json({
      success: true,
      message: 'Business unit created successfully',
      businessUnit
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while creating business unit');
  }
}

/**
 * Get all business units
 * GET /api/v1/business-units
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getBusinessUnits(req, res) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const businessUnits = await businessUnitService.getBusinessUnits({ includeInactive });

    res.json({
      success: true,
      businessUnits
    });

  } catch (error) {
    logger.error('Get business units controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching business units'
    });
  }
}

/**
 * Get business unit by ID
 * GET /api/v1/business-units/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getBusinessUnitById(req, res) {
  try {
    const buId = req.params.id;
    const businessUnit = await businessUnitService.getBusinessUnitById(buId);

    if (!businessUnit) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Business unit not found'
      });
    }

    res.json({
      success: true,
      businessUnit
    });

  } catch (error) {
    logger.error('Get business unit by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching business unit'
    });
  }
}

/**
 * Update business unit
 * PUT /api/v1/business-units/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateBusinessUnit(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const buId = req.params.id;
    const updates = req.body;

    const businessUnit = await businessUnitService.updateBusinessUnit(buId, updates);

    res.json({
      success: true,
      message: 'Business unit updated successfully',
      businessUnit
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while updating business unit');
  }
}

/**
 * Delete business unit
 * DELETE /api/v1/business-units/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteBusinessUnit(req, res) {
  try {
    const buId = req.params.id;
    await businessUnitService.deleteBusinessUnit(buId);

    res.json({
      success: true,
      message: 'Business unit deleted successfully'
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while deleting business unit');
  }
}

module.exports = {
  createBusinessUnit,
  getBusinessUnits,
  getBusinessUnitById,
  updateBusinessUnit,
  deleteBusinessUnit,
  downloadTemplate,
  uploadBusinessUnits,
  createBusinessUnitValidation,
  updateBusinessUnitValidation
};

/**
 * Download Excel template for bulk upload
 * GET /api/v1/business-units/template
 */
async function downloadTemplate(req, res) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Business Units');

    sheet.columns = [
      { header: 'BU Name', key: 'name', width: 40 },
      { header: 'Status', key: 'status', width: 15 },
    ];

    // Header style
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Example rows
    sheet.addRow({ name: 'Corporate HO', status: 'Active' });
    sheet.addRow({ name: 'Main Dealer Jakarta', status: 'Active' });

    // Note row
    sheet.addRow([]);
    const noteRow = sheet.addRow(['Catatan: Kolom Status diisi Active atau Inactive. BU Code di-generate otomatis.']);
    noteRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="master-bu-template.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Download BU template error:', error);
    res.status(500).json({ success: false, message: 'Gagal generate template' });
  }
}

/**
 * Upload bulk business units from Excel
 * POST /api/v1/business-units/upload
 */
async function uploadBusinessUnits(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'File tidak ditemukan' });
    }

    const result = await bulkImportService.importData(
      req.file.buffer,
      'BusinessUnit',
      { skipDuplicates: true, updateExisting: true }
    );

    return res.json({
      success: true,
      message: `Import selesai. Berhasil: ${result.imported + result.updated}, Gagal: ${result.failed}`,
      imported: result.imported,
      updated: result.updated,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    logger.error('Upload BU error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Gagal upload data Business Unit',
      errors: error.errors || [],
    });
  }
}

