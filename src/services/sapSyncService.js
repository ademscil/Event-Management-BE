const sapClient = require('./sapClient');
const { BusinessUnitService } = require('./businessUnitService');
const { DivisionService } = require('./divisionService');
const { DepartmentService } = require('./departmentService');
const logger = require('../config/logger');
const db = require('../database/connection');
const sql = require('mssql');

/**
 * SAP Sync Service
 * Handles synchronization of organizational data from SAP
 * 
 * @module sapSyncService
 */

/**
 * @typedef {Object} SyncResult
 * @property {boolean} success
 * @property {SyncStatistics} statistics
 * @property {Array<string>} errors
 * @property {Date} timestamp
 */

/**
 * @typedef {Object} SyncStatistics
 * @property {EntityStats} businessUnits
 * @property {EntityStats} divisions
 * @property {EntityStats} departments
 * @property {number} totalProcessed
 * @property {number} totalErrors
 */

/**
 * @typedef {Object} EntityStats
 * @property {number} added
 * @property {number} updated
 * @property {number} deactivated
 * @property {number} errors
 */

class SAPSyncService {
  constructor() {
    this.businessUnitService = new BusinessUnitService();
    this.divisionService = new DivisionService();
    this.departmentService = new DepartmentService();
  }

  /**
   * Initialize sync statistics
   * @private
   * @returns {SyncStatistics}
   */
  _initializeStats() {
    return {
      businessUnits: { added: 0, updated: 0, deactivated: 0, errors: 0 },
      divisions: { added: 0, updated: 0, deactivated: 0, errors: 0 },
      departments: { added: 0, updated: 0, deactivated: 0, errors: 0 },
      totalProcessed: 0,
      totalErrors: 0
    };
  }

  /**
   * Sync all organizational data from SAP
   * @returns {Promise<SyncResult>}
   */
  async syncOrganizationalData() {
    const startTime = new Date();
    const stats = this._initializeStats();
    const errors = [];

    logger.info('Starting SAP organizational data sync...');

    try {
      // Test SAP connection first
      const connectionTest = await sapClient.testConnection();
      if (!connectionTest.success) {
        throw new Error(`SAP connection failed: ${connectionTest.error}`);
      }

      // Sync Business Units
      logger.info('Syncing Business Units from SAP...');
      const buResult = await this._syncBusinessUnits();
      stats.businessUnits = buResult.stats;
      errors.push(...buResult.errors);

      // Sync Divisions
      logger.info('Syncing Divisions from SAP...');
      const divResult = await this._syncDivisions();
      stats.divisions = divResult.stats;
      errors.push(...divResult.errors);

      // Sync Departments
      logger.info('Syncing Departments from SAP...');
      const deptResult = await this._syncDepartments();
      stats.departments = deptResult.stats;
      errors.push(...deptResult.errors);

      // Calculate totals
      stats.totalProcessed = 
        stats.businessUnits.added + stats.businessUnits.updated + stats.businessUnits.deactivated +
        stats.divisions.added + stats.divisions.updated + stats.divisions.deactivated +
        stats.departments.added + stats.departments.updated + stats.departments.deactivated;
      
      stats.totalErrors = 
        stats.businessUnits.errors + stats.divisions.errors + stats.departments.errors;

      const endTime = new Date();
      const duration = (endTime - startTime) / 1000;

      logger.info(`SAP sync completed in ${duration}s`, { stats });

      // Log sync result to database
      await this._logSyncResult(stats, errors, startTime, endTime);

      return {
        success: errors.length === 0,
        statistics: stats,
        errors,
        timestamp: startTime
      };
    } catch (error) {
      logger.error('SAP sync failed:', error);
      errors.push(`Fatal error: ${error.message}`);
      
      return {
        success: false,
        statistics: stats,
        errors,
        timestamp: startTime
      };
    }
  }

