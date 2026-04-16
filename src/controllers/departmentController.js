const { body, param, query, validationResult } = require('express-validator');
const departmentService = require('../services/departmentService');
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
 * Validation rules for creating a department
 */
const createDepartmentValidation = [
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required')
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('divisionId')
    .notEmpty().withMessage('Division ID is required')
    .isUUID().withMessage('Division ID must be a valid UUID')
];

/**
 * Validation rules for updating a department
 */
const updateDepartmentValidation = [
  param('id').isUUID().withMessage('Department ID must be a valid UUID'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be between 2 and 20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be between 1 and 200 characters'),
  body('divisionId')
    .optional()
    .isUUID().withMessage('Division ID must be a valid UUID'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be boolean')
];

/**
 * Create a new department
 * POST /api/v1/departments
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createDepartment(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const departmentData = req.body;
    const department = await departmentService.createDepartment(departmentData);

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      department
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while creating department');
  }
}

/**
 * Get all departments or departments by division
 * GET /api/v1/departments?divisionId=1
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getDepartments(req, res) {
  try {
    const { divisionId } = req.query;
    const includeInactive = req.query.includeInactive === 'true';

    let departments;
    if (divisionId) {
      departments = await departmentService.getDepartmentsByDivision(divisionId, { includeInactive });
    } else {
      departments = await departmentService.getDepartments({ includeInactive });
    }

    res.json({
      success: true,
      departments
    });

  } catch (error) {
    logger.error('Get departments controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching departments'
    });
  }
}

/**
 * Get department by ID
 * GET /api/v1/departments/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getDepartmentById(req, res) {
  try {
    const departmentId = req.params.id;
    const department = await departmentService.getDepartmentById(departmentId);

    if (!department) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Department not found'
      });
    }

    res.json({
      success: true,
      department
    });

  } catch (error) {
    logger.error('Get department by ID controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching department'
    });
  }
}

/**
 * Update department
 * PUT /api/v1/departments/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateDepartment(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const departmentId = req.params.id;
    const updates = req.body;

    const department = await departmentService.updateDepartment(departmentId, updates);

    res.json({
      success: true,
      message: 'Department updated successfully',
      department
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while updating department');
  }
}

/**
 * Delete department
 * DELETE /api/v1/departments/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteDepartment(req, res) {
  try {
    const departmentId = req.params.id;
    await departmentService.deleteDepartment(departmentId);

    res.json({
      success: true,
      message: 'Department deleted successfully'
    });

  } catch (error) {
    return handleServiceError(res, error, 'An error occurred while deleting department');
  }
}

/**
 * Download Excel template for bulk upload
 * GET /api/v1/departments/template
 */
async function downloadTemplate(req, res) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Departments');

    sheet.columns = [
      { header: 'Divisi Code', key: 'divisiCode', width: 20 },
      { header: 'Department Code', key: 'code', width: 20 },
      { header: 'Department Name', key: 'name', width: 40 },
      { header: 'Status', key: 'status', width: 15 },
    ];

    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    sheet.addRow({ divisiCode: 'ITD', code: 'ITD-01', name: 'IT Digital Development', status: 'Active' });
    sheet.addRow({ divisiCode: 'FIN', code: 'FIN-01', name: 'Finance Operations', status: 'Active' });

    sheet.addRow([]);
    const noteRow = sheet.addRow(['Catatan: Divisi Code harus sesuai dengan data Divisi yang ada. Kolom Status diisi Active atau Inactive.']);
    noteRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="master-department-template.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Download Department template error:', error);
    res.status(500).json({ success: false, message: 'Gagal generate template' });
  }
}

/**
 * Upload bulk departments from Excel
 * POST /api/v1/departments/upload
 */
async function uploadDepartments(req, res) {
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

    const divCodeIdx = headers.indexOf('Divisi Code');
    const codeIdx = headers.indexOf('Department Code');
    const nameIdx = headers.indexOf('Department Name');

    if (divCodeIdx === -1 || codeIdx === -1 || nameIdx === -1) {
      return res.status(400).json({
        success: false,
        message: 'Format file tidak valid. Kolom yang diperlukan: Divisi Code, Department Code, Department Name, Status'
      });
    }

    // Build new workbook with 'Division Code' column for bulkImportService
    const newWorkbook = new ExcelJSLib.Workbook();
    const newSheet = newWorkbook.addWorksheet('Departments');
    newSheet.addRow(['Code', 'Name', 'Division Code']);

    let validRows = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const divCode = String(row.getCell(divCodeIdx + 1).value || '').trim();
      const code = String(row.getCell(codeIdx + 1).value || '').trim();
      const name = String(row.getCell(nameIdx + 1).value || '').trim();
      if (!divCode && !code && !name) return;
      newSheet.addRow([code, name, divCode]);
      validRows++;
    });

    if (validRows === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data valid untuk diimport' });
    }

    const buffer = await newWorkbook.xlsx.writeBuffer();
    const { BulkImportService } = require('../services/bulkImportService');
    const importSvc = new BulkImportService();
    const result = await importSvc.importData(buffer, 'Department', { skipDuplicates: true, updateExisting: true });

    return res.json({
      success: true,
      message: `Import selesai. Berhasil: ${result.imported + result.updated}, Gagal: ${result.failed}`,
      imported: result.imported,
      updated: result.updated,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    logger.error('Upload Department error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Gagal upload data Department',
      errors: error.errors || [],
    });
  }
}

module.exports = {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  downloadTemplate,
  uploadDepartments,
  createDepartmentValidation,
  updateDepartmentValidation
};

