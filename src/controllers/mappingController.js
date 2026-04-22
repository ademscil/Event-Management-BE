const { body, param, query, validationResult } = require('express-validator');
const mappingService = require('../services/mappingService');
const bulkImportService = require('../services/bulkImportService');
const logger = require('../config/logger');

function handleMappingError(res, error, fallbackMessage) {
  const message = error?.message || fallbackMessage;
  const statusCode = error?.statusCode;

  if (statusCode && statusCode < 500) {
    return res.status(statusCode).json({
      error: error.name || 'Request failed',
      message
    });
  }

  if (
    /required|already exists|not found|must be provided|invalid|inactive/i.test(message)
  ) {
    return res.status(400).json({
      error: error?.name || 'Validation failed',
      message
    });
  }

  logger.error(fallbackMessage, error);
  return res.status(500).json({
    error: 'Internal server error',
    message: fallbackMessage
  });
}

/**
 * Validation rules for creating Function-Application mapping
 */
const createFunctionAppMappingValidation = [
  body('functionId')
    .notEmpty().withMessage('Function ID is required')
    .isUUID().withMessage('Function ID must be a valid UUID'),
  body('applicationId')
    .optional()
    .isUUID().withMessage('Application ID must be a valid UUID'),
  body('applicationIds')
    .optional()
    .isArray().withMessage('Application IDs must be an array'),
  body('applicationIds.*')
    .optional()
    .isUUID().withMessage('Application IDs must contain valid UUID values')
];

/**
 * Validation rules for creating Application-Department mapping
 */
const createAppDeptMappingValidation = [
  body('departmentId')
    .notEmpty().withMessage('Department ID is required')
    .isUUID().withMessage('Department ID must be a valid UUID'),
  body('applicationId')
    .optional()
    .isUUID().withMessage('Application ID must be a valid UUID'),
  body('applicationIds')
    .optional()
    .isArray().withMessage('Application IDs must be an array'),
  body('applicationIds.*')
    .optional()
    .isUUID().withMessage('Application IDs must contain valid UUID values')
];

