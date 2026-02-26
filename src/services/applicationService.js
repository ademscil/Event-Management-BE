const sql = require('mssql');
const BaseRepository = require('./baseRepository');
const db = require('../database/connection');
const logger = require('../config/logger');

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 422;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

/**
 * Application Service
 */
class ApplicationService {
  constructor() {
    this.repository = new BaseRepository('Applications', 'ApplicationId');
  }

  /**
   * Validate code format
   * @param {string} code - Code to validate
   * @returns {boolean} True if valid
   */
  validateCode(code) {
    // 2-20 characters, alphanumeric and hyphen only
    const codeRegex = /^[a-zA-Z0-9-]{2,20}$/;
    return codeRegex.test(code);
  }

  /**
   * Create a new Application
   * @param {Object} data - Application data
   * @param {string} data.code - Unique code (2-20 chars, alphanumeric + hyphen)
   * @param {string} data.name - Application name (1-200 chars)
   * @param {string} [data.description] - Application description
   * @returns {Promise<Object>} Created Application
   */
  async createApplication(data) {
    try {
      // Validate code
      if (!this.validateCode(data.code)) {
        throw new ValidationError('Code must be 2-20 characters, alphanumeric and hyphen only');
      }

      // Validate name
      if (!data.name || data.name.trim().length === 0 || data.name.length > 200) {
        throw new ValidationError('Name is required and must be 1-200 characters');
      }

      const pool = await db.getPool();

      // Check for duplicate code
      const codeCheck = await pool.request()
        .input('code', sql.NVarChar(20), data.code)
        .query('SELECT ApplicationId FROM Applications WHERE Code = @code');

      if (codeCheck.recordset.length > 0) {
        throw new ConflictError(`Application with code '${data.code}' already exists`);
      }

      // Create Application
      const result = await pool.request()
        .input('code', sql.NVarChar(20), data.code)
        .input('name', sql.NVarChar(200), data.name)
        .input('description', sql.NVarChar(sql.MAX), data.description || null)
        .query(`
          INSERT INTO Applications (Code, Name, Description, IsActive, CreatedAt)
          OUTPUT INSERTED.*
          VALUES (@code, @name, @description, 1, GETDATE())
        `);

      logger.info('Application created', { code: data.code });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError') {
        throw error;
      }
      logger.error('Error creating Application:', error);
      throw error;
    }
  }

  /**
   * Update Application
   * @param {string} applicationId - Application ID
   * @param {Object} data - Updated data
   * @returns {Promise<Object>} Updated Application
   */
  async updateApplication(applicationId, data) {
    try {
      const pool = await db.getPool();

      // Check if Application exists
      const appCheck = await pool.request()
        .input('applicationId', sql.UniqueIdentifier, applicationId)
        .query('SELECT ApplicationId FROM Applications WHERE ApplicationId = @applicationId');

      if (appCheck.recordset.length === 0) {
        throw new NotFoundError('Application not found');
      }

      // Validate code if provided
      if (data.code && !this.validateCode(data.code)) {
        throw new ValidationError('Code must be 2-20 characters, alphanumeric and hyphen only');
      }

      // Check for duplicate code if code is being changed
      if (data.code) {
        const codeCheck = await pool.request()
          .input('code', sql.NVarChar(20), data.code)
          .input('applicationId', sql.UniqueIdentifier, applicationId)
          .query('SELECT ApplicationId FROM Applications WHERE Code = @code AND ApplicationId != @applicationId');

        if (codeCheck.recordset.length > 0) {
          throw new ConflictError(`Application with code '${data.code}' already exists`);
        }
      }

      // Validate name if provided
      if (data.name !== undefined && (!data.name || data.name.trim().length === 0 || data.name.length > 200)) {
        throw new ValidationError('Name is required and must be 1-200 characters');
      }

      if (data.isActive !== undefined && typeof data.isActive !== 'boolean') {
        throw new ValidationError('isActive must be boolean');
      }

      // Build update query
      const updateFields = [];
      const request = pool.request();
      request.input('applicationId', sql.UniqueIdentifier, applicationId);

      if (data.code !== undefined) {
        updateFields.push('Code = @code');
        request.input('code', sql.NVarChar(20), data.code);
      }
      if (data.name !== undefined) {
        updateFields.push('Name = @name');
        request.input('name', sql.NVarChar(200), data.name);
      }
      if (data.description !== undefined) {
        updateFields.push('Description = @description');
        request.input('description', sql.NVarChar(sql.MAX), data.description);
      }
      if (data.isActive !== undefined) {
        updateFields.push('IsActive = @isActive');
        request.input('isActive', sql.Bit, data.isActive);
      }

      if (updateFields.length === 0) {
        throw new ValidationError('No fields to update');
      }

      updateFields.push('UpdatedAt = GETDATE()');

      const result = await request.query(`
        UPDATE Applications
        SET ${updateFields.join(', ')}
        OUTPUT INSERTED.*
        WHERE ApplicationId = @applicationId
      `);

      logger.info('Application updated', { applicationId });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating Application:', error);
      throw error;
    }
  }

  /**
   * Delete Application (with dependency check)
   * @param {string} applicationId - Application ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteApplication(applicationId) {
    try {
      const pool = await db.getPool();

      // Check if Application exists
      const appCheck = await pool.request()
        .input('applicationId', sql.UniqueIdentifier, applicationId)
        .query('SELECT ApplicationId FROM Applications WHERE ApplicationId = @applicationId');

      if (appCheck.recordset.length === 0) {
        throw new NotFoundError('Application not found');
      }

      // Check for active Function-Application mappings
      const funcMappingCheck = await pool.request()
        .input('applicationId', sql.UniqueIdentifier, applicationId)
        .query('SELECT COUNT(*) as count FROM FunctionApplicationMappings WHERE ApplicationId = @applicationId');

      if (funcMappingCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot delete Application: active Function mappings exist');
      }

      // Check for active Application-Department mappings
      const deptMappingCheck = await pool.request()
        .input('applicationId', sql.UniqueIdentifier, applicationId)
        .query('SELECT COUNT(*) as count FROM ApplicationDepartmentMappings WHERE ApplicationId = @applicationId');

      if (deptMappingCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot delete Application: active Department mappings exist');
      }

      // Check for survey responses
      const responseCheck = await pool.request()
        .input('applicationId', sql.UniqueIdentifier, applicationId)
        .query('SELECT COUNT(*) as count FROM Responses WHERE ApplicationId = @applicationId');

      if (responseCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot delete Application: associated survey responses exist');
      }

      // Delete Application
      const result = await pool.request()
        .input('applicationId', sql.UniqueIdentifier, applicationId)
        .query('DELETE FROM Applications WHERE ApplicationId = @applicationId');

      logger.info('Application deleted', { applicationId });
      return result.rowsAffected[0] > 0;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error deleting Application:', error);
      throw error;
    }
  }

  /**
   * Get all Applications
   * @param {Object} [filter] - Filter options
   * @param {boolean} [filter.includeInactive=false] - Include inactive Applications
   * @returns {Promise<Array>} Array of Applications
   */
  async getApplications(filter = {}) {
    try {
      const pool = await db.getPool();
      let query = 'SELECT * FROM Applications';

      if (!filter.includeInactive) {
        query += ' WHERE IsActive = 1';
      }

      query += ' ORDER BY Name';

      const result = await pool.request().query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting Applications:', error);
      throw error;
    }
  }

  /**
   * Get Application by ID
   * @param {string} applicationId - Application ID
   * @returns {Promise<Object>} Application
   */
  async getApplicationById(applicationId) {
    try {
      const pool = await db.getPool();
      const result = await pool.request()
        .input('applicationId', sql.UniqueIdentifier, applicationId)
        .query('SELECT * FROM Applications WHERE ApplicationId = @applicationId');

      if (result.recordset.length === 0) {
        throw new NotFoundError('Application not found');
      }

      return result.recordset[0];
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error getting Application:', error);
      throw error;
    }
  }
}

const applicationService = new ApplicationService();

module.exports = applicationService;
module.exports.ApplicationService = ApplicationService;
module.exports.ValidationError = ValidationError;
module.exports.ConflictError = ConflictError;
module.exports.NotFoundError = NotFoundError;
