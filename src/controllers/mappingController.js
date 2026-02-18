const { body, param, query, validationResult } = require('express-validator');
const mappingService = require('../services/mappingService');
const bulkImportService = require('../services/bulkImportService');
const logger = require('../config/logger');

/**
 * Validation rules for creating Function-Application mapping
 */
const createFunctionAppMappingValidation = [
  body('functionId')
    .notEmpty().withMessage('Function ID is required')
    .isInt().withMessage('Function ID must be an integer'),
  body('applicationId')
    .optional()
    .isInt().withMessage('Application ID must be an integer'),
  body('applicationIds')
    .optional()
    .isArray().withMessage('Application IDs must be an array')
];

/**
 * Validation rules for creating Application-Department mapping
 */
const createAppDeptMappingValidation = [
  body('departmentId')
    .notEmpty().withMessage('Department ID is required')
    .isInt().withMessage('Department ID must be an integer'),
  body('applicationId')
    .optional()
    .isInt().withMessage('Application ID must be an integer'),
  body('applicationIds')
    .optional()
    .isArray().withMessage('Application IDs must be an array')
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

    let result;
    if (applicationIds && applicationIds.length > 0) {
      // Multiple mappings
      result = await mappingService.createMultipleFunctionAppMappings(
        functionId,
        applicationIds,
        createdBy
      );
    } else if (applicationId) {
      // Single mapping
      result = await mappingService.createFunctionAppMapping(
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

    if (!result.success) {
      return res.status(400).json({
        error: 'Mapping creation failed',
        message: result.errorMessage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Function-Application mapping created successfully',
      mapping: result.mapping,
      mappings: result.mappings
    });

  } catch (error) {
    logger.error('Create Function-Application mapping controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while creating mapping'
    });
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
    const functionId = parseInt(req.params.functionId);
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
    const applicationId = parseInt(req.params.applicationId);
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
    const mappingId = parseInt(req.params.id);
    const result = await mappingService.deleteFunctionAppMapping(mappingId);

    if (!result.success) {
      return res.status(400).json({
        error: 'Mapping deletion failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Function-Application mapping deleted successfully'
    });

  } catch (error) {
    logger.error('Delete Function-Application mapping controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while deleting mapping'
    });
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

    let result;
    if (applicationIds && applicationIds.length > 0) {
      // Multiple mappings
      result = await mappingService.createMultipleAppDeptMappings(
        departmentId,
        applicationIds,
        createdBy
      );
    } else if (applicationId) {
      // Single mapping
      result = await mappingService.createAppDeptMapping(
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

    if (!result.success) {
      return res.status(400).json({
        error: 'Mapping creation failed',
        message: result.errorMessage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Application-Department mapping created successfully',
      mapping: result.mapping,
      mappings: result.mappings
    });

  } catch (error) {
    logger.error('Create Application-Department mapping controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while creating mapping'
    });
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
    const departmentId = parseInt(req.params.departmentId);
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
    const applicationId = parseInt(req.params.applicationId);
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
    const mappingId = parseInt(req.params.id);
    const result = await mappingService.deleteAppDeptMapping(mappingId);

    if (!result.success) {
      return res.status(400).json({
        error: 'Mapping deletion failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Application-Department mapping deleted successfully'
    });

  } catch (error) {
    logger.error('Delete Application-Department mapping controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while deleting mapping'
    });
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
  createFunctionAppMappingValidation,
  createAppDeptMappingValidation
};