  /**
   * Sync Business Units from SAP
   * @private
   * @returns {Promise<Object>}
   */
  async _syncBusinessUnits() {
    const stats = { added: 0, updated: 0, deactivated: 0, errors: 0 };
    const errors = [];

    try {
      // Fetch Business Units from SAP
      const response = await sapClient.fetchBusinessUnits();
      
      if (!response.success) {
        throw new Error(response.error);
      }

      const sapBusinessUnits = response.data.businessUnits || response.data || [];
      logger.info(`Fetched ${sapBusinessUnits.length} Business Units from SAP`);

      // Get existing Business Units from database
      const existingBUs = await this.businessUnitService.getBusinessUnits({ includeInactive: true });
      const existingBUMap = new Map(existingBUs.map(bu => [bu.Code, bu]));

      // Track SAP codes for deactivation logic
      const sapCodes = new Set(sapBusinessUnits.map(bu => bu.code || bu.Code));

      // Process each SAP Business Unit
      for (const sapBU of sapBusinessUnits) {
        try {
          const code = sapBU.code || sapBU.Code;
          const name = sapBU.name || sapBU.Name;

          if (!code || !name) {
            errors.push(`Invalid Business Unit data: missing code or name`);
            stats.errors++;
            continue;
          }

          const existing = existingBUMap.get(code);

          if (existing) {
            // Update if name changed or if it was inactive
            if (existing.Name !== name || !existing.IsActive) {
              await this._updateBusinessUnit(existing.BusinessUnitId, name);
              stats.updated++;
              logger.debug(`Updated Business Unit: ${code}`);
            }
          } else {
            // Create new Business Unit
            await this.businessUnitService.createBusinessUnit({ code, name });
            stats.added++;
            logger.debug(`Added Business Unit: ${code}`);
          }
        } catch (error) {
          errors.push(`Error processing Business Unit ${sapBU.code || sapBU.Code}: ${error.message}`);
          stats.errors++;
        }
      }

      // Deactivate Business Units not in SAP
      for (const existing of existingBUs) {
        if (!sapCodes.has(existing.Code) && existing.IsActive) {
          try {
            await this._deactivateBusinessUnit(existing.BusinessUnitId);
            stats.deactivated++;
            logger.debug(`Deactivated Business Unit: ${existing.Code}`);
          } catch (error) {
            errors.push(`Error deactivating Business Unit ${existing.Code}: ${error.message}`);
            stats.errors++;
          }
        }
      }

    } catch (error) {
      errors.push(`Business Unit sync error: ${error.message}`);
      stats.errors++;
    }

    return { stats, errors };
  }

  /**
   * Sync Divisions from SAP
   * @private
   * @returns {Promise<Object>}
   */
  async _syncDivisions() {
    const stats = { added: 0, updated: 0, deactivated: 0, errors: 0 };
    const errors = [];

    try {
      // Fetch Divisions from SAP
      const response = await sapClient.fetchDivisions();
      
      if (!response.success) {
        throw new Error(response.error);
      }

      const sapDivisions = response.data.divisions || response.data || [];
      logger.info(`Fetched ${sapDivisions.length} Divisions from SAP`);

      // Get existing Divisions and Business Units
      const existingDivisions = await this.divisionService.getDivisions({ includeInactive: true });
      const existingDivMap = new Map(existingDivisions.map(div => [div.Code, div]));
      
      const businessUnits = await this.businessUnitService.getBusinessUnits({ includeInactive: false });
      const buCodeMap = new Map(businessUnits.map(bu => [bu.Code, bu.BusinessUnitId]));

      // Track SAP codes for deactivation logic
      const sapCodes = new Set(sapDivisions.map(div => div.code || div.Code));

      // Process each SAP Division
      for (const sapDiv of sapDivisions) {
        try {
          const code = sapDiv.code || sapDiv.Code;
          const name = sapDiv.name || sapDiv.Name;
          const buCode = sapDiv.businessUnitCode || sapDiv.BusinessUnitCode;

          if (!code || !name || !buCode) {
            errors.push(`Invalid Division data: missing code, name, or businessUnitCode`);
            stats.errors++;
            continue;
          }

          // Get Business Unit ID
          const businessUnitId = buCodeMap.get(buCode);
          if (!businessUnitId) {
            errors.push(`Division ${code}: Business Unit ${buCode} not found`);
            stats.errors++;
            continue;
          }

          const existing = existingDivMap.get(code);

          if (existing) {
            // Update if data changed or if it was inactive
            if (existing.Name !== name || existing.BusinessUnitId !== businessUnitId || !existing.IsActive) {
              await this._updateDivision(existing.DivisionId, name, businessUnitId);
              stats.updated++;
              logger.debug(`Updated Division: ${code}`);
            }
          } else {
            // Create new Division
            await this.divisionService.createDivision({ code, name, businessUnitId });
            stats.added++;
            logger.debug(`Added Division: ${code}`);
          }
        } catch (error) {
          errors.push(`Error processing Division ${sapDiv.code || sapDiv.Code}: ${error.message}`);
          stats.errors++;
        }
      }

      // Deactivate Divisions not in SAP
      for (const existing of existingDivisions) {
        if (!sapCodes.has(existing.Code) && existing.IsActive) {
          try {
            await this._deactivateDivision(existing.DivisionId);
            stats.deactivated++;
            logger.debug(`Deactivated Division: ${existing.Code}`);
          } catch (error) {
            errors.push(`Error deactivating Division ${existing.Code}: ${error.message}`);
            stats.errors++;
          }
        }
      }

    } catch (error) {
      errors.push(`Division sync error: ${error.message}`);
      stats.errors++;
    }

    return { stats, errors };
  }

