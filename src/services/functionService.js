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
 * Function Service
 */
class FunctionService {
  constructor() {
    this.repository = new BaseRepository('Functions', 'FunctionId');
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
   * Create a new Function
   * @param {Object} data - Function data
   * @param {string} data.code - Unique code (2-20 chars, alphanumeric + hyphen)
   * @param {string} data.name - Function name (1-200 chars)
   * @returns {Promise<Object>} Created Function
   */
  async createFunction(data) {
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
        .query('SELECT FunctionId FROM Functions WHERE Code = @code');

      if (codeCheck.recordset.length > 0) {
        throw new ConflictError(`Function with code '${data.code}' already exists`);
      }

      // Create Function
      const result = await pool.request()
        .input('code', sql.NVarChar(20), data.code)
        .input('name', sql.NVarChar(200), data.name)
        .query(`
          INSERT INTO Functions (Code, Name, IsActive, CreatedAt)
          OUTPUT INSERTED.*
          VALUES (@code, @name, 1, GETDATE())
        `);

      logger.info('Function created', { code: data.code });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError') {
        throw error;
      }
      logger.error('Error creating Function:', error);
      throw error;
    }
  }

  /**
   * Update Function
   * @param {string} functionId - Function ID
   * @param {Object} data - Updated data
   * @returns {Promise<Object>} Updated Function
   */
  async updateFunction(functionId, data) {
    try {
      const pool = await db.getPool();

      // Check if Function exists
      const funcCheck = await pool.request()
        .input('functionId', sql.UniqueIdentifier, functionId)
        .query('SELECT FunctionId FROM Functions WHERE FunctionId = @functionId');

      if (funcCheck.recordset.length === 0) {
        throw new NotFoundError('Function not found');
      }

      // Validate code if provided
      if (data.code && !this.validateCode(data.code)) {
        throw new ValidationError('Code must be 2-20 characters, alphanumeric and hyphen only');
      }

      // Check for duplicate code if code is being changed
      if (data.code) {
        const codeCheck = await pool.request()
          .input('code', sql.NVarChar(20), data.code)
          .input('functionId', sql.UniqueIdentifier, functionId)
          .query('SELECT FunctionId FROM Functions WHERE Code = @code AND FunctionId != @functionId');

        if (codeCheck.recordset.length > 0) {
          throw new ConflictError(`Function with code '${data.code}' already exists`);
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
      request.input('functionId', sql.UniqueIdentifier, functionId);

      if (data.code !== undefined) {
        updateFields.push('Code = @code');
        request.input('code', sql.NVarChar(20), data.code);
      }
      if (data.name !== undefined) {
        updateFields.push('Name = @name');
        request.input('name', sql.NVarChar(200), data.name);
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
        UPDATE Functions
        SET ${updateFields.join(', ')}
        OUTPUT INSERTED.*
        WHERE FunctionId = @functionId
      `);

      logger.info('Function updated', { functionId });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating Function:', error);
      throw error;
    }
  }

  /**
   * Delete Function (with dependency check)
   * @param {string} functionId - Function ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteFunction(functionId) {
    try {
      const pool = await db.getPool();

      // Check if Function exists
      const funcCheck = await pool.request()
        .input('functionId', sql.UniqueIdentifier, functionId)
        .query('SELECT FunctionId FROM Functions WHERE FunctionId = @functionId');

      if (funcCheck.recordset.length === 0) {
        throw new NotFoundError('Function not found');
      }

      // Check for active mappings
      const mappingCheck = await pool.request()
        .input('functionId', sql.UniqueIdentifier, functionId)
        .query('SELECT COUNT(*) as count FROM FunctionApplicationMappings WHERE FunctionId = @functionId');

      if (mappingCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot delete Function: active Application mappings exist');
      }

      // Check for IT Lead assignments (if Users table has FunctionId reference)
      // Note: Based on the schema, IT Leads might be assigned to functions
      // This is a placeholder check - adjust based on actual schema
      const itLeadCheck = await pool.request()
        .input('functionId', sql.UniqueIdentifier, functionId)
        .query(`
          SELECT COUNT(*) as count 
          FROM Users 
          WHERE Role = 'ITLead' 
          AND FunctionId = @functionId
        `);

      if (itLeadCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot delete Function: IT Lead assignments exist');
      }

      // Delete Function
      const result = await pool.request()
        .input('functionId', sql.UniqueIdentifier, functionId)
        .query('DELETE FROM Functions WHERE FunctionId = @functionId');

      logger.info('Function deleted', { functionId });
      return result.rowsAffected[0] > 0;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      // Handle case where FunctionId column doesn't exist in Users table
      if (error.number === 207) {
        // Invalid column name - skip IT Lead check
        logger.warn('FunctionId column not found in Users table, skipping IT Lead check');
        // Retry delete without IT Lead check
        try {
          const pool = await db.getPool();
          const result = await pool.request()
            .input('functionId', sql.UniqueIdentifier, functionId)
            .query('DELETE FROM Functions WHERE FunctionId = @functionId');
          logger.info('Function deleted', { functionId });
          return result.rowsAffected[0] > 0;
        } catch (retryError) {
          logger.error('Error deleting Function on retry:', retryError);
          throw retryError;
        }
      }
      logger.error('Error deleting Function:', error);
      throw error;
    }
  }

  /**
   * Get all Functions
   * @param {Object} [filter] - Filter options
   * @param {boolean} [filter.includeInactive=false] - Include inactive Functions
   * @returns {Promise<Array>} Array of Functions
   */
  async getFunctions(filter = {}) {
    try {
      const pool = await db.getPool();
      let query = 'SELECT * FROM Functions';

      if (!filter.includeInactive) {
        query += ' WHERE IsActive = 1';
      }

      query += ' ORDER BY Name';

      const result = await pool.request().query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting Functions:', error);
      throw error;
    }
  }

  /**
   * Get Function by ID
   * @param {string} functionId - Function ID
   * @returns {Promise<Object>} Function
   */
  async getFunctionById(functionId) {
    try {
      const pool = await db.getPool();
      const result = await pool.request()
        .input('functionId', sql.UniqueIdentifier, functionId)
        .query('SELECT * FROM Functions WHERE FunctionId = @functionId');

      if (result.recordset.length === 0) {
        throw new NotFoundError('Function not found');
      }

      return result.recordset[0];
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error getting Function:', error);
      throw error;
    }
  }
}

const functionService = new FunctionService();

module.exports = functionService;
module.exports.FunctionService = FunctionService;
module.exports.ValidationError = ValidationError;
module.exports.ConflictError = ConflictError;
module.exports.NotFoundError = NotFoundError;
