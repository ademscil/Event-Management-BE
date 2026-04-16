const sql = require('../database/sql-client');

  
const BaseRepository = require('./baseRepository');
const db = require('../database/connection');
const logger = require('../config/logger');
const config = require('../config');
const crypto = require('crypto');
const fs = require('fs').promises;
const publishCycleService = require('./publishCycleService');
const { ValidationError, ConflictError, NotFoundError } = require('./survey-service/errors');
const {
  calculateNextExecution,
  normalizeDateValue,
  normalizeScheduledTime,
  resolveInitialExecution,
  resolveUpdatedSchedule,
  toSqlTimeValue,
  validateDates,
  validatePublishWindow,
  validateStatus
} = require('./survey-service/scheduling');
const {
  normalizeAssignedAdminIds,
  syncSurveyAdminAssignments,
  validateAssignedAdmins
} = require('./survey-service/admin-assignment');
const {
  cancelScheduledOperation,
  getScheduledOperations,
  scheduleOperation
} = require('./survey-service/scheduled-operations');
const {
  createSurveyCore,
  loadExistingSurveyForSave,
  syncSurveyConfiguration,
  syncSurveyQuestions,
  updateSurveyCore
} = require('./survey-service/save-survey');
const {
  createSurvey: createSurveyHelper,
  deleteSurvey: deleteSurveyHelper,
  updateSurvey: updateSurveyHelper
} = require('./survey-service/survey-crud');
const {
  addQuestion: addQuestionHelper,
  deleteQuestion: deleteQuestionHelper,
  getQuestionsBySurvey: getQuestionsBySurveyHelper,
  reorderQuestions: reorderQuestionsHelper,
  updateQuestion: updateQuestionHelper
} = require('./survey-service/questions');
const {
  generatePreviewStyles,
  generateSurveyPreview
} = require('./survey-service/preview');
const {
  generateEmbedCode,
  generateQRCode,
  generateSurveyLink
} = require('./survey-service/sharing');
const {
  deleteFile: deleteUploadedFile,
  ensureUploadDirectory: ensureUploadDirectoryHelper,
  saveFile: saveUploadedFile,
  uploadOptionImage: uploadOptionImageHelper,
  uploadQuestionImage: uploadQuestionImageHelper,
  uploadSurveyConfigurationImage
} = require('./survey-service/uploads');
const {
  validateImageFile,
  validateLayoutOrientation,
  validateQuestionType
} = require('./survey-service/validators');
const {
  generateUniqueFilename,
  getMimeTypeFromFilename,
  getSafeExtension
} = require('./survey-service/file-utils');
const {
  uploadOptionImageAction,
  uploadQuestionImageAction,
  uploadSurveyImage
} = require('./survey-service/upload-actions');
const {
  getSurveyById: getSurveyByIdHelper,
  getSurveys: getSurveysHelper,
  resolveSurveyIdentifier,
  updateSurveyConfig: updateSurveyConfigHelper
} = require('./survey-service/read-model');

/**
 * Survey Service
 * Handles survey event management and configuration
 */
class SurveyService {
  constructor() {
    this.surveyRepository = new BaseRepository('Surveys', 'SurveyId');
    this.configRepository = new BaseRepository('SurveyConfiguration', 'ConfigId');
  }

  /**
   * Validate survey dates
   * @param {Date} startDate - Survey start date
   * @param {Date} endDate - Survey end date
   * @throws {ValidationError} If dates are invalid
   */
  validateDates(startDate, endDate) {
    return validateDates(startDate, endDate);
  }

  /**
   * Validate survey status
   * @param {string} status - Survey status
   * @throws {ValidationError} If status is invalid
   */
  validateStatus(status) {
    return validateStatus(status);
  }

  normalizeDateValue(value, fieldName) {
    return normalizeDateValue(value, fieldName);
  }

  validatePublishWindow(status, startDate, endDate) {
    return validatePublishWindow(status, startDate, endDate);
  }