/**
 * Create Function-Application mapping (single or multiple)
 * POST /api/v1/mappings/function-application
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createFunctionAppMapping(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { functionId, applicationId, applicationIds } = req.body;
    const createdBy = req.user?.userId;

    let mapping;
    let mappings;
    if (applicationIds && applicationIds.length > 0) {
      // Multiple mappings
      const result = await mappingService.createMultipleFunctionAppMappings(
        functionId,
        applicationIds,
        createdBy
      );
      mappings = result.created;
    } else if (applicationId) {
      // Single mapping
      mapping = await mappingService.createFunctionAppMapping(
        functionId,
        applicationId,
        createdBy
      );
    } else {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Either applicationId or applicationIds must be provided'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Function-Application mapping created successfully',
      mapping,
      mappings
    });

  } catch (error) {
    return handleMappingError(res, error, 'An error occurred while creating mapping');
  }
}

/**
 * Get all Function-Application mappings
 * GET /api/v1/mappings/function-application
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getFunctionAppMappings(req, res) {
  try {
    const { detailed } = req.query;

    let mappings;
    if (detailed === 'true') {
      mappings = await mappingService.getFunctionAppMappingsWithDetails();
    } else {
      mappings = await mappingService.getFunctionAppMappings();
    }

    res.json({
      success: true,
      mappings
    });

  } catch (error) {
    logger.error('Get Function-Application mappings controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching mappings'
    });
  }
}

/**
 * Get applications by function
 * GET /api/v1/mappings/function-application/function/:functionId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getApplicationsByFunction(req, res) {
  try {
    const functionId = req.params.functionId;
    const applications = await mappingService.getApplicationsByFunction(functionId);

    res.json({
      success: true,
      applications
    });

  } catch (error) {
    logger.error('Get applications by function controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching applications'
    });
  }
}

/**
 * Get functions by application
 * GET /api/v1/mappings/function-application/application/:applicationId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getFunctionsByApplication(req, res) {
  try {
    const applicationId = req.params.applicationId;
    const functions = await mappingService.getFunctionsByApplication(applicationId);

    res.json({
      success: true,
      functions
    });

  } catch (error) {
    logger.error('Get functions by application controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching functions'
    });
  }
}

/**
 * Delete Function-Application mapping
 * DELETE /api/v1/mappings/function-application/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteFunctionAppMapping(req, res) {
  try {
    const mappingId = req.params.id;
    await mappingService.deleteFunctionAppMapping(mappingId);

    res.json({
      success: true,
      message: 'Function-Application mapping deleted successfully'
    });

  } catch (error) {
    return handleMappingError(res, error, 'An error occurred while deleting mapping');
  }
}

/**
 * Export Function-Application mappings to CSV
 * GET /api/v1/mappings/function-application/export/csv
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function exportFunctionAppMappingsToCSV(req, res) {
  try {
    const csv = await mappingService.exportFunctionAppMappingsToCSV();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=function-application-mappings.csv');
    res.send(csv);

  } catch (error) {
    logger.error('Export Function-Application mappings controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while exporting mappings'
    });
  }
}

/**
 * Create Application-Department mapping (single or multiple)
 * POST /api/v1/mappings/application-department
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createAppDeptMapping(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { departmentId, applicationId, applicationIds } = req.body;
    const createdBy = req.user?.userId;

    let mapping;
    let mappings;
    if (applicationIds && applicationIds.length > 0) {
      // Multiple mappings
      const result = await mappingService.createMultipleAppDeptMappings(
        departmentId,
        applicationIds,
        createdBy
      );
      mappings = result.created;
    } else if (applicationId) {
      // Single mapping
      mapping = await mappingService.createAppDeptMapping(
        applicationId,
        departmentId,
        createdBy
      );
    } else {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Either applicationId or applicationIds must be provided'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Application-Department mapping created successfully',
      mapping,
      mappings
    });

  } catch (error) {
    return handleMappingError(res, error, 'An error occurred while creating mapping');
  }
}

/**
 * Get all Application-Department mappings
 * GET /api/v1/mappings/application-department
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getAppDeptMappings(req, res) {
  try {
    const { hierarchical } = req.query;

    let mappings;
    if (hierarchical === 'true') {
      mappings = await mappingService.getAppDeptMappingsHierarchical();
    } else {
      mappings = await mappingService.getAppDeptMappings();
    }

    res.json({
      success: true,
      mappings
    });

  } catch (error) {
    logger.error('Get Application-Department mappings controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching mappings'
    });
  }
}

/**
 * Get applications by department
 * GET /api/v1/mappings/application-department/department/:departmentId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getApplicationsByDepartment(req, res) {
  try {
    const departmentId = req.params.departmentId;
    const applications = await mappingService.getApplicationsByDepartment(departmentId);

    res.json({
      success: true,
      applications
    });

  } catch (error) {
    logger.error('Get applications by department controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching applications'
    });
  }
}

/**
 * Get departments by application
 * GET /api/v1/mappings/application-department/application/:applicationId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getDepartmentsByApplication(req, res) {
  try {
    const applicationId = req.params.applicationId;
    const departments = await mappingService.getDepartmentsByApplication(applicationId);

    res.json({
      success: true,
      departments
    });

  } catch (error) {
    logger.error('Get departments by application controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching departments'
    });
  }
}

/**
 * Delete Application-Department mapping
 * DELETE /api/v1/mappings/application-department/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteAppDeptMapping(req, res) {
  try {
    const mappingId = req.params.id;
    await mappingService.deleteAppDeptMapping(mappingId);

    res.json({
      success: true,
      message: 'Application-Department mapping deleted successfully'
    });

  } catch (error) {
    return handleMappingError(res, error, 'An error occurred while deleting mapping');
  }
}

/**
 * Export Application-Department mappings to CSV
 * GET /api/v1/mappings/application-department/export/csv
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function exportAppDeptMappingsToCSV(req, res) {
  try {
    const csv = await mappingService.exportAppDeptMappingsToCSV();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=application-department-mappings.csv');
    res.send(csv);

  } catch (error) {
    logger.error('Export Application-Department mappings controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while exporting mappings'
    });
  }
}

/**
 * Download Function-Application mapping Excel template
 * GET /api/v1/mappings/function-app/template
 */
