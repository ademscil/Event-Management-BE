const sql = require('../database/sql-client');

  
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
 * Business Unit Service
 */
class BusinessUnitService {
  constructor() {
    this.repository = new BaseRepository('BusinessUnits', 'BusinessUnitId');
  }

  /**
   * Validate code format — no longer needed, Code is auto-increment
   * Kept for backward compatibility
   */
  validateCode(code) {
    return true;
  }

  /**
   * Create a new Business Unit
   * @param {Object} data - Business Unit data
   * @param {string} data.code - Unique code (2-20 chars, alphanumeric + hyphen)
   * @param {string} data.name - Business Unit name (1-200 chars)
   * @returns {Promise<Object>} Created Business Unit
   */
  async createBusinessUnit(data) {
    try {
      // Validate name
      if (!data.name || data.name.trim().length === 0 || data.name.length > 200) {
        throw new ValidationError('Name is required and must be 1-200 characters');
      }

      const pool = await db.getPool();

      // Create Business Unit — Code is auto-increment, no need to pass it
      const result = await pool.request()
        .input('name', sql.NVarChar(200), data.name)
        .query(`
          INSERT INTO BusinessUnits (Name, IsActive, CreatedAt)
          OUTPUT INSERTED.*
          VALUES (@name, 1, GETDATE())
        `);

      const bu = result.recordset[0];
      logger.info('Business Unit created', { name: data.name });

      // Auto-create Division + Department dengan nama sama untuk BU non-Corporate HO
      const isCorporateHo = data.name.trim().toLowerCase() === 'corporate ho';
      if (!isCorporateHo) {
        try {
          const buNameClean = data.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12).toUpperCase();
          const divCode = `DIV-${buNameClean}`;
          const deptCode = `DEPT-${buNameClean}`;

          const divResult = await pool.request()
            .input('businessUnitId', sql.UniqueIdentifier, bu.BusinessUnitId)
            .input('name', sql.NVarChar(200), data.name)
            .input('code', sql.NVarChar(50), divCode)
            .query(`
              INSERT INTO Divisions (BusinessUnitId, Code, Name, IsActive, CreatedAt)
              OUTPUT INSERTED.DivisionId
              VALUES (@businessUnitId, @code, @name, 1, GETDATE())
            `);

          const divisionId = divResult.recordset[0].DivisionId;

          await pool.request()
            .input('divisionId', sql.UniqueIdentifier, divisionId)
            .input('name', sql.NVarChar(200), data.name)
            .input('code', sql.NVarChar(50), deptCode)
            .query(`
              INSERT INTO Departments (DivisionId, Code, Name, IsActive, CreatedAt)
              VALUES (@divisionId, @code, @name, 1, GETDATE())
            `);

          logger.info('Auto-created Division and Department for new BU', {
            buName: data.name,
            divisionId,
          });
        } catch (autoCreateError) {
          // Jangan gagalkan create BU jika auto-create divisi/dept gagal
          logger.warn('Failed to auto-create Division/Department for BU', {
            buName: data.name,
            error: autoCreateError.message,
          });
        }
      }

      return bu;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError') {
        throw error;
      }
      logger.error('Error creating Business Unit:', error);
      throw error;
    }
  }

  /**
   * Update Business Unit
   * @param {string} businessUnitId - Business Unit ID
   * @param {Object} data - Updated data
   * @returns {Promise<Object>} Updated Business Unit
   */
  async updateBusinessUnit(businessUnitId, data) {
    try {
      const pool = await db.getPool();

      const buCheck = await pool.request()
        .input('businessUnitId', sql.UniqueIdentifier, businessUnitId)
        .query('SELECT BusinessUnitId FROM BusinessUnits WHERE BusinessUnitId = @businessUnitId');

      if (buCheck.recordset.length === 0) {
        throw new NotFoundError('Business Unit not found');
      }

      // Validate name if provided
      if (data.name !== undefined && (!data.name || data.name.trim().length === 0 || data.name.length > 200)) {
        throw new ValidationError('Name is required and must be 1-200 characters');
      }

      if (data.isActive !== undefined && typeof data.isActive !== 'boolean') {
        throw new ValidationError('isActive must be boolean');
      }

      // Build update query — Code is auto-increment, never updated
      const updateFields = [];
      const request = pool.request();
      request.input('businessUnitId', sql.UniqueIdentifier, businessUnitId);

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
        UPDATE BusinessUnits
        SET ${updateFields.join(', ')}
        OUTPUT INSERTED.*
        WHERE BusinessUnitId = @businessUnitId
      `);

      logger.info('Business Unit updated', { businessUnitId });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating Business Unit:', error);
      throw error;
    }
  }

  /**
   * Delete Business Unit (with dependency check)
   * @param {string} businessUnitId - Business Unit ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteBusinessUnit(businessUnitId) {
    try {
      const pool = await db.getPool();

      // Check if Business Unit exists
      const buCheck = await pool.request()
        .input('businessUnitId', sql.UniqueIdentifier, businessUnitId)
        .query('SELECT BusinessUnitId FROM BusinessUnits WHERE BusinessUnitId = @businessUnitId');

      if (buCheck.recordset.length === 0) {
        throw new NotFoundError('Business Unit not found');
      }

      // Check for dependent Divisions
      const divisionCheck = await pool.request()
        .input('businessUnitId', sql.UniqueIdentifier, businessUnitId)
        .query('SELECT COUNT(*) as count FROM Divisions WHERE BusinessUnitId = @businessUnitId');

      if (divisionCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot delete Business Unit: associated Divisions exist');
      }

      // Delete Business Unit
      const result = await pool.request()
        .input('businessUnitId', sql.UniqueIdentifier, businessUnitId)
        .query('DELETE FROM BusinessUnits WHERE BusinessUnitId = @businessUnitId');

      logger.info('Business Unit deleted', { businessUnitId });
      return result.rowsAffected[0] > 0;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error deleting Business Unit:', error);
      throw error;
    }
  }

  /**
   * Get all Business Units
   * @param {Object} [filter] - Filter options
   * @param {boolean} [filter.includeInactive=false] - Include inactive Business Units
   * @returns {Promise<Array>} Array of Business Units
   */

  /**
   * Backward-compatible alias
   * @param {Object} [filter] - Filter options
   * @returns {Promise<Array>} Array of Business Units
   */
  async getAllBusinessUnits(filter = {}) {
    return this.getBusinessUnits(filter);
  }
  async getBusinessUnits(filter = {}) {
    try {
      const pool = await db.getPool();
      let query = 'SELECT * FROM BusinessUnits';

      if (!filter.includeInactive) {
        query += ' WHERE IsActive = 1';
      }

      query += ' ORDER BY Name';

      const result = await pool.request().query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting Business Units:', error);
      throw error;
    }
  }

  /**
   * Get Business Unit by ID
   * @param {string} businessUnitId - Business Unit ID
   * @returns {Promise<Object>} Business Unit
   */
  async getBusinessUnitById(businessUnitId) {
    try {
      const pool = await db.getPool();
      const result = await pool.request()
        .input('businessUnitId', sql.UniqueIdentifier, businessUnitId)
        .query('SELECT * FROM BusinessUnits WHERE BusinessUnitId = @businessUnitId');

      if (result.recordset.length === 0) {
        throw new NotFoundError('Business Unit not found');
      }

      return result.recordset[0];
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error getting Business Unit:', error);
      throw error;
    }
  }
}

const businessUnitService = new BusinessUnitService();

module.exports = businessUnitService;
module.exports.BusinessUnitService = BusinessUnitService;
module.exports.ValidationError = ValidationError;
module.exports.ConflictError = ConflictError;
module.exports.NotFoundError = NotFoundError;


