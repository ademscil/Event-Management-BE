const { body, param, validationResult } = require('express-validator');
const functionService = require('../services/functionService');
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
 * Validation rules for creating a function
 */
const createFunctionValidation = [
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required')
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('deptId')
    .optional({ nullable: true })
    .isUUID().withMessage('Department ID must be a valid UUID')
];

/**
 * Validation rules for updating a function
 */
const updateFunctionValidation = [
  param('id').isUUID().withMessage('Function ID must be a valid UUID'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be boolean'),
  body('deptId')
    .optional({ nullable: true })
    .isUUID().withMessage('Department ID must be a valid UUID')
];

/**
 * Create a new function
 * POST /api/v1/functions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createFunction(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { code, name, deptId } = req.body;
    const result = await functionService.createFunction({ code, name, deptId });

    res.status(201).json({
      success: true,
      message: 'Function created successfully',
      function: result
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while creating function');
  }
}

/**
 * Get all functions
 * GET /api/v1/functions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getFunctions(req, res) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const functions = await functionService.getFunctions({ includeInactive });

    res.json({
      success: true,
      functions
    });

  } catch (error) {
    logger.error('Get functions controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching functions'
    });
  }
}

/**
 * Get function by ID
 * GET /api/v1/functions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getFunctionById(req, res) {
  try {
    const functionId = req.params.id;
    const func = await functionService.getFunctionById(functionId);

    if (!func) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Function not found'
      });
    }

    res.json({
      success: true,
      function: func
    });

  } catch (error) {
    logger.error('Get function by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching function'
    });
  }
}

/**
 * Update function
 * PUT /api/v1/functions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateFunction(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const functionId = req.params.id;
    const updates = req.body;

    const result = await functionService.updateFunction(functionId, updates);

    res.json({
      success: true,
      message: 'Function updated successfully',
      function: result
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while updating function');
  }
}

/**
 * Delete function
 * DELETE /api/v1/functions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteFunction(req, res) {
  try {
    const functionId = req.params.id;
    await functionService.deleteFunction(functionId);

    res.json({
      success: true,
      message: 'Function deleted successfully'
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while deleting function');
  }
}

/**
 * Download Excel template for bulk upload
 * GET /api/v1/functions/template
 */
async function downloadTemplate(req, res) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Functions');

    sheet.columns = [
      { header: 'Function Code', key: 'code', width: 20 },
      { header: 'Function Name', key: 'name', width: 40 },
      { header: 'Status', key: 'status', width: 15 },
    ];

    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    sheet.addRow({ code: 'INF', name: 'Infrastructure', status: 'Active' });
    sheet.addRow({ code: 'DEV', name: 'Development', status: 'Active' });

    sheet.addRow([]);
    const noteRow = sheet.addRow(['Catatan: Kolom Status diisi Active atau Inactive.']);
    noteRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="master-function-template.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Download Function template error:', error);
    res.status(500).json({ success: false, message: 'Gagal generate template' });
  }
}

/**
 * Upload bulk functions from Excel
 * POST /api/v1/functions/upload
 */
async function uploadFunctions(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'File tidak ditemukan' });
    }

    const ExcelJSLib = require('exceljs');
    const workbook = new ExcelJSLib.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];

    const headerRow = sheet.getRow(1);
    const headers = [];
    headerRow.eachCell((cell) => headers.push(String(cell.value || '').trim()));

    const codeIdx = headers.indexOf('Function Code');
    const nameIdx = headers.indexOf('Function Name');

    if (codeIdx === -1 || nameIdx === -1) {
      return res.status(400).json({
        success: false,
        message: 'Format file tidak valid. Kolom yang diperlukan: Function Code, Function Name, Status'
      });
    }

    // Build new workbook with expected column names for bulkImportService
    const newWorkbook = new ExcelJSLib.Workbook();
    const newSheet = newWorkbook.addWorksheet('Functions');
    newSheet.addRow(['Code', 'Name']);

    let validRows = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const code = String(row.getCell(codeIdx + 1).value || '').trim();
      const name = String(row.getCell(nameIdx + 1).value || '').trim();
      if (!code && !name) return;
      newSheet.addRow([code, name]);
      validRows++;
    });

    if (validRows === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data valid untuk diimport' });
    }

    const buffer = await newWorkbook.xlsx.writeBuffer();
    const { BulkImportService } = require('../services/bulkImportService');
    const importSvc = new BulkImportService();
    const result = await importSvc.importData(buffer, 'Function', { skipDuplicates: true, updateExisting: true });

    return res.json({
      success: true,
      message: `Import selesai. Berhasil: ${result.imported + result.updated}, Gagal: ${result.failed}`,
      imported: result.imported,
      updated: result.updated,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    logger.error('Upload Function error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Gagal upload data Function',
      errors: error.errors || [],
    });
  }
}

module.exports = {
  createFunction,
  getFunctions,
  getFunctionById,
  updateFunction,
  deleteFunction,
  downloadTemplate,
  uploadFunctions,
  createFunctionValidation,
  updateFunctionValidation
};
