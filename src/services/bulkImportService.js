const sql = require('mssql');
const db = require('../database/connection');
const logger = require('../config/logger');
const { TemplateParser, ValidationError } = require('./templateParser');
const { BusinessUnitService } = require('./businessUnitService');
const { DivisionService } = require('./divisionService');
const { DepartmentService } = require('./departmentService');
const { FunctionService } = require('./functionService');
const { ApplicationService } = require('./applicationService');

/**
 * Bulk Import Service for batch processing of master data
 */
class BulkImportService {
  constructor() {
    this.parser = new TemplateParser();
    this.businessUnitService = new BusinessUnitService();
    this.divisionService = new DivisionService();
    this.departmentService = new DepartmentService();
    this.functionService = new FunctionService();
    this.applicationService = new ApplicationService();
  }

  /**
   * Import data from Excel file
   * @param {Buffer|Stream} fileBuffer - Excel file buffer or stream
   * @param {string} entityType - Type of entity to import
   * @param {Object} [options] - Import options
   * @param {boolean} [options.skipDuplicates=false] - Skip duplicate records instead of failing
   * @param {boolean} [options.updateExisting=false] - Update existing records instead of creating new ones
   * @returns {Promise<Object>} Import results
   */
  async importData(fileBuffer, entityType, options = {}) {
    const startTime = Date.now();
    const results = {
      success: false,
      totalRows: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      duration: 0
    };

    let transaction;

    try {
      // Get column mapping for entity type
      logger.info('Getting entity config for:', entityType);
      const config = this._getEntityConfig(entityType);
      logger.info('Config retrieved:', config);
      
      // Parse Excel file
      logger.info('Starting bulk import', { entityType });
      const parseResult = await this.parser.parseExcelFile(fileBuffer, config);

      results.totalRows = parseResult.totalRows;

      if (parseResult.errors.length > 0) {
        results.errors = parseResult.errors;
        results.failed = parseResult.errors.length;
        
        if (!options.skipDuplicates) {
          throw new ValidationError(
            `Validation failed for ${parseResult.errors.length} record(s)`,
            parseResult.errors
          );
        }
      }

      // Start transaction
      const pool = await db.getPool();
      transaction = new sql.Transaction(pool);
      await transaction.begin();

      // Process valid records
      for (const record of parseResult.validRecords) {
        try {
          const importResult = await this._importRecord(
            record.data,
            entityType,
            transaction,
            options
          );

          if (importResult.action === 'imported') {
            results.imported++;
          } else if (importResult.action === 'updated') {
            results.updated++;
          } else if (importResult.action === 'skipped') {
            results.skipped++;
          }

          // Progress tracking
          const processed = results.imported + results.updated + results.skipped + results.failed;
          if (processed % 100 === 0) {
            logger.info('Import progress', {
              entityType,
              processed,
              total: parseResult.validRecords.length
            });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: record.row,
            data: record.data,
            errors: [error.message]
          });

          if (!options.skipDuplicates) {
            throw error;
          }
        }
      }

      // Commit transaction
      await transaction.commit();
      results.success = true;

      results.duration = Date.now() - startTime;

      logger.info('Bulk import completed', {
        entityType,
        ...results
      });

      return results;
    } catch (error) {
      // Rollback transaction on error
      if (transaction) {
        try {
          await transaction.rollback();
          logger.info('Transaction rolled back due to error');
        } catch (rollbackError) {
          logger.error('Error rolling back transaction:', rollbackError);
        }
      }

      if (error.name === 'ValidationError') {
        throw error;
      }

      logger.error('Error during bulk import:', error);
      throw new ValidationError(`Bulk import failed: ${error.message}`);
    }
  }

  /**
   * Import a single record
   * @private
   * @param {Object} data - Record data
   * @param {string} entityType - Entity type
   * @param {Object} transaction - SQL transaction
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Import result
   */
  async _importRecord(data, entityType, transaction, options) {
    const request = new sql.Request(transaction);

    switch (entityType) {
      case 'BusinessUnit':
        return await this._importBusinessUnit(data, request, options);
      case 'Division':
        return await this._importDivision(data, request, options);
      case 'Department':
        return await this._importDepartment(data, request, options);
      case 'Function':
        return await this._importFunction(data, request, options);
      case 'Application':
        return await this._importApplication(data, request, options);
      case 'FunctionAppMapping':
        return await this._importFunctionAppMapping(data, request, options);
      case 'AppDeptMapping':
        return await this._importAppDeptMapping(data, request, options);
      case 'users':
      case 'User':
        return await this._importUser(data, request, options);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  /**
   * Import Business Unit
   * @private
   */
  async _importBusinessUnit(data, request, options) {
    // Check if exists
    const existing = await request
      .input('code', sql.NVarChar(20), data.code)
      .query('SELECT BusinessUnitId FROM BusinessUnits WHERE Code = @code');

    if (existing.recordset.length > 0) {
      if (options.updateExisting) {
        // Update existing
        await request
          .input('name', sql.NVarChar(200), data.name)
          .query(`
            UPDATE BusinessUnits
            SET Name = @name, UpdatedAt = GETDATE()
            WHERE Code = @code
          `);
        return { action: 'updated' };
      } else if (options.skipDuplicates) {
        return { action: 'skipped' };
      } else {
        throw new Error(`Business Unit with code '${data.code}' already exists`);
      }
    }

    // Insert new
    await request
      .input('name', sql.NVarChar(200), data.name)
      .query(`
        INSERT INTO BusinessUnits (Code, Name, IsActive, CreatedAt)
        VALUES (@code, @name, 1, GETDATE())
      `);

    return { action: 'imported' };
  }

  /**
   * Import Division
   * @private
   */
  async _importDivision(data, request, options) {
    // Get Business Unit ID
    const buResult = await request
      .input('buCode', sql.NVarChar(20), data.businessUnitCode)
      .query('SELECT BusinessUnitId FROM BusinessUnits WHERE Code = @buCode');

    if (buResult.recordset.length === 0) {
      throw new Error(`Business Unit with code '${data.businessUnitCode}' not found`);
    }

    const businessUnitId = buResult.recordset[0].BusinessUnitId;

    // Check if exists
    const existing = await request
      .input('code', sql.NVarChar(20), data.code)
      .query('SELECT DivisionId FROM Divisions WHERE Code = @code');

    if (existing.recordset.length > 0) {
      if (options.updateExisting) {
        // Update existing
        await request
          .input('name', sql.NVarChar(200), data.name)
          .input('businessUnitId', sql.UniqueIdentifier, businessUnitId)
          .query(`
            UPDATE Divisions
            SET Name = @name, BusinessUnitId = @businessUnitId, UpdatedAt = GETDATE()
            WHERE Code = @code
          `);
        return { action: 'updated' };
      } else if (options.skipDuplicates) {
        return { action: 'skipped' };
      } else {
        throw new Error(`Division with code '${data.code}' already exists`);
      }
    }

    // Insert new
    await request
      .input('name', sql.NVarChar(200), data.name)
      .input('businessUnitId', sql.UniqueIdentifier, businessUnitId)
      .query(`
        INSERT INTO Divisions (Code, Name, BusinessUnitId, IsActive, CreatedAt)
        VALUES (@code, @name, @businessUnitId, 1, GETDATE())
      `);

    return { action: 'imported' };
  }

  /**
   * Import Department
   * @private
   */
  async _importDepartment(data, request, options) {
    // Get Division ID
    const divResult = await request
      .input('divCode', sql.NVarChar(20), data.divisionCode)
      .query('SELECT DivisionId FROM Divisions WHERE Code = @divCode');

    if (divResult.recordset.length === 0) {
      throw new Error(`Division with code '${data.divisionCode}' not found`);
    }

    const divisionId = divResult.recordset[0].DivisionId;

    // Check if exists
    const existing = await request
      .input('code', sql.NVarChar(20), data.code)
      .query('SELECT DepartmentId FROM Departments WHERE Code = @code');

    if (existing.recordset.length > 0) {
      if (options.updateExisting) {
        // Update existing
        await request
          .input('name', sql.NVarChar(200), data.name)
          .input('divisionId', sql.UniqueIdentifier, divisionId)
          .query(`
            UPDATE Departments
            SET Name = @name, DivisionId = @divisionId, UpdatedAt = GETDATE()
            WHERE Code = @code
          `);
        return { action: 'updated' };
      } else if (options.skipDuplicates) {
        return { action: 'skipped' };
      } else {
        throw new Error(`Department with code '${data.code}' already exists`);
      }
    }

    // Insert new
    await request
      .input('name', sql.NVarChar(200), data.name)
      .input('divisionId', sql.UniqueIdentifier, divisionId)
      .query(`
        INSERT INTO Departments (Code, Name, DivisionId, IsActive, CreatedAt)
        VALUES (@code, @name, @divisionId, 1, GETDATE())
      `);

    return { action: 'imported' };
  }

  /**
   * Import Function
   * @private
   */
  async _importFunction(data, request, options) {
    // Check if exists
    const existing = await request
      .input('code', sql.NVarChar(20), data.code)
      .query('SELECT FunctionId FROM Functions WHERE Code = @code');

    if (existing.recordset.length > 0) {
      if (options.updateExisting) {
        // Update existing
        await request
          .input('name', sql.NVarChar(200), data.name)
          .query(`
            UPDATE Functions
            SET Name = @name, UpdatedAt = GETDATE()
            WHERE Code = @code
          `);
        return { action: 'updated' };
      } else if (options.skipDuplicates) {
        return { action: 'skipped' };
      } else {
        throw new Error(`Function with code '${data.code}' already exists`);
      }
    }

    // Insert new
    await request
      .input('name', sql.NVarChar(200), data.name)
      .query(`
        INSERT INTO Functions (Code, Name, IsActive, CreatedAt)
        VALUES (@code, @name, 1, GETDATE())
      `);

    return { action: 'imported' };
  }

  /**
   * Import Application
   * @private
   */
  async _importApplication(data, request, options) {
    // Check if exists
    const existing = await request
      .input('code', sql.NVarChar(20), data.code)
      .query('SELECT ApplicationId FROM Applications WHERE Code = @code');

    if (existing.recordset.length > 0) {
      if (options.updateExisting) {
        // Update existing
        await request
          .input('name', sql.NVarChar(200), data.name)
          .input('description', sql.NVarChar(500), data.description || null)
          .query(`
            UPDATE Applications
            SET Name = @name, Description = @description, UpdatedAt = GETDATE()
            WHERE Code = @code
          `);
        return { action: 'updated' };
      } else if (options.skipDuplicates) {
        return { action: 'skipped' };
      } else {
        throw new Error(`Application with code '${data.code}' already exists`);
      }
    }

    // Insert new
    await request
      .input('name', sql.NVarChar(200), data.name)
      .input('description', sql.NVarChar(500), data.description || null)
      .query(`
        INSERT INTO Applications (Code, Name, Description, IsActive, CreatedAt)
        VALUES (@code, @name, @description, 1, GETDATE())
      `);

    return { action: 'imported' };
  }

  /**
   * Import Function-Application Mapping
   * @private
   */
  async _importFunctionAppMapping(data, request, options) {
    // Get Function ID
    const funcResult = await request
      .input('funcCode', sql.NVarChar(20), data.functionCode)
      .query('SELECT FunctionId FROM Functions WHERE Code = @funcCode');

    if (funcResult.recordset.length === 0) {
      throw new Error(`Function with code '${data.functionCode}' not found`);
    }

    const functionId = funcResult.recordset[0].FunctionId;

    // Get Application ID
    const appResult = await request
      .input('appCode', sql.NVarChar(20), data.applicationCode)
      .query('SELECT ApplicationId FROM Applications WHERE Code = @appCode');

    if (appResult.recordset.length === 0) {
      throw new Error(`Application with code '${data.applicationCode}' not found`);
    }

    const applicationId = appResult.recordset[0].ApplicationId;

    // Check if mapping exists
    const existing = await request
      .input('functionId', sql.UniqueIdentifier, functionId)
      .input('applicationId', sql.UniqueIdentifier, applicationId)
      .query(`
        SELECT MappingId FROM FunctionApplicationMappings
        WHERE FunctionId = @functionId AND ApplicationId = @applicationId
      `);

    if (existing.recordset.length > 0) {
      if (options.skipDuplicates) {
        return { action: 'skipped' };
      } else {
        throw new Error(`Mapping already exists for Function '${data.functionCode}' and Application '${data.applicationCode}'`);
      }
    }

    // Insert new mapping
    await request.query(`
      INSERT INTO FunctionApplicationMappings (FunctionId, ApplicationId, CreatedAt)
      VALUES (@functionId, @applicationId, GETDATE())
    `);

    return { action: 'imported' };
  }

  /**
   * Import User
   * @private
   */
  async _importUser(data, request, options) {
    const bcrypt = require('bcrypt');
    
    const existing = await request
      .input('username', sql.NVarChar(50), data.username)
      .query('SELECT UserId FROM Users WHERE Username = @username');

    if (existing.recordset.length > 0) {
      if (options.skipDuplicates) {
        return { action: 'skipped' };
      } else {
        throw new Error(`User with username '${data.username}' already exists`);
      }
    }

    const useLdap = data.useLdap === 'true' || data.useLdap === true;
    const isActive = data.isActive === 'true' || data.isActive === true;
    let passwordHash = null;

    if (!useLdap && data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    await request
      .input('npk', sql.NVarChar(50), data.npk || null)
      .input('displayName', sql.NVarChar(200), data.displayName)
      .input('email', sql.NVarChar(200), data.email)
      .input('role', sql.NVarChar(50), data.role)
      .input('useLdap', sql.Bit, useLdap)
      .input('isActive', sql.Bit, isActive)
      .input('passwordHash', sql.NVarChar(255), passwordHash)
      .query(`
        INSERT INTO Users (Username, NPK, DisplayName, Email, Role, UseLDAP, IsActive, PasswordHash, CreatedAt)
        VALUES (@username, @npk, @displayName, @email, @role, @useLdap, @isActive, @passwordHash, GETDATE())
      `);

    return { action: 'imported' };
  }

  /**
   * Import Application-Department Mapping
   * @private
   */
  async _importAppDeptMapping(data, request, options) {
    // Get Application ID
    const appResult = await request
      .input('appCode', sql.NVarChar(20), data.applicationCode)
      .query('SELECT ApplicationId FROM Applications WHERE Code = @appCode');

    if (appResult.recordset.length === 0) {
      throw new Error(`Application with code '${data.applicationCode}' not found`);
    }

    const applicationId = appResult.recordset[0].ApplicationId;

    // Get Department ID
    const deptResult = await request
      .input('deptCode', sql.NVarChar(20), data.departmentCode)
      .query('SELECT DepartmentId FROM Departments WHERE Code = @deptCode');

    if (deptResult.recordset.length === 0) {
      throw new Error(`Department with code '${data.departmentCode}' not found`);
    }

    const departmentId = deptResult.recordset[0].DepartmentId;

    // Check if mapping exists
    const existing = await request
      .input('applicationId', sql.UniqueIdentifier, applicationId)
      .input('departmentId', sql.UniqueIdentifier, departmentId)
      .query(`
        SELECT MappingId FROM ApplicationDepartmentMappings
        WHERE ApplicationId = @applicationId AND DepartmentId = @departmentId
      `);

    if (existing.recordset.length > 0) {
      if (options.skipDuplicates) {
        return { action: 'skipped' };
      } else {
        throw new Error(`Mapping already exists for Application '${data.applicationCode}' and Department '${data.departmentCode}'`);
      }
    }

    // Insert new mapping
    await request.query(`
      INSERT INTO ApplicationDepartmentMappings (ApplicationId, DepartmentId, CreatedAt)
      VALUES (@applicationId, @departmentId, GETDATE())
    `);

    return { action: 'imported' };
  }

  /**
   * Get entity configuration for parsing
   * @private
   * @param {string} entityType - Entity type
   * @returns {Object} Configuration object
   */
  _getEntityConfig(entityType) {
    const configs = {
      BusinessUnit: {
        entityType: 'BusinessUnit',
        columnMapping: {
          'Code': 'code',
          'Name': 'name'
        }
      },
      Division: {
        entityType: 'Division',
        columnMapping: {
          'Code': 'code',
          'Name': 'name',
          'Business Unit Code': 'businessUnitCode'
        }
      },
      Department: {
        entityType: 'Department',
        columnMapping: {
          'Code': 'code',
          'Name': 'name',
          'Division Code': 'divisionCode'
        }
      },
      Function: {
        entityType: 'Function',
        columnMapping: {
          'Code': 'code',
          'Name': 'name'
        }
      },
      Application: {
        entityType: 'Application',
        columnMapping: {
          'Code': 'code',
          'Name': 'name',
          'Description': 'description'
        }
      },
      FunctionAppMapping: {
        entityType: 'FunctionAppMapping',
        columnMapping: {
          'Function Code': 'functionCode',
          'Application Code': 'applicationCode'
        }
      },
      AppDeptMapping: {
        entityType: 'AppDeptMapping',
        columnMapping: {
          'Application Code': 'applicationCode',
          'Department Code': 'departmentCode'
        }
      },
      users: {
        entityType: 'users',
        columnMapping: {
          'Username': 'username',
          'NPK': 'npk',
          'DisplayName': 'displayName',
          'Email': 'email',
          'Role': 'role',
          'IsActive': 'isActive',
          'UseLDAP': 'useLdap',
          'Password': 'password'
        }
      }
    };

    const config = configs[entityType];
    if (!config) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    return config;
  }

  /**
   * Generate import summary report
   * @param {Object} results - Import results
   * @returns {string} Formatted report
   */
  generateReport(results) {
    let report = '=== Bulk Import Report ===\n\n';
    report += `Status: ${results.success ? 'SUCCESS' : 'FAILED'}\n`;
    report += `Duration: ${results.duration}ms\n\n`;
    report += `Total Rows: ${results.totalRows}\n`;
    report += `Imported: ${results.imported}\n`;
    report += `Updated: ${results.updated}\n`;
    report += `Skipped: ${results.skipped}\n`;
    report += `Failed: ${results.failed}\n\n`;

    if (results.errors.length > 0) {
      report += `Errors (${results.errors.length}):\n`;
      results.errors.forEach((error, index) => {
        report += `\n${index + 1}. Row ${error.row}:\n`;
        report += `   Data: ${JSON.stringify(error.data)}\n`;
        report += `   Issues:\n`;
        error.errors.forEach(err => {
          report += `     - ${err}\n`;
        });
      });
    }

    return report;
  }
}

module.exports = { BulkImportService, ValidationError };