  /**
   * Sync Departments from SAP
   * @private
   * @returns {Promise<Object>}
   */
  async _syncDepartments() {
    const stats = { added: 0, updated: 0, deactivated: 0, errors: 0 };
    const errors = [];

    try {
      // Fetch Departments from SAP
      const response = await sapClient.fetchDepartments();
      
      if (!response.success) {
        throw new Error(response.error);
      }

      const sapDepartments = response.data.departments || response.data || [];
      logger.info(`Fetched ${sapDepartments.length} Departments from SAP`);

      // Get existing Departments and Divisions
      const existingDepartments = await this.departmentService.getDepartments({ includeInactive: true });
      const existingDeptMap = new Map(existingDepartments.map(dept => [dept.Code, dept]));
      
      const divisions = await this.divisionService.getDivisions({ includeInactive: false });
      const divCodeMap = new Map(divisions.map(div => [div.Code, div.DivisionId]));

      // Track SAP codes for deactivation logic
      const sapCodes = new Set(sapDepartments.map(dept => dept.code || dept.Code));

      // Process each SAP Department
      for (const sapDept of sapDepartments) {
        try {
          const code = sapDept.code || sapDept.Code;
          const name = sapDept.name || sapDept.Name;
          const divCode = sapDept.divisionCode || sapDept.DivisionCode;

          if (!code || !name || !divCode) {
            errors.push(`Invalid Department data: missing code, name, or divisionCode`);
            stats.errors++;
            continue;
          }

          // Get Division ID
          const divisionId = divCodeMap.get(divCode);
          if (!divisionId) {
            errors.push(`Department ${code}: Division ${divCode} not found`);
            stats.errors++;
            continue;
          }

          const existing = existingDeptMap.get(code);

          if (existing) {
            // Update if data changed or if it was inactive
            if (existing.Name !== name || existing.DivisionId !== divisionId || !existing.IsActive) {
              await this._updateDepartment(existing.DepartmentId, name, divisionId);
              stats.updated++;
              logger.debug(`Updated Department: ${code}`);
            }
          } else {
            // Create new Department
            await this.departmentService.createDepartment({ code, name, divisionId });
            stats.added++;
            logger.debug(`Added Department: ${code}`);
          }
        } catch (error) {
          errors.push(`Error processing Department ${sapDept.code || sapDept.Code}: ${error.message}`);
          stats.errors++;
        }
      }

      // Deactivate Departments not in SAP
      for (const existing of existingDepartments) {
        if (!sapCodes.has(existing.Code) && existing.IsActive) {
          try {
            await this._deactivateDepartment(existing.DepartmentId);
            stats.deactivated++;
            logger.debug(`Deactivated Department: ${existing.Code}`);
          } catch (error) {
            errors.push(`Error deactivating Department ${existing.Code}: ${error.message}`);
            stats.errors++;
          }
        }
      }

    } catch (error) {
      errors.push(`Department sync error: ${error.message}`);
      stats.errors++;
    }

    return { stats, errors };
  }

  /**
   * Update Business Unit with reactivation
   * @private
   * @param {string} businessUnitId
   * @param {string} name
   */
  async _updateBusinessUnit(businessUnitId, name) {
    const pool = await db.getPool();
    await pool.request()
      .input('businessUnitId', sql.UniqueIdentifier, businessUnitId)
      .input('name', sql.NVarChar(200), name)
      .query('UPDATE BusinessUnits SET Name = @name, IsActive = 1, UpdatedAt = GETDATE() WHERE BusinessUnitId = @businessUnitId');
  }

  /**
   * Update Division with reactivation
   * @private
   * @param {string} divisionId
   * @param {string} name
   * @param {string} businessUnitId
   */
  async _updateDivision(divisionId, name, businessUnitId) {
    const pool = await db.getPool();
    await pool.request()
      .input('divisionId', sql.UniqueIdentifier, divisionId)
      .input('name', sql.NVarChar(200), name)
      .input('businessUnitId', sql.UniqueIdentifier, businessUnitId)
      .query('UPDATE Divisions SET Name = @name, BusinessUnitId = @businessUnitId, IsActive = 1, UpdatedAt = GETDATE() WHERE DivisionId = @divisionId');
  }

