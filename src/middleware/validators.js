const { body, param, query, validationResult } = require('express-validator');
const { ValidationError } = require('./errorHandler');

/**
 * Middleware to handle validation results
 * Should be used after validation chains
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));

    throw new ValidationError('Validation failed', formattedErrors);
  }
  
  next();
};

/**
 * Common validation rules
 */

// Email validation
const emailValidation = body('email')
  .trim()
  .notEmpty().withMessage('Email is required')
  .isEmail().withMessage('Invalid email format')
  .normalizeEmail();

// Password validation
const passwordValidation = body('password')
  .notEmpty().withMessage('Password is required')
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters');

// Username validation
const usernameValidation = body('username')
  .trim()
  .notEmpty().withMessage('Username is required')
  .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
  .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores');

// Display name validation
const displayNameValidation = body('displayName')
  .trim()
  .notEmpty().withMessage('Display name is required')
  .isLength({ min: 1, max: 200 }).withMessage('Display name must be 1-200 characters');

// Role validation
const roleValidation = body('role')
  .notEmpty().withMessage('Role is required')
  .isIn(['SuperAdmin', 'AdminEvent', 'ITLead', 'DepartmentHead'])
  .withMessage('Invalid role');

// Code validation (for BU, Division, Department, Function, Application)
const codeValidation = (fieldName = 'code') => 
  body(fieldName)
    .trim()
    .notEmpty().withMessage(`${fieldName} is required`)
    .isLength({ min: 2, max: 20 }).withMessage(`${fieldName} must be 2-20 characters`)
    .matches(/^[a-zA-Z0-9-]+$/).withMessage(`${fieldName} can only contain letters, numbers, and hyphens`);

// Name validation (for entities)
const nameValidation = (fieldName = 'name') =>
  body(fieldName)
    .trim()
    .notEmpty().withMessage(`${fieldName} is required`)
    .isLength({ min: 1, max: 200 }).withMessage(`${fieldName} must be 1-200 characters`);

// ID validation (UUID or integer)
const idValidation = (fieldName = 'id') =>
  param(fieldName)
    .notEmpty().withMessage(`${fieldName} is required`)
    .custom((value) => {
      // Check if it's a valid UUID or integer
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      const isInteger = /^\d+$/.test(value);
      
      if (!isUUID && !isInteger) {
        throw new Error(`${fieldName} must be a valid UUID or integer`);
      }
      
      return true;
    });

// Date validation
const dateValidation = (fieldName) =>
  body(fieldName)
    .notEmpty().withMessage(`${fieldName} is required`)
    .isISO8601().withMessage(`${fieldName} must be a valid date`)
    .toDate();

// Optional date validation
const optionalDateValidation = (fieldName) =>
  body(fieldName)
    .optional()
    .isISO8601().withMessage(`${fieldName} must be a valid date`)
    .toDate();

// Boolean validation
const booleanValidation = (fieldName) =>
  body(fieldName)
    .optional()
    .isBoolean().withMessage(`${fieldName} must be a boolean`);

// Pagination validation
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt()
];

/**
 * Authentication validators
 */
const validateLogin = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required'),
  body('password')
    .notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

const validateRefreshToken = [
  body('token')
    .notEmpty().withMessage('Token is required'),
  handleValidationErrors
];

/**
 * User validators
 */
const validateCreateUser = [
  usernameValidation,
  displayNameValidation,
  emailValidation,
  roleValidation,
  body('useLDAP')
    .optional()
    .isBoolean().withMessage('useLDAP must be a boolean'),
  body('password')
    .optional()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  handleValidationErrors
];

