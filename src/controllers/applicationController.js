const { body, param, validationResult } = require('express-validator');
const applicationService = require('../services/applicationService');
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
 * Validation rules for creating an application
 */
const createApplicationValidation = [
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required')
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be boolean')
];

/**
 * Validation rules for updating an application
 */
const updateApplicationValidation = [
  param('id').isUUID().withMessage('Application ID must be a valid UUID'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters')
];

/**
 * Create a new application
 * POST /api/v1/applications
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createApplication(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const applicationData = req.body;
    const application = await applicationService.createApplication(applicationData);

    res.status(201).json({
      success: true,
      message: 'Application created successfully',
      application
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while creating application');
  }
}

/**
 * Get all applications
 * GET /api/v1/applications
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getApplications(req, res) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const applications = await applicationService.getApplications({ includeInactive });

    res.json({
      success: true,
      applications
    });

  } catch (error) {
    logger.error('Get applications controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching applications'
    });
  }
}

/**
 * Get application by ID
 * GET /api/v1/applications/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getApplicationById(req, res) {
  try {
    const applicationId = req.params.id;
    const application = await applicationService.getApplicationById(applicationId);

    if (!application) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Application not found'
      });
    }

    res.json({
      success: true,
      application
    });

  } catch (error) {
    logger.error('Get application by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching application'
    });
  }
}

/**
 * Update application
 * PUT /api/v1/applications/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateApplication(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const applicationId = req.params.id;
    const updates = req.body;

    const application = await applicationService.updateApplication(applicationId, updates);

    res.json({
      success: true,
      message: 'Application updated successfully',
      application
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while updating application');
  }
}

/**
 * Delete application
 * DELETE /api/v1/applications/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteApplication(req, res) {
  try {
    const applicationId = req.params.id;
    await applicationService.deleteApplication(applicationId);

    res.json({
      success: true,
      message: 'Application deleted successfully'
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while deleting application');
  }
}

/**
 * Download Excel template for bulk upload
 * GET /api/v1/applications/template
 */
async function downloadTemplate(req, res) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Applications');

    sheet.columns = [
      { header: 'App Code', key: 'code', width: 20 },
      { header: 'App Name', key: 'name', width: 40 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Status', key: 'status', width: 15 },
    ];

    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    sheet.addRow({ code: 'B2B', name: 'B2B Ordering', description: 'Business to Business ordering system', status: 'Active' });
    sheet.addRow({ code: 'ERP', name: 'ERP System', description: 'Enterprise Resource Planning', status: 'Active' });

    sheet.addRow([]);
    const noteRow = sheet.addRow(['Catatan: Kolom Status diisi Active atau Inactive. Description bersifat opsional.']);
    noteRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="master-aplikasi-template.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Download Application template error:', error);
    res.status(500).json({ success: false, message: 'Gagal generate template' });
  }
}

/**
 * Upload bulk applications from Excel
 * POST /api/v1/applications/upload
 */
async function uploadApplications(req, res) {
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

    const codeIdx = headers.indexOf('App Code');
    const nameIdx = headers.indexOf('App Name');
    const descIdx = headers.indexOf('Description');

    if (codeIdx === -1 || nameIdx === -1) {
      return res.status(400).json({
        success: false,
        message: 'Format file tidak valid. Kolom yang diperlukan: App Code, App Name, Description, Status'
      });
    }

    // Build new workbook with expected column names for bulkImportService
    const newWorkbook = new ExcelJSLib.Workbook();
    const newSheet = newWorkbook.addWorksheet('Applications');
    newSheet.addRow(['Code', 'Name', 'Description']);

    let validRows = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const code = String(row.getCell(codeIdx + 1).value || '').trim();
      const name = String(row.getCell(nameIdx + 1).value || '').trim();
      const desc = descIdx !== -1 ? String(row.getCell(descIdx + 1).value || '').trim() : '';
      if (!code && !name) return;
      newSheet.addRow([code, name, desc || null]);
      validRows++;
    });

    if (validRows === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data valid untuk diimport' });
    }

    const buffer = await newWorkbook.xlsx.writeBuffer();
    const { BulkImportService } = require('../services/bulkImportService');
    const importSvc = new BulkImportService();
    const result = await importSvc.importData(buffer, 'Application', { skipDuplicates: true, updateExisting: true });

    return res.json({
      success: true,
      message: `Import selesai. Berhasil: ${result.imported + result.updated}, Gagal: ${result.failed}`,
      imported: result.imported,
      updated: result.updated,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    logger.error('Upload Application error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Gagal upload data Aplikasi',
      errors: error.errors || [],
    });
  }
}

module.exports = {
  createApplication,
  getApplications,
  getApplicationById,
  updateApplication,
  deleteApplication,
  downloadTemplate,
  uploadApplications,
  createApplicationValidation,
  updateApplicationValidation
};