  resolveUpdatedSchedule(existingSurvey, data) {
    return resolveUpdatedSchedule(existingSurvey, data);
  }

  /**
   * Normalize assigned admin IDs from legacy and new payload fields.
   * @param {Object} data - Request payload
   * @returns {string[]} Deduplicated admin user IDs
   */
  normalizeAssignedAdminIds(data) {
    return normalizeAssignedAdminIds(data);
  }

  /**
   * Validate all assigned admins are active AdminEvent users.
   * @param {import('mssql').ConnectionPool} pool - DB pool
   * @param {string[]} assignedAdminIds - Admin user IDs
   * @returns {Promise<void>}
   */
  async validateAssignedAdmins(pool, assignedAdminIds) {
    return validateAssignedAdmins(pool, assignedAdminIds);
  }

  /**
   * Replace all admin assignments for a survey.
   * @param {import('mssql').ConnectionPool|import('mssql').Transaction} connection - DB connection
   * @param {string} surveyId - Survey ID
   * @param {string[]} assignedAdminIds - Admin user IDs
   * @returns {Promise<void>}
   */
  async syncSurveyAdminAssignments(connection, surveyId, assignedAdminIds) {
    return syncSurveyAdminAssignments(connection, surveyId, assignedAdminIds);
  }

  /**
   * Create a new survey
   * @param {Object} data - Survey data
   * @param {string} data.title - Survey title (required, max 500 chars)
   * @param {string} [data.description] - Survey description
   * @param {Date} data.startDate - Survey start date
   * @param {Date} data.endDate - Survey end date
   * @param {string} [data.assignedAdminId] - Assigned admin user ID
   * @param {number} [data.targetRespondents] - Target number of respondents
   * @param {number} [data.targetScore] - Target score
   * @param {boolean} [data.duplicatePreventionEnabled=true] - Enable duplicate prevention
   * @param {string} data.createdBy - User ID creating the survey
   * @param {Object} [data.configuration] - Survey configuration
   * @returns {Promise<Object>} Created survey with configuration
   */
  async createSurvey(data) {
    try {
      return await createSurveyHelper(
        db,
        sql,
        logger,
        publishCycleService,
        ValidationError,
        {
          normalizeAssignedAdminIds: this.normalizeAssignedAdminIds.bind(this),
          syncSurveyAdminAssignments: this.syncSurveyAdminAssignments.bind(this),
          validateAssignedAdmins: this.validateAssignedAdmins.bind(this),
          validateDates: this.validateDates.bind(this)
        },
        data,
      );
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw error;
      }
      logger.error('Error creating survey:', error);
      throw error;
    }
  }

  /**
   * Update survey
   * @param {string} surveyId - Survey ID
   * @param {Object} data - Updated data
   * @param {string} data.updatedBy - User ID updating the survey
   * @returns {Promise<Object>} Updated survey
   */
  async updateSurvey(surveyId, data) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
      return await updateSurveyHelper(
        db,
        sql,
        logger,
        publishCycleService,
        { NotFoundError, ValidationError },
        {
          normalizeAssignedAdminIds: this.normalizeAssignedAdminIds.bind(this),
          resolveUpdatedSchedule: this.resolveUpdatedSchedule.bind(this),
          syncSurveyAdminAssignments: this.syncSurveyAdminAssignments.bind(this),
          validateAssignedAdmins: this.validateAssignedAdmins.bind(this),
          validateStatus: this.validateStatus.bind(this)
        },
        resolvedSurveyId,
        data,
      );
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating survey:', error);
      throw error;
    }
  }

  /**
   * Delete survey
   * @param {string} surveyId - Survey ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteSurvey(surveyId) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
      return await deleteSurveyHelper(
        db,
        sql,
        logger,
        { NotFoundError, ValidationError },
        resolvedSurveyId,
      );
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error deleting survey:', error);
      throw error;
    }
  }

  /**
   * Get surveys with optional filtering
   * @param {Object} [filter] - Filter options
   * @param {string} [filter.status] - Filter by status
   * @param {string} [filter.assignedAdminId] - Filter by assigned admin
   * @returns {Promise<Array>} Array of surveys with configurations
   */
  async getSurveys(filter = {}) {
    try {
      return await getSurveysHelper(db, sql, filter);
    } catch (error) {
      logger.error('Error getting surveys:', error);
      throw error;
    }
  }

  /**
   * Get survey by ID with complete data including questions
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Object>} Survey with configuration and questions
   */
  async getSurveyById(surveyId) {
    try {
      return await getSurveyByIdHelper(db, sql, NotFoundError, surveyId);
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error getting survey:', error);
      throw error;
    }
  }

  /**
   * Update survey configuration
   * @param {string} surveyId - Survey ID
   * @param {Object} config - Configuration data
   * @returns {Promise<Object>} Updated configuration
   */
  async updateSurveyConfig(surveyId, config) {
    try {
      const result = await updateSurveyConfigHelper(
        db,
        sql,
        { NotFoundError, ValidationError },
        surveyId,
        config,
      );
      logger.info('Survey configuration updated', { surveyId });
      return result;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating survey configuration:', error);
      throw error;
    }
  }

  /**
   * Generate preview of survey with applied styles
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Object>} Survey preview data with configuration and questions
   */
  async generatePreview(surveyId) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
      return await generateSurveyPreview(resolvedSurveyId, this.generatePreviewStyles.bind(this));
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error generating survey preview:', error);
      throw error;
    }
  }

  /**
   * Generate CSS styles from survey configuration
   * @param {Object} config - Survey configuration
   * @returns {Object} CSS style object
   * @private
   */
  generatePreviewStyles(config) {
    return generatePreviewStyles(config);
  }

  /**
   * Save survey (create or update) with complete data
   * @param {Object} data - Complete survey data
   * @param {string} [data.surveyId] - Survey ID (for update, omit for create)
   * @param {string} data.title - Survey title
   * @param {string} [data.description] - Survey description
   * @param {Date} data.startDate - Survey start date
   * @param {Date} data.endDate - Survey end date
   * @param {string} [data.status='Draft'] - Survey status
   * @param {string} [data.assignedAdminId] - Assigned admin user ID
   * @param {number} [data.targetRespondents] - Target number of respondents
   * @param {number} [data.targetScore] - Target score
   * @param {boolean} [data.duplicatePreventionEnabled=true] - Enable duplicate prevention
   * @param {Object} [data.configuration] - Survey configuration (theme)
   * @param {Array} [data.questions] - Array of questions
   * @param {string} data.userId - User ID performing the operation (createdBy or updatedBy)
   * @returns {Promise<Object>} Saved survey with complete data
   */
  async saveSurvey(data) {
    // Validate before starting transaction
    if (!data.userId) {
      throw new ValidationError('userId is required');
    }

    const pool = await db.getPool();
    const transaction = new sql.Transaction(pool);

    try {
      // Start transaction
      await transaction.begin();

      let survey;
      let isUpdate = false;

      // Check if this is an update or create
      if (data.surveyId) {
        isUpdate = true;
        const existingSurvey = await loadExistingSurveyForSave(transaction, data.surveyId);
        survey = await updateSurveyCore(transaction, data, existingSurvey, {
          normalizeDateValue: this.normalizeDateValue.bind(this),
          validateDates: this.validateDates.bind(this),
          validatePublishWindow: this.validatePublishWindow.bind(this),
          validateStatus: this.validateStatus.bind(this)
        });
      } else {
        survey = await createSurveyCore(transaction, data, {
          normalizeDateValue: this.normalizeDateValue.bind(this),
          validateDates: this.validateDates.bind(this),
          validatePublishWindow: this.validatePublishWindow.bind(this)
        });
      }

      await syncSurveyConfiguration(transaction, survey.SurveyId, data.configuration);
      await syncSurveyQuestions(
        transaction,
        survey.SurveyId,
        data.questions,
        isUpdate,
        data.userId,
        this.validateQuestionType.bind(this),
        this.validateLayoutOrientation.bind(this)
      );

      await transaction.commit();

      logger.info(`Survey ${isUpdate ? 'updated' : 'created'}`, { 
        surveyId: survey.SurveyId, 
        title: data.title 
      });

      // Fetch and return complete survey data
      const completeSurvey = await this.getSurveyById(survey.SurveyId);
      return completeSurvey;
    } catch (error) {
      await transaction.rollback();
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error saving survey:', error);
      throw error;
    }
  }

  /**
   * Validate question type
   * @param {string} type - Question type
   * @throws {ValidationError} If type is invalid
   */
  validateQuestionType(type) {
    return validateQuestionType(type);
  }

  /**
   * Validate layout orientation
   * @param {string} orientation - Layout orientation
   * @throws {ValidationError} If orientation is invalid
   */
  validateLayoutOrientation(orientation) {
    return validateLayoutOrientation(orientation);
  }

  /**
   * Add question to survey
   * @param {string} surveyId - Survey ID
   * @param {Object} data - Question data
   * @param {string} data.type - Question type (HeroCover, Text, MultipleChoice, Checkbox, Dropdown, MatrixLikert, Rating, Date, Signature)
   * @param {string} data.promptText - Question prompt text
   * @param {string} [data.subtitle] - Question subtitle
   * @param {string} [data.imageUrl] - Question image URL
   * @param {boolean} [data.isMandatory=false] - Is question mandatory
   * @param {number} [data.displayOrder] - Display order (auto-assigned if not provided)
   * @param {number} [data.pageNumber=1] - Page number for multi-page surveys
   * @param {string} [data.layoutOrientation] - Layout orientation (vertical/horizontal) for choice questions
   * @param {Object} [data.options] - Question options (JSON)
   * @param {number} [data.commentRequiredBelowRating] - Rating threshold for required comment
   * @param {string} data.createdBy - User ID creating the question
   * @returns {Promise<Object>} Created question
   */
  async addQuestion(surveyId, data) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
      return await addQuestionHelper(
        db,
        sql,
        logger,
        { NotFoundError, ValidationError },
        {
          validateLayoutOrientation: this.validateLayoutOrientation.bind(this),
          validateQuestionType: this.validateQuestionType.bind(this)
        },
        resolvedSurveyId,
        data,
      );
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error adding question:', error);
      throw error;
    }
  }

  /**
   * Update question
   * @param {string} questionId - Question ID
   * @param {Object} data - Updated question data
   * @param {string} data.updatedBy - User ID updating the question
   * @returns {Promise<Object>} Updated question
   */
  async updateQuestion(questionId, data) {
    try {
      return await updateQuestionHelper(
        db,
        sql,
        logger,
        { NotFoundError, ValidationError },
        {
          validateLayoutOrientation: this.validateLayoutOrientation.bind(this),
          validateQuestionType: this.validateQuestionType.bind(this)
        },
        questionId,
        data,
      );
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating question:', error);
      throw error;
    }
  }

  /**
   * Delete question
   * @param {string} questionId - Question ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteQuestion(questionId) {
    try {
      return await deleteQuestionHelper(
        db,
        sql,
        logger,
        { NotFoundError },
        questionId,
      );
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error deleting question:', error);
      throw error;
    }
  }

  /**
   * Reorder questions
   * @param {string} surveyId - Survey ID
   * @param {Array<{questionId: string, displayOrder: number}>} questionOrders - Array of question IDs with new display orders
   * @returns {Promise<Array>} Updated questions
   */
  async reorderQuestions(surveyId, questionOrders) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
      return await reorderQuestionsHelper(
        db,
        sql,
        logger,
        { NotFoundError, ValidationError },
        resolvedSurveyId,
        questionOrders,
      );
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error reordering questions:', error);
      throw error;
    }
  }

  async getQuestionsBySurvey(surveyId) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
      return await getQuestionsBySurveyHelper(db, sql, resolvedSurveyId);
    } catch (error) {
      logger.error('Error getting questions:', error);
      throw error;
    }
  }

  async generateSurveyLink(surveyId, shortenUrl = false) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
      return await generateSurveyLink(db, sql, config, NotFoundError, logger, resolvedSurveyId, shortenUrl);
    } catch (error) {
      logger.error('Error generating survey link:', error);
      throw error;
    }
  }

  async generateQRCode(surveyId) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
      return await generateQRCode(
        db,
        sql,
        NotFoundError,
        logger,
        this.generateSurveyLink.bind(this),
        resolvedSurveyId,
      );
    } catch (error) {
      logger.error('Error generating QR code:', error);
      throw error;
    }
  }

  async generateEmbedCode(surveyId) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
      return await generateEmbedCode(
        db,
        sql,
        NotFoundError,
        logger,
        this.generateSurveyLink.bind(this),
        resolvedSurveyId,
      );
    } catch (error) {
      logger.error('Error generating embed code:', error);
      throw error;
    }
  }

  normalizeScheduledTime(scheduledTime) {
    return normalizeScheduledTime(scheduledTime);
  }

  toSqlTimeValue(scheduledTime) {
    return toSqlTimeValue(scheduledTime);
  }

  calculateNextExecution(scheduledDate, frequency, scheduledTime, dayOfWeek) {
    return calculateNextExecution(scheduledDate, frequency, scheduledTime, dayOfWeek);
  }

  resolveInitialExecution(scheduledDate, frequency, scheduledTime, dayOfWeek) {
    return resolveInitialExecution(scheduledDate, frequency, scheduledTime, dayOfWeek);
  }

  async scheduleBlast(request) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, request.surveyId);
      return await scheduleOperation(
        {
          ...request,
          surveyId: resolvedSurveyId,
          emailTemplate: request.emailTemplate || 'survey-invitation'
        },
        'Blast',
        {
          normalizeScheduledTime: this.normalizeScheduledTime.bind(this),
          resolveInitialExecution: this.resolveInitialExecution.bind(this),
          toSqlTimeValue: this.toSqlTimeValue.bind(this)
        }
      );
    } catch (error) {
      logger.error('Error scheduling blast:', error);
      throw error;
    }
  }

  async scheduleReminder(request) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, request.surveyId);
      return await scheduleOperation(
        {
          ...request,
          surveyId: resolvedSurveyId,
          emailTemplate: request.emailTemplate || 'survey-reminder'
        },
        'Reminder',
        {
          normalizeScheduledTime: this.normalizeScheduledTime.bind(this),
          resolveInitialExecution: this.resolveInitialExecution.bind(this),
          toSqlTimeValue: this.toSqlTimeValue.bind(this)
        }
      );
    } catch (error) {
      logger.error('Error scheduling reminder:', error);
      throw error;
    }
  }

  async getScheduledOperations(surveyId, filter = {}) {
    try {
      const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
      return await getScheduledOperations(resolvedSurveyId, filter);
    } catch (error) {
      logger.error('Error getting scheduled operations:', error);
      throw error;
    }
  }

  async cancelScheduledOperation(operationId) {
    try {
      return await cancelScheduledOperation(operationId);
    } catch (error) {
      logger.error('Error cancelling scheduled operation:', error);
      throw error;
    }
  }

  validateImageFile(file) {
    return validateImageFile(file);
  }

  generateUniqueFilename(file) {
    return generateUniqueFilename(file);
  }

  getMimeTypeFromFilename(originalName) {
    return getMimeTypeFromFilename(originalName);
  }

  getSafeExtension(mimeType, originalName) {
    return getSafeExtension(mimeType, originalName);
  }

  async ensureUploadDirectory(directory) {
    return ensureUploadDirectoryHelper(directory, { fs, logger });
  }

  async saveFile(buffer, filename, subdirectory) {
    return saveUploadedFile(buffer, filename, subdirectory, { config, fs, logger });
  }

  async deleteFile(fileUrl) {
    return deleteUploadedFile(fileUrl, { config, fs, logger });
  }

  async uploadHeroImage(surveyId, file) {
    const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
    return uploadSurveyImage({
      logger,
      uploadSurveyConfigurationImage
    }, resolvedSurveyId, file, {
      columnName: 'HeroImageUrl',
      configKey: 'heroImageUrl',
      logLabel: 'Hero image',
      validateImageFile: this.validateImageFile.bind(this),
      getSurveyById: this.getSurveyById.bind(this),
      generateUniqueFilename: this.generateUniqueFilename.bind(this),
      saveFile: this.saveFile.bind(this),
      deleteFile: this.deleteFile.bind(this),
      db,
      sql,
      crypto,
      NotFoundError,
      logger
    });
  }

  async uploadLogo(surveyId, file) {
    const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
    return uploadSurveyImage({
      logger,
      uploadSurveyConfigurationImage
    }, resolvedSurveyId, file, {
      columnName: 'LogoUrl',
      configKey: 'logoUrl',
      logLabel: 'Logo',
      validateImageFile: this.validateImageFile.bind(this),
      getSurveyById: this.getSurveyById.bind(this),
      generateUniqueFilename: this.generateUniqueFilename.bind(this),
      saveFile: this.saveFile.bind(this),
      deleteFile: this.deleteFile.bind(this),
      db,
      sql,
      crypto,
      NotFoundError,
      logger
    });
  }

  async uploadBackgroundImage(surveyId, file) {
    const resolvedSurveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyId);
    return uploadSurveyImage({
      logger,
      uploadSurveyConfigurationImage
    }, resolvedSurveyId, file, {
      columnName: 'BackgroundImageUrl',
      configKey: 'backgroundImageUrl',
      logLabel: 'Background image',
      validateImageFile: this.validateImageFile.bind(this),
      getSurveyById: this.getSurveyById.bind(this),
      generateUniqueFilename: this.generateUniqueFilename.bind(this),
      saveFile: this.saveFile.bind(this),
      deleteFile: this.deleteFile.bind(this),
      db,
      sql,
      crypto,
      NotFoundError,
      logger
    });
  }

  async uploadQuestionImage(questionId, file) {
    return uploadQuestionImageAction({
      logger,
      uploadQuestionImageHelper,
      shared: {
        validateImageFile: this.validateImageFile.bind(this),
        generateUniqueFilename: this.generateUniqueFilename.bind(this),
        saveFile: this.saveFile.bind(this),
        deleteFile: this.deleteFile.bind(this),
        db,
        sql,
        NotFoundError,
        logger
      }
    }, questionId, file);
  }

  async uploadOptionImage(questionId, optionIndex, file) {
    return uploadOptionImageAction({
      logger,
      uploadOptionImageHelper,
      shared: {
        validateImageFile: this.validateImageFile.bind(this),
        generateUniqueFilename: this.generateUniqueFilename.bind(this),
        saveFile: this.saveFile.bind(this),
        deleteFile: this.deleteFile.bind(this),
        db,
        sql,
        ValidationError,
        NotFoundError,
        logger
      }
    }, questionId, optionIndex, file);
  }
}

const surveyService = new SurveyService();

module.exports = surveyService;
module.exports.SurveyService = SurveyService;
module.exports.ValidationError = ValidationError;
module.exports.ConflictError = ConflictError;
module.exports.NotFoundError = NotFoundError;