async function downloadFunctionAppTemplate(req, res) {
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CSI Portal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Function-App Mapping');

    sheet.columns = [
      { header: 'Function Code', key: 'functionCode', width: 20 },
      { header: 'Application Code', key: 'applicationCode', width: 20 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;

    // Add example rows
    sheet.addRow({ functionCode: '101', applicationCode: '201' });
    sheet.addRow({ functionCode: '102', applicationCode: '202' });

    // Add instruction sheet
    const infoSheet = workbook.addWorksheet('Petunjuk');
    infoSheet.getCell('A1').value = 'Petunjuk Pengisian Template Mapping Function - Aplikasi';
    infoSheet.getCell('A1').font = { bold: true, size: 13 };
    infoSheet.getCell('A3').value = 'Kolom yang wajib diisi:';
    infoSheet.getCell('A3').font = { bold: true };
    infoSheet.getCell('A4').value = '1. Function Code  : Kode numerik Function (lihat Master Function)';
    infoSheet.getCell('A5').value = '2. Application Code: Kode numerik Aplikasi (lihat Master Aplikasi)';
    infoSheet.getCell('A7').value = 'Catatan:';
    infoSheet.getCell('A7').font = { bold: true };
    infoSheet.getCell('A8').value = '- Baris pertama adalah header, jangan diubah.';
    infoSheet.getCell('A9').value = '- Satu baris = satu pasangan mapping Function → Aplikasi.';
    infoSheet.getCell('A10').value = '- Duplikat akan dilewati secara otomatis.';
    infoSheet.getColumn('A').width = 60;

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=template-mapping-function-aplikasi.xlsx');
    res.send(Buffer.from(buffer));
  } catch (error) {
    logger.error('Download function-app template error:', error);
    res.status(500).json({ error: 'Internal server error', message: 'Gagal mengunduh template' });
  }
}

/**
 * Download Application-Department mapping Excel template
 * GET /api/v1/mappings/app-dept/template
 */
async function downloadAppDeptTemplate(req, res) {
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CSI Portal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Dept-App Mapping');

    sheet.columns = [
      { header: 'Application Code', key: 'applicationCode', width: 20 },
      { header: 'Department Code', key: 'departmentCode', width: 20 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;

    // Add example rows
    sheet.addRow({ applicationCode: '201', departmentCode: '301' });
    sheet.addRow({ applicationCode: '202', departmentCode: '302' });

    // Add instruction sheet
    const infoSheet = workbook.addWorksheet('Petunjuk');
    infoSheet.getCell('A1').value = 'Petunjuk Pengisian Template Mapping Department - Aplikasi';
    infoSheet.getCell('A1').font = { bold: true, size: 13 };
    infoSheet.getCell('A3').value = 'Kolom yang wajib diisi:';
    infoSheet.getCell('A3').font = { bold: true };
    infoSheet.getCell('A4').value = '1. Application Code: Kode numerik Aplikasi (lihat Master Aplikasi)';
    infoSheet.getCell('A5').value = '2. Department Code : Kode numerik Department (lihat Master Department)';
    infoSheet.getCell('A7').value = 'Catatan:';
    infoSheet.getCell('A7').font = { bold: true };
    infoSheet.getCell('A8').value = '- Baris pertama adalah header, jangan diubah.';
    infoSheet.getCell('A9').value = '- Satu baris = satu pasangan mapping Aplikasi → Department.';
    infoSheet.getCell('A10').value = '- Duplikat akan dilewati secara otomatis.';
    infoSheet.getColumn('A').width = 60;

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=template-mapping-dept-aplikasi.xlsx');
    res.send(Buffer.from(buffer));
  } catch (error) {
    logger.error('Download app-dept template error:', error);
    res.status(500).json({ error: 'Internal server error', message: 'Gagal mengunduh template' });
  }
}

/**
 * Bulk import mappings from file
 * POST /api/v1/mappings/bulk-import
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function bulkImportMappings(req, res) {
  try {
    const { mappingType } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'File is required'
      });
    }

    if (!mappingType || !['function-application', 'application-department'].includes(mappingType)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid mapping type. Must be "function-application" or "application-department"'
      });
    }

    const result = await bulkImportService.importMappings(
      req.file.buffer,
      mappingType,
      req.user?.userId
    );

    if (!result.success) {
      return res.status(400).json({
        error: 'Bulk import failed',
        message: result.errorMessage,
        errors: result.errors
      });
    }

    res.json({
      success: true,
      message: 'Bulk import completed successfully',
      imported: result.imported,
      failed: result.failed,
      errors: result.errors
    });

  } catch (error) {
    logger.error('Bulk import mappings controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during bulk import'
    });
  }
}

module.exports = {
  createFunctionAppMapping,
  getFunctionAppMappings,
  getApplicationsByFunction,
  getFunctionsByApplication,
  deleteFunctionAppMapping,
  exportFunctionAppMappingsToCSV,
  createAppDeptMapping,
  getAppDeptMappings,
  getApplicationsByDepartment,
  getDepartmentsByApplication,
  deleteAppDeptMapping,
  exportAppDeptMappingsToCSV,
  bulkImportMappings,
  downloadFunctionAppTemplate,
  downloadAppDeptTemplate,
  createFunctionAppMappingValidation,
  createAppDeptMappingValidation
};
