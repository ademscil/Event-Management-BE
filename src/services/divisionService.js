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
 * Division Service with hierarchical validation
 */
class DivisionService {
  constructor() {
    this.repository = new BaseRepository('Divisions', 'DivisionId');
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
   * Create a new Division
   * @param {Object} data - Division data
   * @param {string} data.businessUnitId - Parent Business Unit ID (required)
   * @param {string} data.code - Unique code (2-20 chars, alphanumeric + hyphen)
   * @param {string} data.name - Division name (1-200 chars)
   * @returns {Promise<Object>} Created Division
   */
  async createDivision(data) {
    try {
      // Validate required parent
      if (!data.businessUnitId) {
        throw new ValidationError('Business Unit ID is required');
      }

      // Validate code
      if (!this.validateCode(data.code)) {
        throw new ValidationError('Code must be 2-20 characters, alphanumeric and hyphen only');
      }

      // Validate name
      if (!data.name || data.name.trim().length === 0 || data.name.length > 200) {
        throw new ValidationError('Name is required and must be 1-200 characters');
      }

      const pool = await db.getPool();

      // Validate that Business Unit exists and is active
      const buCheck = await pool.request()
        .input('businessUnitId', sql.UniqueIdentifier, data.businessUnitId)
        .query('SELECT BusinessUnitId FROM BusinessUnits WHERE BusinessUnitId = @businessUnitId AND IsActive = 1');

      if (buCheck.recordset.length === 0) {
        throw new ValidationError('Parent Business Unit does not exist or is inactive');
      }

      // Check for duplicate code
      const codeCheck = await pool.request()
        .input('code', sql.NVarChar(20), data.code)
        .query('SELECT DivisionId FROM Divisions WHERE Code = @code');

      if (codeCheck.recordset.length > 0) {
        throw new ConflictError(`Division with code '${data.code}' already exists`);
      }

      // Create Division
      const result = await pool.request()
        .input('businessUnitId', sql.UniqueIdentifier, data.businessUnitId)
        .input('code', sql.NVarChar(20), data.code)
        .input('name', sql.NVarChar(200), data.name)
        .query(`
          INSERT INTO Divisions (BusinessUnitId, Code, Name, IsActive, CreatedAt)
          OUTPUT INSERTED.*
          VALUES (@businessUnitId, @code, @name, 1, GETDATE())
        `);

      logger.info('Division created', { code: data.code, businessUnitId: data.businessUnitId });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError') {
        throw error;
      }
      logger.error('Error creating Division:', error);
      throw error;
    }
  }

