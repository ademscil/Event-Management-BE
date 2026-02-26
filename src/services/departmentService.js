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
 * Department Service with hierarchical validation
 */
class DepartmentService {
  constructor() {
    this.repository = new BaseRepository('Departments', 'DepartmentId');
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
   * Create a new Department
   * @param {Object} data - Department data
   * @param {string} data.divisionId - Parent Division ID (required)
   * @param {string} data.code - Unique code (2-20 chars, alphanumeric + hyphen)
   * @param {string} data.name - Department name (1-200 chars)
   * @returns {Promise<Object>} Created Department
   */
  async createDepartment(data) {
    try {
      // Validate required parent
      if (!data.divisionId) {
        throw new ValidationError('Division ID is required');
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

      // Validate that Division exists and is active
      const divCheck = await pool.request()
        .input('divisionId', sql.UniqueIdentifier, data.divisionId)
        .query('SELECT DivisionId FROM Divisions WHERE DivisionId = @divisionId AND IsActive = 1');

      if (divCheck.recordset.length === 0) {
        throw new ValidationError('Parent Division does not exist or is inactive');
      }

      // Check for duplicate code
      const codeCheck = await pool.request()
        .input('code', sql.NVarChar(20), data.code)
        .query('SELECT DepartmentId FROM Departments WHERE Code = @code');

      if (codeCheck.recordset.length > 0) {
        throw new ConflictError(`Department with code '${data.code}' already exists`);
      }

      // Create Department
      const result = await pool.request()
        .input('divisionId', sql.UniqueIdentifier, data.divisionId)
        .input('code', sql.NVarChar(20), data.code)
        .input('name', sql.NVarChar(200), data.name)
        .query(`
          INSERT INTO Departments (DivisionId, Code, Name, IsActive, CreatedAt)
          OUTPUT INSERTED.*
          VALUES (@divisionId, @code, @name, 1, GETDATE())
        `);

      logger.info('Department created', { code: data.code, divisionId: data.divisionId });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError') {
        throw error;
      }
      logger.error('Error creating Department:', error);
      throw error;
    }
  }

  /**
   * Update Department
   * @param {string} departmentId - Department ID
   * @param {Object} data - Updated data
   * @returns {Promise<Object>} Updated Department
   */
  async updateDepartment(departmentId, data) {
    try {
      const pool = await db.getPool();

      // Check if Department exists
      const deptCheck = await pool.request()
        .input('departmentId', sql.UniqueIdentifier, departmentId)
        .query('SELECT DepartmentId FROM Departments WHERE DepartmentId = @departmentId');

      if (deptCheck.recordset.length === 0) {
        throw new NotFoundError('Department not found');
      }

      // Validate Division if being changed
      if (data.divisionId) {
        const divCheck = await pool.request()
          .input('divisionId', sql.UniqueIdentifier, data.divisionId)
          .query('SELECT DivisionId FROM Divisions WHERE DivisionId = @divisionId AND IsActive = 1');

        if (divCheck.recordset.length === 0) {
          throw new ValidationError('Parent Division does not exist or is inactive');
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
          .input('departmentId', sql.UniqueIdentifier, departmentId)
          .query('SELECT DepartmentId FROM Departments WHERE Code = @code AND DepartmentId != @departmentId');

        if (codeCheck.recordset.length > 0) {
          throw new ConflictError(`Department with code '${data.code}' already exists`);
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
      request.input('departmentId', sql.UniqueIdentifier, departmentId);

      if (data.divisionId !== undefined) {
        updateFields.push('DivisionId = @divisionId');
        request.input('divisionId', sql.UniqueIdentifier, data.divisionId);
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
        UPDATE Departments
        SET ${updateFields.join(', ')}
        OUTPUT INSERTED.*
        WHERE DepartmentId = @departmentId
      `);

      logger.info('Department updated', { departmentId });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating Department:', error);
      throw error;
    }
  }

  /**
   * Delete Department (with dependency check)
   * @param {string} departmentId - Department ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteDepartment(departmentId) {
    try {
      const pool = await db.getPool();

      // Check if Department exists
      const deptCheck = await pool.request()
        .input('departmentId', sql.UniqueIdentifier, departmentId)
        .query('SELECT DepartmentId FROM Departments WHERE DepartmentId = @departmentId');

      if (deptCheck.recordset.length === 0) {
        throw new NotFoundError('Department not found');
      }

      // Check for dependent mappings
      const mappingCheck = await pool.request()
        .input('departmentId', sql.UniqueIdentifier, departmentId)
        .query('SELECT COUNT(*) as count FROM ApplicationDepartmentMappings WHERE DepartmentId = @departmentId');

      if (mappingCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot delete Department: associated Application mappings exist');
      }

      // Check for dependent survey responses
      const responseCheck = await pool.request()
        .input('departmentId', sql.UniqueIdentifier, departmentId)
        .query('SELECT COUNT(*) as count FROM Responses WHERE DepartmentId = @departmentId');

      if (responseCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot delete Department: associated survey responses exist');
      }

      // Delete Department
      const result = await pool.request()
        .input('departmentId', sql.UniqueIdentifier, departmentId)
        .query('DELETE FROM Departments WHERE DepartmentId = @departmentId');

      logger.info('Department deleted', { departmentId });
      return result.rowsAffected[0] > 0;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error deleting Department:', error);
      throw error;
    }
  }

  /**
   * Get Departments by Division
   * @param {string} divisionId - Division ID
   * @param {Object} [filter] - Filter options
   * @param {boolean} [filter.includeInactive=false] - Include inactive Departments
   * @returns {Promise<Array>} Array of Departments
   */
  async getDepartmentsByDivision(divisionId, filter = {}) {
    try {
      const pool = await db.getPool();
      const request = pool.request();
      request.input('divisionId', sql.UniqueIdentifier, divisionId);

      let query = 'SELECT * FROM Departments WHERE DivisionId = @divisionId';

      if (!filter.includeInactive) {
        query += ' AND IsActive = 1';
      }

      query += ' ORDER BY Name';

      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting Departments:', error);
      throw error;
    }
  }

  /**
   * Get all Departments
   * @param {Object} [filter] - Filter options
   * @param {boolean} [filter.includeInactive=false] - Include inactive Departments
   * @returns {Promise<Array>} Array of Departments
   */

  /**
   * Backward-compatible alias
   * @param {Object} [filter] - Filter options
   * @returns {Promise<Array>} Array of Departments
   */
  async getAllDepartments(filter = {}) {
    return this.getDepartments(filter);
  }
  async getDepartments(filter = {}) {
    try {
      const pool = await db.getPool();
      let query = 'SELECT * FROM Departments';

      if (!filter.includeInactive) {
        query += ' WHERE IsActive = 1';
      }

      query += ' ORDER BY Name';

      const result = await pool.request().query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting Departments:', error);
      throw error;
    }
  }

  /**
   * Get Department by ID
   * @param {string} departmentId - Department ID
   * @returns {Promise<Object>} Department
   */
  async getDepartmentById(departmentId) {
    try {
      const pool = await db.getPool();
      const result = await pool.request()
        .input('departmentId', sql.UniqueIdentifier, departmentId)
        .query('SELECT * FROM Departments WHERE DepartmentId = @departmentId');

      if (result.recordset.length === 0) {
        throw new NotFoundError('Department not found');
      }

      return result.recordset[0];
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error getting Department:', error);
      throw error;
    }
  }

  /**
   * Verify hierarchical integrity for a department
   * @param {string} departmentId - Department ID
   * @returns {Promise<Object>} Complete hierarchy information
   */
  async verifyDepartmentHierarchy(departmentId) {
    try {
      const pool = await db.getPool();
      const result = await pool.request()
        .input('departmentId', sql.UniqueIdentifier, departmentId)
        .query(`
          SELECT 
            d.DepartmentId,
            d.Code AS DepartmentCode,
            d.Name AS DepartmentName,
            div.DivisionId,
            div.Code AS DivisionCode,
            div.Name AS DivisionName,
            bu.BusinessUnitId,
            bu.Code AS BusinessUnitCode,
            bu.Name AS BusinessUnitName
          FROM Departments d
          INNER JOIN Divisions div ON d.DivisionId = div.DivisionId
          INNER JOIN BusinessUnits bu ON div.BusinessUnitId = bu.BusinessUnitId
          WHERE d.DepartmentId = @departmentId
        `);

      if (result.recordset.length === 0) {
        throw new ValidationError('Department hierarchy is broken or department does not exist');
      }

      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw error;
      }
      logger.error('Error verifying department hierarchy:', error);
      throw error;
    }
  }
}

const departmentService = new DepartmentService();

module.exports = departmentService;
module.exports.DepartmentService = DepartmentService;
module.exports.ValidationError = ValidationError;
module.exports.ConflictError = ConflictError;
module.exports.NotFoundError = NotFoundError;

