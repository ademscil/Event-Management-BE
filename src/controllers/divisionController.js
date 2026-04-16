const { body, param, query, validationResult } = require('express-validator');
const divisionService = require('../services/divisionService');
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
 * Validation rules for creating a division
 */
const createDivisionValidation = [
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required')
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('businessUnitId')
    .notEmpty().withMessage('Business Unit ID is required')
    .isUUID().withMessage('Business Unit ID must be a valid UUID')
];

/**
 * Validation rules for updating a division
 */
const updateDivisionValidation = [
  param('id').isUUID().withMessage('Division ID must be a valid UUID'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('businessUnitId')
    .optional()
    .isUUID().withMessage('Business Unit ID must be a valid UUID'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be boolean')
];

/**
 * Create a new division
 * POST /api/v1/divisions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createDivision(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const divisionData = req.body;
    const division = await divisionService.createDivision(divisionData);

    res.status(201).json({
      success: true,
      message: 'Division created successfully',
      division
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while creating division');
  }
}

/**
 * Get all divisions or divisions by business unit
 * GET /api/v1/divisions?businessUnitId=1
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getDivisions(req, res) {
  try {
    const { businessUnitId } = req.query;
    const includeInactive = req.query.includeInactive === 'true';

    let divisions;
    if (businessUnitId) {
      divisions = await divisionService.getDivisionsByBusinessUnit(businessUnitId, { includeInactive });
    } else {
      divisions = await divisionService.getDivisions({ includeInactive });
    }

    res.json({
      success: true,
      divisions
    });

  } catch (error) {
    logger.error('Get divisions controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching divisions'
    });
  }
}

/**
 * Get division by ID
 * GET /api/v1/divisions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getDivisionById(req, res) {
  try {
    const divisionId = req.params.id;
    const division = await divisionService.getDivisionById(divisionId);

    if (!division) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Division not found'
      });
    }

    res.json({
      success: true,
      division
    });

  } catch (error) {
    logger.error('Get division by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching division'
    });
  }
}

/**
 * Update division
 * PUT /api/v1/divisions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateDivision(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const divisionId = req.params.id;
    const updates = req.body;

    const division = await divisionService.updateDivision(divisionId, updates);

    res.json({
      success: true,
      message: 'Division updated successfully',
      division
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while updating division');
  }
}

/**
 * Delete division
 * DELETE /api/v1/divisions/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteDivision(req, res) {
  try {
    const divisionId = req.params.id;
    await divisionService.deleteDivision(divisionId);

    res.json({
      success: true,
      message: 'Division deleted successfully'
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while deleting division');
  }
}

/**
 * Download Excel template for bulk upload
 * GET /api/v1/divisions/template
 */
async function downloadTemplate(req, res) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Divisions');

    sheet.columns = [
      { header: 'BU Name', key: 'buName', width: 30 },
      { header: 'Divisi Code', key: 'code', width: 20 },
      { header: 'Divisi Name', key: 'name', width: 40 },
      { header: 'Status', key: 'status', width: 15 },
    ];

    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    sheet.addRow({ buName: 'Corporate HO', code: 'ITD', name: 'IT Digital', status: 'Active' });
    sheet.addRow({ buName: 'Main Dealer Jakarta', code: 'FIN', name: 'Finance', status: 'Active' });

    sheet.addRow([]);
    const noteRow = sheet.addRow(['Catatan: BU Name harus sesuai dengan data BU yang ada. Kolom Status diisi Active atau Inactive.']);
    noteRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="master-divisi-template.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Download Division template error:', error);
    res.status(500).json({ success: false, message: 'Gagal generate template' });
  }
}

/**
 * Upload bulk divisions from Excel
 * POST /api/v1/divisions/upload
 */
async function uploadDivisions(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'File tidak ditemukan' });
    }

    // Map BU Name -> BU Code for the import
    // The bulkImportService expects 'Business Unit Code' column, but our template uses 'BU Name'
    // We handle this by pre-processing the Excel to resolve BU Name -> Code
    const ExcelJSLib = require('exceljs');
    const workbook = new ExcelJSLib.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];

    // Get header row
    const headerRow = sheet.getRow(1);
    const headers = [];
    headerRow.eachCell((cell) => headers.push(String(cell.value || '').trim()));

    const buNameIdx = headers.indexOf('BU Name');
    const codeIdx = headers.indexOf('Divisi Code');
    const nameIdx = headers.indexOf('Divisi Name');
    const statusIdx = headers.indexOf('Status');

    if (buNameIdx === -1 || codeIdx === -1 || nameIdx === -1) {
      return res.status(400).json({
        success: false,
        message: 'Format file tidak valid. Kolom yang diperlukan: BU Name, Divisi Code, Divisi Name, Status'
      });
    }

    // Lookup BU by Name
    const sql = require('../database/sql-client');
    const db = require('../database/connection');
    const pool = await db.getPool();
    const buResult = await pool.request().query('SELECT BusinessUnitId, Name, Code FROM BusinessUnits WHERE IsActive = 1');
    const buByName = new Map(buResult.recordset.map(b => [b.Name.toLowerCase().trim(), b]));

    // Build new workbook with 'Business Unit Code' column for bulkImportService
    const newWorkbook = new ExcelJSLib.Workbook();
    const newSheet = newWorkbook.addWorksheet('Divisions');
    newSheet.addRow(['Code', 'Name', 'Business Unit Code']);

    let validRows = 0;
    const errors = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const buName = String(row.getCell(buNameIdx + 1).value || '').trim();
      const code = String(row.getCell(codeIdx + 1).value || '').trim();
      const name = String(row.getCell(nameIdx + 1).value || '').trim();
      if (!buName && !code && !name) return; // skip empty rows

      const bu = buByName.get(buName.toLowerCase());
      if (!bu) {
        errors.push({ row: rowNumber, data: { buName, code, name }, errors: [`BU Name '${buName}' tidak ditemukan`] });
        return;
      }
      newSheet.addRow([code, name, bu.Code]);
      validRows++;
    });

    if (validRows === 0 && errors.length > 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data valid untuk diimport', errors });
    }

    const buffer = await newWorkbook.xlsx.writeBuffer();
    const { BulkImportService } = require('../services/bulkImportService');
    const importSvc = new BulkImportService();
    const result = await importSvc.importData(buffer, 'Division', { skipDuplicates: true, updateExisting: true });

    const allErrors = [...errors, ...(result.errors || [])];

    return res.json({
      success: true,
      message: `Import selesai. Berhasil: ${result.imported + result.updated}, Gagal: ${result.failed + errors.length}`,
      imported: result.imported,
      updated: result.updated,
      failed: result.failed + errors.length,
      errors: allErrors,
    });
  } catch (error) {
    logger.error('Upload Division error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Gagal upload data Divisi',
      errors: error.errors || [],
    });
  }
}

module.exports = {
  createDivision,
  getDivisions,
  getDivisionById,
  updateDivision,
  deleteDivision,
  downloadTemplate,
  uploadDivisions,
  createDivisionValidation,
  updateDivisionValidation
};

