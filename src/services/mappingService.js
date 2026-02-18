const sql = require('mssql');
const db = require('../database/connection');
const logger = require('../config/logger');
const BaseRepository = require('./baseRepository');

/**
 * Mapping Service for managing Function-Application and Application-Department relationships
 * Supports single and multi-select operations with entity validation
 */
class MappingService {
  constructor() {
    this.functionAppRepo = new BaseRepository('FunctionApplicationMappings', 'MappingId');
    this.appDeptRepo = new BaseRepository('ApplicationDepartmentMappings', 'MappingId');
  }

  // ==================== Function-Application Mapping ====================

  /**
   * Create a single Function-Application mapping
   * @param {string} functionId - Function UUID
   * @param {string} applicationId - Application UUID
   * @param {string} [createdBy] - User ID who created the mapping
   * @returns {Promise<Object>} Created mapping
   */
  async createFunctionAppMapping(functionId, applicationId, createdBy = null) {
    try {
      // Validate entities exist
      await this._validateFunctionExists(functionId);
      await this._validateApplicationExists(applicationId);

      // Check for duplicate
      const existing = await this.functionAppRepo.findAll({
        FunctionId: functionId,
        ApplicationId: applicationId
      });

      if (existing.length > 0) {
        throw new Error('Mapping already exists for this Function-Application pair');
      }

      const mapping = await this.functionAppRepo.create({
        FunctionId: functionId,
        ApplicationId: applicationId,
        CreatedBy: createdBy
      });

      logger.info('Function-Application mapping created', { functionId, applicationId });
      return mapping;
    } catch (error) {
      logger.error('Error creating Function-Application mapping:', error);
      throw error;
    }
  }

