const { body, param, query, validationResult } = require('express-validator');
const departmentService = require('../services/departmentService');
const logger = require('../config/logger');

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
    .isUUID().withMessage('Division ID must be a valid UUID')
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
    const result = await departmentService.createDepartment(departmentData);

    if (!result.success) {
      return res.status(400).json({
        error: 'Department creation failed',
        message: result.errorMessage
      });
    }

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      department: result.department
    });

  } catch (error) {
    logger.error('Create department controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while creating department'
    });
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

    let departments;
    if (divisionId) {
      departments = await departmentService.getDepartmentsByDivision(divisionId);
    } else {
      departments = await departmentService.getDepartments();
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

    const result = await departmentService.updateDepartment(departmentId, updates);

    if (!result.success) {
      return res.status(400).json({
        error: 'Department update failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Department updated successfully',
      department: result.department
    });

  } catch (error) {
    logger.error('Update department controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while updating department'
    });
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
    const result = await departmentService.deleteDepartment(departmentId);

    if (!result.success) {
      return res.status(400).json({
        error: 'Department deletion failed',
        message: result.errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Department deleted successfully'
    });

  } catch (error) {
    logger.error('Delete department controller error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while deleting department'
    });
  }
}

module.exports = {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  createDepartmentValidation,
  updateDepartmentValidation
};

