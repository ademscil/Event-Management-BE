const sql = require('mssql');
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
 * Master Data Service for CRUD operations on organizational entities
 */
class MasterDataService {
  /**
   * Create a new Business Unit
   * @param {Object} data - Business Unit data
   * @param {string} data.code - Unique code
   * @param {string} data.name - Business Unit name
   * @returns {Promise<Object>} Created Business Unit
   */
  async createBusinessUnit(data) {
    try {
      const pool = await db.getPool();
      const result = await pool.request()
        .input('code', sql.NVarChar(20), data.code)
        .input('name', sql.NVarChar(200), data.name)
        .query(`
          INSERT INTO BusinessUnits (Code, Name, IsActive, CreatedAt)
          OUTPUT INSERTED.*
          VALUES (@code, @name, 1, GETDATE())
        `);

      logger.info('Business Unit created', { code: data.code });
      return result.recordset[0];
    } catch (error) {
      if (error.number === 2627 || error.number === 2601) {
        throw new ConflictError(`Business Unit with code '${data.code}' already exists`);
      }
      logger.error('Error creating Business Unit:', error);
      throw error;
    }
  }

  /**
   * Get Business Unit by ID
   * @param {string} businessUnitId - Business Unit ID
   * @returns {Promise<Object>} Business Unit
   */
  async getBusinessUnitById(businessUnitId) {
    const pool = await db.getPool();
    const result = await pool.request()
      .input('businessUnitId', sql.UniqueIdentifier, businessUnitId)
      .query('SELECT * FROM BusinessUnits WHERE BusinessUnitId = @businessUnitId');

    if (result.recordset.length === 0) {
      throw new NotFoundError('Business Unit not found');
    }

    return result.recordset[0];
  }

  /**
   * Create a new Division
   * @param {Object} data - Division data
   * @param {string} data.businessUnitId - Parent Business Unit ID
   * @param {string} data.code - Unique code
   * @param {string} data.name - Division name
   * @returns {Promise<Object>} Created Division
   */
  async createDivision(data) {
    try {
      // Validate that Business Unit exists
      const pool = await db.getPool();
      const buCheck = await pool.request()
        .input('businessUnitId', sql.UniqueIdentifier, data.businessUnitId)
        .query('SELECT BusinessUnitId FROM BusinessUnits WHERE BusinessUnitId = @businessUnitId AND IsActive = 1');

      if (buCheck.recordset.length === 0) {
        throw new ValidationError('Parent Business Unit does not exist or is inactive');
      }

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
      if (error.name === 'ValidationError') {
        throw error;
      }
      if (error.number === 2627 || error.number === 2601) {
        throw new ConflictError(`Division with code '${data.code}' already exists`);
      }
      if (error.number === 547) {
        throw new ValidationError('Parent Business Unit does not exist');
      }
      logger.error('Error creating Division:', error);
      throw error;
    }
  }

  /**
   * Get Division by ID
   * @param {string} divisionId - Division ID
   * @returns {Promise<Object>} Division
   */
  async getDivisionById(divisionId) {
    const pool = await db.getPool();
    const result = await pool.request()
      .input('divisionId', sql.UniqueIdentifier, divisionId)
      .query('SELECT * FROM Divisions WHERE DivisionId = @divisionId');

    if (result.recordset.length === 0) {
      throw new NotFoundError('Division not found');
    }

    return result.recordset[0];
  }

  /**
   * Create a new Department
   * @param {Object} data - Department data
   * @param {string} data.divisionId - Parent Division ID
   * @param {string} data.code - Unique code
   * @param {string} data.name - Department name
   * @returns {Promise<Object>} Created Department
   */
  async createDepartment(data) {
    try {
      // Validate that Division exists
      const pool = await db.getPool();
      const divCheck = await pool.request()
        .input('divisionId', sql.UniqueIdentifier, data.divisionId)
        .query('SELECT DivisionId FROM Divisions WHERE DivisionId = @divisionId AND IsActive = 1');

      if (divCheck.recordset.length === 0) {
        throw new ValidationError('Parent Division does not exist or is inactive');
      }

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
      if (error.name === 'ValidationError') {
        throw error;
      }
      if (error.number === 2627 || error.number === 2601) {
        throw new ConflictError(`Department with code '${data.code}' already exists`);
      }
      if (error.number === 547) {
        throw new ValidationError('Parent Division does not exist');
      }
      logger.error('Error creating Department:', error);
      throw error;
    }
  }

  /**
   * Get Department by ID
   * @param {string} departmentId - Department ID
   * @returns {Promise<Object>} Department
   */
  async getDepartmentById(departmentId) {
    const pool = await db.getPool();
    const result = await pool.request()
      .input('departmentId', sql.UniqueIdentifier, departmentId)
      .query('SELECT * FROM Departments WHERE DepartmentId = @departmentId');

    if (result.recordset.length === 0) {
      throw new NotFoundError('Department not found');
    }

    return result.recordset[0];
  }

  /**
   * Verify hierarchical integrity for a department
   * @param {string} departmentId - Department ID
   * @returns {Promise<Object>} Hierarchy information
   */
  async verifyDepartmentHierarchy(departmentId) {
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
  }
}

module.exports = { 
  MasterDataService, 
  ValidationError, 
  ConflictError, 
  NotFoundError 
};