  /**
   * Create multiple Function-Application mappings (multi-select)
   * @param {string} functionId - Function UUID
   * @param {string[]} applicationIds - Array of Application UUIDs
   * @param {string} [createdBy] - User ID who created the mappings
   * @returns {Promise<Object>} Result with created and skipped mappings
   */
  async createMultipleFunctionAppMappings(functionId, applicationIds, createdBy = null) {
    const pool = await db.getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Validate function exists
      await this._validateFunctionExists(functionId, transaction);

      const created = [];
      const skipped = [];

      for (const applicationId of applicationIds) {
        try {
          // Validate application exists
          await this._validateApplicationExists(applicationId, transaction);

          // Check for duplicate
          const existing = await this.functionAppRepo.findAll(
            { FunctionId: functionId, ApplicationId: applicationId },
            transaction
          );

          if (existing.length > 0) {
            skipped.push({ applicationId, reason: 'Already exists' });
            continue;
          }

          const mapping = await this.functionAppRepo.create(
            {
              FunctionId: functionId,
              ApplicationId: applicationId,
              CreatedBy: createdBy
            },
            transaction
          );

          created.push(mapping);
        } catch (error) {
          skipped.push({ applicationId, reason: error.message });
        }
      }

      await transaction.commit();
      logger.info('Multiple Function-Application mappings created', {
        functionId,
        created: created.length,
        skipped: skipped.length
      });

      return { created, skipped };
    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating multiple Function-Application mappings:', error);
      throw error;
    }
  }

  /**
   * Delete a Function-Application mapping by mapping ID
   * @param {string} mappingId - Mapping UUID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteFunctionAppMapping(mappingId) {
    try {
      const deleted = await this.functionAppRepo.delete(mappingId);
      if (!deleted) {
        throw new Error('Mapping not found');
      }
      logger.info('Function-Application mapping deleted', { mappingId });
      return true;
    } catch (error) {
      logger.error('Error deleting Function-Application mapping:', error);
      throw error;
    }
  }

  /**
   * Delete a Function-Application mapping by entity IDs
   * @param {string} functionId - Function UUID
   * @param {string} applicationId - Application UUID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteFunctionAppMappingByEntities(functionId, applicationId) {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      request.input('functionId', functionId);
      request.input('applicationId', applicationId);

      const result = await request.query(`
        DELETE FROM FunctionApplicationMappings
        WHERE FunctionId = @functionId AND ApplicationId = @applicationId
      `);

      if (result.rowsAffected[0] === 0) {
        throw new Error('Mapping not found');
      }

      logger.info('Function-Application mapping deleted by entities', { functionId, applicationId });
      return true;
    } catch (error) {
      logger.error('Error deleting Function-Application mapping by entities:', error);
      throw error;
    }
  }

  /**
   * Get all Function-Application mappings
   * @returns {Promise<Array>} Array of mappings
   */
  async getFunctionAppMappings() {
    try {
      const mappings = await this.functionAppRepo.findAll();
      return mappings;
    } catch (error) {
      logger.error('Error getting Function-Application mappings:', error);
      throw error;
    }
  }

  /**
   * Get Function-Application mappings with detailed information (tags)
   * @returns {Promise<Array>} Array of mappings with function and application details
   */
  async getFunctionAppMappingsWithDetails() {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      const result = await request.query(`
        SELECT 
          f.FunctionId,
          f.FunctionCode,
          f.FunctionName,
          a.ApplicationId,
          a.ApplicationCode,
          a.ApplicationName,
          fam.MappingId,
          fam.CreatedAt
        FROM FunctionApplicationMappings fam
        INNER JOIN Functions f ON fam.FunctionId = f.FunctionId
        INNER JOIN Applications a ON fam.ApplicationId = a.ApplicationId
        WHERE f.IsActive = 1 AND a.IsActive = 1
        ORDER BY f.FunctionName, a.ApplicationName
      `);

      // Group by function with applications as tags
      const grouped = {};
      result.recordset.forEach(row => {
        if (!grouped[row.FunctionId]) {
          grouped[row.FunctionId] = {
            functionId: row.FunctionId,
            functionCode: row.FunctionCode,
            functionName: row.FunctionName,
            applications: []
          };
        }
        grouped[row.FunctionId].applications.push({
          mappingId: row.MappingId,
          applicationId: row.ApplicationId,
          applicationCode: row.ApplicationCode,
          applicationName: row.ApplicationName,
          createdAt: row.CreatedAt
        });
      });

      return Object.values(grouped);
    } catch (error) {
      logger.error('Error getting Function-Application mappings with details:', error);
      throw error;
    }
  }

  /**
   * Get applications mapped to a specific function
   * @param {string} functionId - Function UUID
   * @returns {Promise<Array>} Array of applications
   */
  async getApplicationsByFunction(functionId) {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      request.input('functionId', functionId);

      const result = await request.query(`
        SELECT 
          a.ApplicationId,
          a.ApplicationCode,
          a.ApplicationName,
          a.Description,
          fam.MappingId
        FROM FunctionApplicationMappings fam
        INNER JOIN Applications a ON fam.ApplicationId = a.ApplicationId
        WHERE fam.FunctionId = @functionId AND a.IsActive = 1
        ORDER BY a.ApplicationName
      `);

      return result.recordset;
    } catch (error) {
      logger.error('Error getting applications by function:', error);
      throw error;
    }
  }

  /**
   * Get functions mapped to a specific application
   * @param {string} applicationId - Application UUID
   * @returns {Promise<Array>} Array of functions
   */
  async getFunctionsByApplication(applicationId) {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      request.input('applicationId', applicationId);

      const result = await request.query(`
        SELECT 
          f.FunctionId,
          f.FunctionCode,
          f.FunctionName,
          fam.MappingId
        FROM FunctionApplicationMappings fam
        INNER JOIN Functions f ON fam.FunctionId = f.FunctionId
        WHERE fam.ApplicationId = @applicationId AND f.IsActive = 1
        ORDER BY f.FunctionName
      `);

      return result.recordset;
    } catch (error) {
      logger.error('Error getting functions by application:', error);
      throw error;
    }
  }

  // ==================== Application-Department Mapping ====================

  /**
   * Create a single Application-Department mapping
   * @param {string} applicationId - Application UUID
   * @param {string} departmentId - Department UUID
   * @param {string} [createdBy] - User ID who created the mapping
   * @returns {Promise<Object>} Created mapping
   */
  async createAppDeptMapping(applicationId, departmentId, createdBy = null) {
    try {
      // Validate entities exist
      await this._validateApplicationExists(applicationId);
      await this._validateDepartmentExists(departmentId);

      // Check for duplicate
      const existing = await this.appDeptRepo.findAll({
        ApplicationId: applicationId,
        DepartmentId: departmentId
      });

      if (existing.length > 0) {
        throw new Error('Mapping already exists for this Application-Department pair');
      }

      const mapping = await this.appDeptRepo.create({
        ApplicationId: applicationId,
        DepartmentId: departmentId,
        CreatedBy: createdBy
      });

      logger.info('Application-Department mapping created', { applicationId, departmentId });
      return mapping;
    } catch (error) {
      logger.error('Error creating Application-Department mapping:', error);
      throw error;
    }
  }

  /**
   * Create multiple Application-Department mappings (multi-select)
   * @param {string} departmentId - Department UUID
   * @param {string[]} applicationIds - Array of Application UUIDs
   * @param {string} [createdBy] - User ID who created the mappings
   * @returns {Promise<Object>} Result with created and skipped mappings
   */
  async createMultipleAppDeptMappings(departmentId, applicationIds, createdBy = null) {
    const pool = await db.getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Validate department exists
      await this._validateDepartmentExists(departmentId, transaction);

      const created = [];
      const skipped = [];

      for (const applicationId of applicationIds) {
        try {
          // Validate application exists
          await this._validateApplicationExists(applicationId, transaction);

          // Check for duplicate
          const existing = await this.appDeptRepo.findAll(
            { ApplicationId: applicationId, DepartmentId: departmentId },
            transaction
          );

          if (existing.length > 0) {
            skipped.push({ applicationId, reason: 'Already exists' });
            continue;
          }

          const mapping = await this.appDeptRepo.create(
            {
              ApplicationId: applicationId,
              DepartmentId: departmentId,
              CreatedBy: createdBy
            },
            transaction
          );

          created.push(mapping);
        } catch (error) {
          skipped.push({ applicationId, reason: error.message });
        }
      }

      await transaction.commit();
      logger.info('Multiple Application-Department mappings created', {
        departmentId,
        created: created.length,
        skipped: skipped.length
      });

      return { created, skipped };
    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating multiple Application-Department mappings:', error);
      throw error;
    }
  }

  /**
   * Delete an Application-Department mapping by mapping ID
   * @param {string} mappingId - Mapping UUID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteAppDeptMapping(mappingId) {
    try {
      const deleted = await this.appDeptRepo.delete(mappingId);
      if (!deleted) {
        throw new Error('Mapping not found');
      }
      logger.info('Application-Department mapping deleted', { mappingId });
      return true;
    } catch (error) {
      logger.error('Error deleting Application-Department mapping:', error);
      throw error;
    }
  }

  /**
   * Delete an Application-Department mapping by entity IDs
   * @param {string} applicationId - Application UUID
   * @param {string} departmentId - Department UUID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteAppDeptMappingByEntities(applicationId, departmentId) {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      request.input('applicationId', applicationId);
      request.input('departmentId', departmentId);

      const result = await request.query(`
        DELETE FROM ApplicationDepartmentMappings
        WHERE ApplicationId = @applicationId AND DepartmentId = @departmentId
      `);

      if (result.rowsAffected[0] === 0) {
        throw new Error('Mapping not found');
      }

      logger.info('Application-Department mapping deleted by entities', { applicationId, departmentId });
      return true;
    } catch (error) {
      logger.error('Error deleting Application-Department mapping by entities:', error);
      throw error;
    }
  }

  /**
   * Get all Application-Department mappings
   * @returns {Promise<Array>} Array of mappings
   */
  async getAppDeptMappings() {
    try {
      const mappings = await this.appDeptRepo.findAll();
      return mappings;
    } catch (error) {
      logger.error('Error getting Application-Department mappings:', error);
      throw error;
    }
  }

  /**
   * Get Application-Department mappings with hierarchical structure
   * @returns {Promise<Array>} Array of hierarchical mappings (BU -> Division -> Department -> Applications)
   */
  async getAppDeptMappingsHierarchical() {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      const result = await request.query(`
        SELECT 
          bu.BusinessUnitId,
          bu.BusinessUnitCode,
          bu.BusinessUnitName,
          div.DivisionId,
          div.DivisionCode,
          div.DivisionName,
          dept.DepartmentId,
          dept.DepartmentCode,
          dept.DepartmentName,
          a.ApplicationId,
          a.ApplicationCode,
          a.ApplicationName,
          adm.MappingId,
          adm.CreatedAt
        FROM ApplicationDepartmentMappings adm
        INNER JOIN Applications a ON adm.ApplicationId = a.ApplicationId
        INNER JOIN Departments dept ON adm.DepartmentId = dept.DepartmentId
        INNER JOIN Divisions div ON dept.DivisionId = div.DivisionId
        INNER JOIN BusinessUnits bu ON div.BusinessUnitId = bu.BusinessUnitId
        WHERE a.IsActive = 1 AND dept.IsActive = 1 AND div.IsActive = 1 AND bu.IsActive = 1
        ORDER BY bu.BusinessUnitName, div.DivisionName, dept.DepartmentName, a.ApplicationName
      `);

      // Group hierarchically: BU -> Division -> Department -> Applications
      const grouped = {};
      
      result.recordset.forEach(row => {
        // Business Unit level
        if (!grouped[row.BusinessUnitId]) {
          grouped[row.BusinessUnitId] = {
            businessUnitId: row.BusinessUnitId,
            businessUnitCode: row.BusinessUnitCode,
            businessUnitName: row.BusinessUnitName,
            divisions: {}
          };
        }

        // Division level
        const bu = grouped[row.BusinessUnitId];
        if (!bu.divisions[row.DivisionId]) {
          bu.divisions[row.DivisionId] = {
            divisionId: row.DivisionId,
            divisionCode: row.DivisionCode,
            divisionName: row.DivisionName,
            departments: {}
          };
        }

        // Department level
        const div = bu.divisions[row.DivisionId];
        if (!div.departments[row.DepartmentId]) {
          div.departments[row.DepartmentId] = {
            departmentId: row.DepartmentId,
            departmentCode: row.DepartmentCode,
            departmentName: row.DepartmentName,
            applications: []
          };
        }

        // Application level
        div.departments[row.DepartmentId].applications.push({
          mappingId: row.MappingId,
          applicationId: row.ApplicationId,
          applicationCode: row.ApplicationCode,
          applicationName: row.ApplicationName,
          createdAt: row.CreatedAt
        });
      });

      // Convert nested objects to arrays
      const hierarchy = Object.values(grouped).map(bu => ({
        ...bu,
        divisions: Object.values(bu.divisions).map(div => ({
          ...div,
          departments: Object.values(div.departments)
        }))
      }));

      return hierarchy;
    } catch (error) {
      logger.error('Error getting Application-Department mappings hierarchically:', error);
      throw error;
    }
  }

  /**
   * Get applications mapped to a specific department
   * @param {string} departmentId - Department UUID
   * @returns {Promise<Array>} Array of applications
   */
  async getApplicationsByDepartment(departmentId) {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      request.input('departmentId', departmentId);

      const result = await request.query(`
        SELECT 
          a.ApplicationId,
          a.ApplicationCode,
          a.ApplicationName,
          a.Description,
          adm.MappingId
        FROM ApplicationDepartmentMappings adm
        INNER JOIN Applications a ON adm.ApplicationId = a.ApplicationId
        WHERE adm.DepartmentId = @departmentId AND a.IsActive = 1
        ORDER BY a.ApplicationName
      `);

      return result.recordset;
    } catch (error) {
      logger.error('Error getting applications by department:', error);
      throw error;
    }
  }

  /**
   * Get departments mapped to a specific application
   * @param {string} applicationId - Application UUID
   * @returns {Promise<Array>} Array of departments
   */
  async getDepartmentsByApplication(applicationId) {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      request.input('applicationId', applicationId);

      const result = await request.query(`
        SELECT 
          dept.DepartmentId,
          dept.DepartmentCode,
          dept.DepartmentName,
          adm.MappingId
        FROM ApplicationDepartmentMappings adm
        INNER JOIN Departments dept ON adm.DepartmentId = dept.DepartmentId
        WHERE adm.ApplicationId = @applicationId AND dept.IsActive = 1
        ORDER BY dept.DepartmentName
      `);

      return result.recordset;
    } catch (error) {
      logger.error('Error getting departments by application:', error);
      throw error;
    }
  }
  /**
   * Get departments mapped to a specific application
   * @param {string} applicationId - Application UUID
   * @returns {Promise<Array>} Array of departments
   */
  async getDepartmentsByApplication(applicationId) {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      request.input('applicationId', applicationId);

      const result = await request.query(`
        SELECT
          dept.DepartmentId,
          dept.DepartmentCode,
          dept.DepartmentName,
          adm.MappingId
        FROM ApplicationDepartmentMappings adm
        INNER JOIN Departments dept ON adm.DepartmentId = dept.DepartmentId
        WHERE adm.ApplicationId = @applicationId AND dept.IsActive = 1
        ORDER BY dept.DepartmentName
      `);

      return result.recordset;
    } catch (error) {
      logger.error('Error getting departments by application:', error);
      throw error;
    }
  }

  // ==================== Export Functionality ====================

  /**
   * Export Function-Application mappings to CSV format
   * @returns {Promise<string>} CSV string
   */
  async exportFunctionAppMappingsToCSV() {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      const result = await request.query(`
        SELECT
          f.FunctionCode,
          f.FunctionName,
          a.ApplicationCode,
          a.ApplicationName,
          fam.CreatedAt
        FROM FunctionApplicationMappings fam
        INNER JOIN Functions f ON fam.FunctionId = f.FunctionId
        INNER JOIN Applications a ON fam.ApplicationId = a.ApplicationId
        WHERE f.IsActive = 1 AND a.IsActive = 1
        ORDER BY f.FunctionName, a.ApplicationName
      `);

      // Build CSV
      const headers = ['Function Code', 'Function Name', 'Application Code', 'Application Name', 'Created At'];
      const rows = result.recordset.map(row => [
        this._escapeCsvValue(row.FunctionCode),
        this._escapeCsvValue(row.FunctionName),
        this._escapeCsvValue(row.ApplicationCode),
        this._escapeCsvValue(row.ApplicationName),
        this._formatDate(row.CreatedAt)
      ]);

      const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

      logger.info('Function-Application mappings exported to CSV');
      return csv;
    } catch (error) {
      logger.error('Error exporting Function-Application mappings to CSV:', error);
      throw error;
    }
  }

  /**
   * Export Application-Department mappings to CSV format
   * @returns {Promise<string>} CSV string
   */
  async exportAppDeptMappingsToCSV() {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      const result = await request.query(`
        SELECT
          bu.BusinessUnitCode,
          bu.BusinessUnitName,
          div.DivisionCode,
          div.DivisionName,
          dept.DepartmentCode,
          dept.DepartmentName,
          a.ApplicationCode,
          a.ApplicationName,
          adm.CreatedAt
        FROM ApplicationDepartmentMappings adm
        INNER JOIN Applications a ON adm.ApplicationId = a.ApplicationId
        INNER JOIN Departments dept ON adm.DepartmentId = dept.DepartmentId
        INNER JOIN Divisions div ON dept.DivisionId = div.DivisionId
        INNER JOIN BusinessUnits bu ON div.BusinessUnitId = bu.BusinessUnitId
        WHERE a.IsActive = 1 AND dept.IsActive = 1 AND div.IsActive = 1 AND bu.IsActive = 1
        ORDER BY bu.BusinessUnitName, div.DivisionName, dept.DepartmentName, a.ApplicationName
      `);

      // Build CSV
      const headers = [
        'Business Unit Code',
        'Business Unit Name',
        'Division Code',
        'Division Name',
        'Department Code',
        'Department Name',
        'Application Code',
        'Application Name',
        'Created At'
      ];

      const rows = result.recordset.map(row => [
        this._escapeCsvValue(row.BusinessUnitCode),
        this._escapeCsvValue(row.BusinessUnitName),
        this._escapeCsvValue(row.DivisionCode),
        this._escapeCsvValue(row.DivisionName),
        this._escapeCsvValue(row.DepartmentCode),
        this._escapeCsvValue(row.DepartmentName),
        this._escapeCsvValue(row.ApplicationCode),
        this._escapeCsvValue(row.ApplicationName),
        this._formatDate(row.CreatedAt)
      ]);

      const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

      logger.info('Application-Department mappings exported to CSV');
      return csv;
    } catch (error) {
      logger.error('Error exporting Application-Department mappings to CSV:', error);
      throw error;
    }
  }

  // ==================== CSV Helper Methods ====================

  /**
   * Escape CSV value (handle commas, quotes, newlines)
   * @private
   */
  _escapeCsvValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  /**
   * Format date for CSV export
   * @private
   */
  _formatDate(date) {
    if (!date) return '';

    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  // ==================== Validation Helpers ====================

  /**
   * Validate that a function exists
   * @private
   */
  async _validateFunctionExists(functionId, transaction = null) {
    const pool = await db.getPool();
    let request;
    
    if (transaction) {
      request = new sql.Request(transaction);
    } else {
      request = pool.request();
    }

    request.input('functionId', functionId);
    const result = await request.query(`
      SELECT FunctionId FROM Functions WHERE FunctionId = @functionId AND IsActive = 1
    `);

    if (result.recordset.length === 0) {
      throw new Error('Function not found or inactive');
    }
  }

  /**
   * Validate that an application exists
   * @private
   */
  async _validateApplicationExists(applicationId, transaction = null) {
    const pool = await db.getPool();
    let request;
    
    if (transaction) {
      request = new sql.Request(transaction);
    } else {
      request = pool.request();
    }

    request.input('applicationId', applicationId);
    const result = await request.query(`
      SELECT ApplicationId FROM Applications WHERE ApplicationId = @applicationId AND IsActive = 1
    `);

    if (result.recordset.length === 0) {
      throw new Error('Application not found or inactive');
    }
  }

  /**
   * Validate that a department exists
   * @private
   */
  async _validateDepartmentExists(departmentId, transaction = null) {
    const pool = await db.getPool();
    let request;
    
    if (transaction) {
      request = new sql.Request(transaction);
    } else {
      request = pool.request();
    }

    request.input('departmentId', departmentId);
    const result = await request.query(`
      SELECT DepartmentId FROM Departments WHERE DepartmentId = @departmentId AND IsActive = 1
    `);

    if (result.recordset.length === 0) {
      throw new Error('Department not found or inactive');
    }
  }
}

module.exports = new MappingService();