  /**
   * Update Division
   * @param {string} divisionId - Division ID
   * @param {Object} data - Updated data
   * @returns {Promise<Object>} Updated Division
   */
  async updateDivision(divisionId, data) {
    try {
      const pool = await db.getPool();

      // Check if Division exists
      const divCheck = await pool.request()
        .input('divisionId', sql.UniqueIdentifier, divisionId)
        .query('SELECT DivisionId FROM Divisions WHERE DivisionId = @divisionId');

      if (divCheck.recordset.length === 0) {
        throw new NotFoundError('Division not found');
      }

      // Validate Business Unit if being changed
      if (data.businessUnitId) {
        const buCheck = await pool.request()
          .input('businessUnitId', sql.UniqueIdentifier, data.businessUnitId)
          .query('SELECT BusinessUnitId FROM BusinessUnits WHERE BusinessUnitId = @businessUnitId AND IsActive = 1');

        if (buCheck.recordset.length === 0) {
          throw new ValidationError('Parent Business Unit does not exist or is inactive');
        }
      }

      // Validate code if provided
      if (data.code && !this.validateCode(data.code)) {
        throw new ValidationError('Code must be 2-20 characters, alphanumeric and hyphen only');
      }

      // Check for duplicate code if code is being changed
      if (data.code) {
        const codeCheck = await pool.request()
          .input('code', sql.NVarChar(20), data.code)
          .input('divisionId', sql.UniqueIdentifier, divisionId)
          .query('SELECT DivisionId FROM Divisions WHERE Code = @code AND DivisionId != @divisionId');

        if (codeCheck.recordset.length > 0) {
          throw new ConflictError(`Division with code '${data.code}' already exists`);
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
      request.input('divisionId', sql.UniqueIdentifier, divisionId);

      if (data.businessUnitId !== undefined) {
        updateFields.push('BusinessUnitId = @businessUnitId');
        request.input('businessUnitId', sql.UniqueIdentifier, data.businessUnitId);
      }
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
        UPDATE Divisions
        SET ${updateFields.join(', ')}
        OUTPUT INSERTED.*
        WHERE DivisionId = @divisionId
      `);

      logger.info('Division updated', { divisionId });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating Division:', error);
      throw error;
    }
  }

  /**
   * Delete Division (with dependency check)
   * @param {string} divisionId - Division ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteDivision(divisionId) {
    try {
      const pool = await db.getPool();

      // Check if Division exists
      const divCheck = await pool.request()
        .input('divisionId', sql.UniqueIdentifier, divisionId)
        .query('SELECT DivisionId FROM Divisions WHERE DivisionId = @divisionId');

      if (divCheck.recordset.length === 0) {
        throw new NotFoundError('Division not found');
      }

      // Check for dependent Departments
      const deptCheck = await pool.request()
        .input('divisionId', sql.UniqueIdentifier, divisionId)
        .query('SELECT COUNT(*) as count FROM Departments WHERE DivisionId = @divisionId');

      if (deptCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot delete Division: associated Departments exist');
      }

      // Delete Division
      const result = await pool.request()
        .input('divisionId', sql.UniqueIdentifier, divisionId)
        .query('DELETE FROM Divisions WHERE DivisionId = @divisionId');

      logger.info('Division deleted', { divisionId });
      return result.rowsAffected[0] > 0;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error deleting Division:', error);
      throw error;
    }
  }

  /**
   * Get Divisions by Business Unit
   * @param {string} businessUnitId - Business Unit ID
   * @param {Object} [filter] - Filter options
   * @param {boolean} [filter.includeInactive=false] - Include inactive Divisions
   * @returns {Promise<Array>} Array of Divisions
   */
  async getDivisionsByBusinessUnit(businessUnitId, filter = {}) {
    try {
      const pool = await db.getPool();
      const request = pool.request();
      request.input('businessUnitId', sql.UniqueIdentifier, businessUnitId);

      let query = 'SELECT * FROM Divisions WHERE BusinessUnitId = @businessUnitId';

      if (!filter.includeInactive) {
        query += ' AND IsActive = 1';
      }

      query += ' ORDER BY Name';

      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting Divisions:', error);
      throw error;
    }
  }

  /**
   * Get all Divisions
   * @param {Object} [filter] - Filter options
   * @param {boolean} [filter.includeInactive=false] - Include inactive Divisions
   * @returns {Promise<Array>} Array of Divisions
   */

  /**
   * Backward-compatible alias
   * @param {Object} [filter] - Filter options
   * @returns {Promise<Array>} Array of Divisions
   */
  async getAllDivisions(filter = {}) {
    return this.getDivisions(filter);
  }
  async getDivisions(filter = {}) {
    try {
      const pool = await db.getPool();
      let query = 'SELECT * FROM Divisions';

      if (!filter.includeInactive) {
        query += ' WHERE IsActive = 1';
      }

      query += ' ORDER BY Name';

      const result = await pool.request().query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting Divisions:', error);
      throw error;
    }
  }

  /**
   * Get Division by ID
   * @param {string} divisionId - Division ID
   * @returns {Promise<Object>} Division
   */
  async getDivisionById(divisionId) {
    try {
      const pool = await db.getPool();
      const result = await pool.request()
        .input('divisionId', sql.UniqueIdentifier, divisionId)
        .query('SELECT * FROM Divisions WHERE DivisionId = @divisionId');

      if (result.recordset.length === 0) {
        throw new NotFoundError('Division not found');
      }

      return result.recordset[0];
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error getting Division:', error);
      throw error;
    }
  }
}

const divisionService = new DivisionService();

module.exports = divisionService;
module.exports.DivisionService = DivisionService;
module.exports.ValidationError = ValidationError;
module.exports.ConflictError = ConflictError;
module.exports.NotFoundError = NotFoundError;