  /**
   * Update Department with reactivation
   * @private
   * @param {string} departmentId
   * @param {string} name
   * @param {string} divisionId
   */
  async _updateDepartment(departmentId, name, divisionId) {
    const pool = await db.getPool();
    await pool.request()
      .input('departmentId', sql.UniqueIdentifier, departmentId)
      .input('name', sql.NVarChar(200), name)
      .input('divisionId', sql.UniqueIdentifier, divisionId)
      .query('UPDATE Departments SET Name = @name, DivisionId = @divisionId, IsActive = 1, UpdatedAt = GETDATE() WHERE DepartmentId = @departmentId');
  }

  /**
   * Deactivate Business Unit
   * @private
   * @param {string} businessUnitId
   */
  async _deactivateBusinessUnit(businessUnitId) {
    const pool = await db.getPool();
    await pool.request()
      .input('businessUnitId', sql.UniqueIdentifier, businessUnitId)
      .query('UPDATE BusinessUnits SET IsActive = 0, UpdatedAt = GETDATE() WHERE BusinessUnitId = @businessUnitId');
  }

  /**
   * Deactivate Division
   * @private
   * @param {string} divisionId
   */
  async _deactivateDivision(divisionId) {
    const pool = await db.getPool();
    await pool.request()
      .input('divisionId', sql.UniqueIdentifier, divisionId)
      .query('UPDATE Divisions SET IsActive = 0, UpdatedAt = GETDATE() WHERE DivisionId = @divisionId');
  }

  /**
   * Deactivate Department
   * @private
   * @param {string} departmentId
   */
  async _deactivateDepartment(departmentId) {
    const pool = await db.getPool();
    await pool.request()
      .input('departmentId', sql.UniqueIdentifier, departmentId)
      .query('UPDATE Departments SET IsActive = 0, UpdatedAt = GETDATE() WHERE DepartmentId = @departmentId');
  }

  /**
   * Log sync result to database
   * @private
   * @param {SyncStatistics} stats
   * @param {Array<string>} errors
   * @param {Date} startTime
   * @param {Date} endTime
   */
  async _logSyncResult(stats, errors, startTime, endTime) {
    try {
      const pool = await db.getPool();
      
      const status = errors.length === 0 ? 'Success' : 'Completed with errors';
      const errorLog = errors.length > 0 ? errors.join('\n') : null;
      
      await pool.request()
        .input('syncType', sql.NVarChar(50), 'OrganizationalData')
        .input('status', sql.NVarChar(50), status)
        .input('startTime', sql.DateTime, startTime)
        .input('endTime', sql.DateTime, endTime)
        .input('recordsProcessed', sql.Int, stats.totalProcessed)
        .input('recordsAdded', sql.Int, 
          stats.businessUnits.added + stats.divisions.added + stats.departments.added)
        .input('recordsUpdated', sql.Int, 
          stats.businessUnits.updated + stats.divisions.updated + stats.departments.updated)
        .input('recordsDeactivated', sql.Int, 
          stats.businessUnits.deactivated + stats.divisions.deactivated + stats.departments.deactivated)
        .input('errorCount', sql.Int, stats.totalErrors)
        .input('errorLog', sql.NVarChar(sql.MAX), errorLog)
        .input('details', sql.NVarChar(sql.MAX), JSON.stringify(stats))
        .query(`
          INSERT INTO SAPSyncLogs (
            SyncType, Status, StartTime, EndTime, 
            RecordsProcessed, RecordsAdded, RecordsUpdated, RecordsDeactivated,
            ErrorCount, ErrorLog, Details, CreatedAt
          )
          VALUES (
            @syncType, @status, @startTime, @endTime,
            @recordsProcessed, @recordsAdded, @recordsUpdated, @recordsDeactivated,
            @errorCount, @errorLog, @details, GETDATE()
          )
        `);
      
      logger.info('SAP sync result logged to database');
    } catch (error) {
      logger.error('Error logging SAP sync result:', error);
      // Don't throw - logging failure shouldn't fail the sync
    }
  }

  /**
   * Get sync history
   * @param {Object} [options]
   * @param {number} [options.limit=10] - Number of records to return
   * @returns {Promise<Array>}
   */
  async getSyncHistory(options = {}) {
    try {
      const limit = options.limit || 10;
      const pool = await db.getPool();
      
      const result = await pool.request()
        .input('limit', sql.Int, limit)
        .query(`
          SELECT TOP (@limit) *
          FROM SAPSyncLogs
          ORDER BY CreatedAt DESC
        `);
      
      return result.recordset;
    } catch (error) {
      logger.error('Error getting sync history:', error);
      throw error;
    }
  }
}

module.exports = new SAPSyncService();