const validateUpdateUser = [
  idValidation('id'),
  body('displayName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Display name must be 1-200 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('role')
    .optional()
    .isIn(['SuperAdmin', 'AdminEvent', 'ITLead', 'DepartmentHead'])
    .withMessage('Invalid role'),
  body('useLDAP')
    .optional()
    .isBoolean().withMessage('useLDAP must be a boolean'),
  body('password')
    .optional()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  handleValidationErrors
];

/**
 * Business Unit validators
 */
const validateCreateBusinessUnit = [
  codeValidation('code'),
  nameValidation('name'),
  handleValidationErrors
];

const validateUpdateBusinessUnit = [
  idValidation('id'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be 2-20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be 1-200 characters'),
  handleValidationErrors
];

/**
 * Division validators
 */
const validateCreateDivision = [
  codeValidation('code'),
  nameValidation('name'),
  body('businessUnitId')
    .notEmpty().withMessage('Business Unit ID is required'),
  handleValidationErrors
];

const validateUpdateDivision = [
  idValidation('id'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be 2-20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be 1-200 characters'),
  body('businessUnitId')
    .optional()
    .notEmpty().withMessage('Business Unit ID cannot be empty'),
  handleValidationErrors
];

/**
 * Department validators
 */
const validateCreateDepartment = [
  codeValidation('code'),
  nameValidation('name'),
  body('divisionId')
    .notEmpty().withMessage('Division ID is required'),
  handleValidationErrors
];

const validateUpdateDepartment = [
  idValidation('id'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be 2-20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be 1-200 characters'),
  body('divisionId')
    .optional()
    .notEmpty().withMessage('Division ID cannot be empty'),
  handleValidationErrors
];

/**
 * Function validators
 */
const validateCreateFunction = [
  codeValidation('code'),
  nameValidation('name'),
  handleValidationErrors
];

const validateUpdateFunction = [
  idValidation('id'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be 2-20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be 1-200 characters'),
  handleValidationErrors
];

/**
 * Application validators
 */
const validateCreateApplication = [
  codeValidation('code'),
  nameValidation('name'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
  handleValidationErrors
];

const validateUpdateApplication = [
  idValidation('id'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Code must be 2-20 characters')
    .matches(/^[a-zA-Z0-9-]+$/).withMessage('Code can only contain letters, numbers, and hyphens'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Name must be 1-200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
  handleValidationErrors
];

/**
 * Mapping validators
 */
const validateCreateMapping = [
  body('functionId')
    .optional()
    .notEmpty().withMessage('Function ID is required'),
  body('applicationId')
    .optional()
    .notEmpty().withMessage('Application ID is required'),
  body('departmentId')
    .optional()
    .notEmpty().withMessage('Department ID is required'),
  handleValidationErrors
];

/**
 * Survey validators
 */
const validateCreateSurvey = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description must not exceed 1000 characters'),
  dateValidation('startDate'),
  dateValidation('endDate'),
  body('endDate')
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  body('assignedAdminId')
    .optional()
    .notEmpty().withMessage('Assigned Admin ID cannot be empty'),
  body('targetRespondents')
    .optional()
    .isInt({ min: 0 }).withMessage('Target respondents must be a non-negative integer'),
  body('targetScore')
    .optional()
    .isFloat({ min: 0, max: 10 }).withMessage('Target score must be between 0 and 10'),
  handleValidationErrors
];

const validateUpdateSurvey = [
  idValidation('id'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description must not exceed 1000 characters'),
  optionalDateValidation('startDate'),
  optionalDateValidation('endDate'),
  body('endDate')
    .optional()
    .custom((value, { req }) => {
      if (req.body.startDate && new Date(value) <= new Date(req.body.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  body('targetRespondents')
    .optional()
    .isInt({ min: 0 }).withMessage('Target respondents must be a non-negative integer'),
  body('targetScore')
    .optional()
    .isFloat({ min: 0, max: 10 }).withMessage('Target score must be between 0 and 10'),
  handleValidationErrors
];

/**
 * Question validators
 */
const validateCreateQuestion = [
  body('surveyId')
    .notEmpty().withMessage('Survey ID is required'),
  body('type')
    .notEmpty().withMessage('Question type is required')
    .isIn(['HeroCover', 'Text', 'MultipleChoice', 'Checkbox', 'Dropdown', 'MatrixLikert', 'Rating', 'Date', 'Signature'])
    .withMessage('Invalid question type'),
  body('promptText')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Prompt text must not exceed 500 characters'),
  body('subtitle')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Subtitle must not exceed 200 characters'),
  body('isMandatory')
    .optional()
    .isBoolean().withMessage('isMandatory must be a boolean'),
  body('displayOrder')
    .optional()
    .isInt({ min: 0 }).withMessage('Display order must be a non-negative integer'),
  body('pageNumber')
    .optional()
    .isInt({ min: 1 }).withMessage('Page number must be a positive integer'),
  handleValidationErrors
];

/**
 * Response validators
 */
const validateSubmitResponse = [
  body('surveyId')
    .notEmpty().withMessage('Survey ID is required'),
  body('respondent')
    .notEmpty().withMessage('Respondent information is required'),
  body('respondent.email')
    .trim()
    .notEmpty().withMessage('Respondent email is required')
    .isEmail().withMessage('Invalid email format'),
  body('respondent.name')
    .trim()
    .notEmpty().withMessage('Respondent name is required'),
  body('respondent.businessUnitId')
    .notEmpty().withMessage('Business Unit is required'),
  body('respondent.divisionId')
    .notEmpty().withMessage('Division is required'),
  body('respondent.departmentId')
    .notEmpty().withMessage('Department is required'),
  body('selectedApplicationIds')
    .isArray({ min: 1 }).withMessage('At least one application must be selected'),
  body('responses')
    .isArray().withMessage('Responses must be an array'),
  handleValidationErrors
];

/**
 * Approval validators
 */
const validateProposeTakeout = [
  body('responseId')
    .notEmpty().withMessage('Response ID is required'),
  body('questionId')
    .notEmpty().withMessage('Question ID is required'),
  body('reason')
    .trim()
    .notEmpty().withMessage('Reason is required')
    .isLength({ min: 10, max: 500 }).withMessage('Reason must be 10-500 characters'),
  handleValidationErrors
];

const validateApproveReject = [
  body('responseId')
    .notEmpty().withMessage('Response ID is required'),
  body('questionId')
    .notEmpty().withMessage('Question ID is required'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Reason must not exceed 500 characters'),
  handleValidationErrors
];

/**
 * Email validators
 */
const validateSendBlast = [
  body('surveyId')
    .notEmpty().withMessage('Survey ID is required'),
  body('subject')
    .trim()
    .notEmpty().withMessage('Subject is required')
    .isLength({ min: 1, max: 200 }).withMessage('Subject must be 1-200 characters'),
  body('bodyTemplate')
    .trim()
    .notEmpty().withMessage('Email body template is required'),
  handleValidationErrors
];

const validateScheduleOperation = [
  body('surveyId')
    .notEmpty().withMessage('Survey ID is required'),
  body('operationType')
    .notEmpty().withMessage('Operation type is required')
    .isIn(['Blast', 'Reminder']).withMessage('Invalid operation type'),
  body('frequency')
    .notEmpty().withMessage('Frequency is required')
    .isIn(['once', 'daily', 'weekly', 'monthly']).withMessage('Invalid frequency'),
  dateValidation('scheduledDate'),
  body('scheduledTime')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format (HH:MM)'),
  body('dayOfWeek')
    .optional()
    .isInt({ min: 0, max: 6 }).withMessage('Day of week must be 0-6'),
  handleValidationErrors
];

/**
 * Report validators
 */
const validateGenerateReport = [
  body('surveyId')
    .notEmpty().withMessage('Survey ID is required'),
  body('includeTakenOut')
    .optional()
    .isBoolean().withMessage('includeTakenOut must be a boolean'),
  handleValidationErrors
];

module.exports = {
  // Middleware
  handleValidationErrors,
  
  // Common validations
  emailValidation,
  passwordValidation,
  usernameValidation,
  displayNameValidation,
  roleValidation,
  codeValidation,
  nameValidation,
  idValidation,
  dateValidation,
  optionalDateValidation,
  booleanValidation,
  paginationValidation,
  
  // Authentication
  validateLogin,
  validateRefreshToken,
  
  // Users
  validateCreateUser,
  validateUpdateUser,
  
  // Business Units
  validateCreateBusinessUnit,
  validateUpdateBusinessUnit,
  
  // Divisions
  validateCreateDivision,
  validateUpdateDivision,
  
  // Departments
  validateCreateDepartment,
  validateUpdateDepartment,
  
  // Functions
  validateCreateFunction,
  validateUpdateFunction,
  
  // Applications
  validateCreateApplication,
  validateUpdateApplication,
  
  // Mappings
  validateCreateMapping,
  
  // Surveys
  validateCreateSurvey,
  validateUpdateSurvey,
  
  // Questions
  validateCreateQuestion,
  
  // Responses
  validateSubmitResponse,
  
  // Approvals
  validateProposeTakeout,
  validateApproveReject,
  
  // Email
  validateSendBlast,
  validateScheduleOperation,
  
  // Reports
  validateGenerateReport
};
