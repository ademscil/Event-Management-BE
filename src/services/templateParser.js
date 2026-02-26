const ExcelJS = require('exceljs');
const logger = require('../config/logger');

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 422;
    this.details = details;
  }
}

/**
 * Template Parser Service for Excel file processing
 */
class TemplateParser {
  /**
   * Parse Excel file and validate data
   * @param {Buffer|Stream} fileBuffer - Excel file buffer or stream
   * @param {Object} config - Configuration for parsing
   * @param {string} config.entityType - Type of entity (BusinessUnit, Division, Department, Function, Application, FunctionAppMapping, AppDeptMapping)
   * @param {number} [config.headerRow=1] - Row number containing headers (1-based)
   * @param {number} [config.startRow=2] - First data row (1-based)
   * @param {Object} config.columnMapping - Mapping of column names to field names
   * @param {Function} [config.validator] - Custom validation function for each row
   * @returns {Promise<Object>} Parsed data with validation results
   */
  async parseExcelFile(fileBuffer, config) {
    try {
      const workbook = new ExcelJS.Workbook();
      
      // Load workbook from buffer or stream
      if (Buffer.isBuffer(fileBuffer)) {
        await workbook.xlsx.load(fileBuffer);
      } else {
        await workbook.xlsx.read(fileBuffer);
      }

      // Get first worksheet
      const worksheet = workbook.worksheets[0];
      
      if (!worksheet) {
        throw new ValidationError('Excel file is empty or invalid');
      }

      const headerRow = config.headerRow || 1;
      const startRow = config.startRow || 2;
      const columnMapping = config.columnMapping || {};
      
      // Read headers
      const headers = [];
      const headerRowData = worksheet.getRow(headerRow);
      headerRowData.eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value ? cell.value.toString().trim() : '';
      });

      // Validate required columns
      const requiredColumns = Object.keys(columnMapping);
      const missingColumns = [];
      
      for (const requiredCol of requiredColumns) {
        if (!headers.includes(requiredCol)) {
          missingColumns.push(requiredCol);
        }
      }

      if (missingColumns.length > 0) {
        throw new ValidationError(
          `Missing required columns: ${missingColumns.join(', ')}`,
          [{ row: headerRow, error: `Missing columns: ${missingColumns.join(', ')}` }]
        );
      }

      // Parse data rows
      const validRecords = [];
      const errors = [];
      let rowNumber = startRow;

      for (let i = startRow; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        
        // Skip empty rows
        if (this._isRowEmpty(row)) {
          continue;
        }

        const record = {};
        const rowErrors = [];

        // Map columns to fields
        row.eachCell((cell, colNumber) => {
          const columnName = headers[colNumber];
          const fieldName = columnMapping[columnName];
          
          if (fieldName) {
            const cellValue = this._getCellValue(cell);
            record[fieldName] = cellValue;
          }
        });

        // Validate record
        const validationResult = this._validateRecord(record, config.entityType, rowNumber);
        
        if (validationResult.errors.length > 0) {
          rowErrors.push(...validationResult.errors);
        }

        // Custom validator
        if (config.validator && typeof config.validator === 'function') {
          try {
            const customValidation = await config.validator(record, rowNumber);
            if (customValidation && customValidation.errors) {
              rowErrors.push(...customValidation.errors);
            }
          } catch (error) {
            rowErrors.push(`Custom validation failed: ${error.message}`);
          }
        }

        if (rowErrors.length > 0) {
          errors.push({
            row: rowNumber,
            data: record,
            errors: rowErrors
          });
        } else {
          validRecords.push({
            row: rowNumber,
            data: record
          });
        }

        rowNumber++;
      }

      logger.info('Excel file parsed', {
        entityType: config.entityType,
        totalRows: rowNumber - startRow,
        validRecords: validRecords.length,
        errorRecords: errors.length
      });

      return {
        success: errors.length === 0,
        totalRows: rowNumber - startRow,
        validRecords,
        errors,
        summary: {
          valid: validRecords.length,
          invalid: errors.length,
          total: rowNumber - startRow
        }
      };
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw error;
      }
      logger.error('Error parsing Excel file:', error);
      throw new ValidationError(`Failed to parse Excel file: ${error.message}`);
    }
  }

  /**
   * Get cell value with type handling
   * @private
   * @param {Object} cell - Excel cell
   * @returns {*} Cell value
   */
  _getCellValue(cell) {
    if (!cell || cell.value === null || cell.value === undefined) {
      return null;
    }

    // Handle formula cells
    if (cell.type === ExcelJS.ValueType.Formula) {
      return cell.result;
    }

    // Handle date cells
    if (cell.type === ExcelJS.ValueType.Date) {
      return cell.value;
    }

    // Handle rich text
    if (cell.value && typeof cell.value === 'object' && cell.value.richText) {
      return cell.value.richText.map(rt => rt.text).join('');
    }

    // Handle hyperlinks
    if (cell.value && typeof cell.value === 'object' && cell.value.text) {
      return cell.value.text;
    }

    // Convert to string and trim
    return cell.value.toString().trim();
  }

  /**
   * Check if row is empty
   * @private
   * @param {Object} row - Excel row
   * @returns {boolean} True if empty
   */
  _isRowEmpty(row) {
    let isEmpty = true;
    row.eachCell((cell) => {
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
        isEmpty = false;
      }
    });
    return isEmpty;
  }

  /**
   * Validate record based on entity type
   * @private
   * @param {Object} record - Record to validate
   * @param {string} entityType - Entity type
   * @param {number} rowNumber - Row number for error reporting
   * @returns {Object} Validation result
   */
  _validateRecord(record, entityType, rowNumber) {
    const errors = [];

    switch (entityType) {
      case 'BusinessUnit':
        errors.push(...this._validateBusinessUnit(record));
        break;
      case 'Division':
        errors.push(...this._validateDivision(record));
        break;
      case 'Department':
        errors.push(...this._validateDepartment(record));
        break;
      case 'Function':
        errors.push(...this._validateFunction(record));
        break;
      case 'Application':
        errors.push(...this._validateApplication(record));
        break;
      case 'FunctionAppMapping':
        errors.push(...this._validateFunctionAppMapping(record));
        break;
      case 'AppDeptMapping':
        errors.push(...this._validateAppDeptMapping(record));
        break;
      case 'users':
      case 'User':
        errors.push(...this._validateUser(record));
        break;
      default:
        errors.push(`Unknown entity type: ${entityType}`);
    }

    return { errors };
  }

  /**
   * Validate Business Unit record
   * @private
   */
  _validateBusinessUnit(record) {
    const errors = [];
    
    // Validate code
    if (!record.code || record.code.trim() === '') {
      errors.push('Code is required');
    } else if (!/^[a-zA-Z0-9-]{2,20}$/.test(record.code)) {
      errors.push('Code must be 2-20 characters, alphanumeric and hyphen only');
    }

    // Validate name
    if (!record.name || record.name.trim() === '') {
      errors.push('Name is required');
    } else if (record.name.length > 200) {
      errors.push('Name must be 1-200 characters');
    }

    return errors;
  }

  /**
   * Validate Division record
   * @private
   */
  _validateDivision(record) {
    const errors = [];
    
    // Validate code
    if (!record.code || record.code.trim() === '') {
      errors.push('Code is required');
    } else if (!/^[a-zA-Z0-9-]{2,20}$/.test(record.code)) {
      errors.push('Code must be 2-20 characters, alphanumeric and hyphen only');
    }

    // Validate name
    if (!record.name || record.name.trim() === '') {
      errors.push('Name is required');
    } else if (record.name.length > 200) {
      errors.push('Name must be 1-200 characters');
    }

    // Validate Business Unit code
    if (!record.businessUnitCode || record.businessUnitCode.trim() === '') {
      errors.push('Business Unit Code is required');
    }

    return errors;
  }

  /**
   * Validate Department record
   * @private
   */
  _validateDepartment(record) {
    const errors = [];
    
    // Validate code
    if (!record.code || record.code.trim() === '') {
      errors.push('Code is required');
    } else if (!/^[a-zA-Z0-9-]{2,20}$/.test(record.code)) {
      errors.push('Code must be 2-20 characters, alphanumeric and hyphen only');
    }

    // Validate name
    if (!record.name || record.name.trim() === '') {
      errors.push('Name is required');
    } else if (record.name.length > 200) {
      errors.push('Name must be 1-200 characters');
    }

    // Validate Division code
    if (!record.divisionCode || record.divisionCode.trim() === '') {
      errors.push('Division Code is required');
    }

    return errors;
  }

  /**
   * Validate Function record
   * @private
   */
  _validateFunction(record) {
    const errors = [];
    
    // Validate code
    if (!record.code || record.code.trim() === '') {
      errors.push('Code is required');
    } else if (!/^[a-zA-Z0-9-]{2,20}$/.test(record.code)) {
      errors.push('Code must be 2-20 characters, alphanumeric and hyphen only');
    }

    // Validate name
    if (!record.name || record.name.trim() === '') {
      errors.push('Name is required');
    } else if (record.name.length > 200) {
      errors.push('Name must be 1-200 characters');
    }

    return errors;
  }

  /**
   * Validate Application record
   * @private
   */
  _validateApplication(record) {
    const errors = [];
    
    // Validate code
    if (!record.code || record.code.trim() === '') {
      errors.push('Code is required');
    } else if (!/^[a-zA-Z0-9-]{2,20}$/.test(record.code)) {
      errors.push('Code must be 2-20 characters, alphanumeric and hyphen only');
    }

    // Validate name
    if (!record.name || record.name.trim() === '') {
      errors.push('Name is required');
    } else if (record.name.length > 200) {
      errors.push('Name must be 1-200 characters');
    }

    // Description is optional but has max length
    if (record.description && record.description.length > 500) {
      errors.push('Description must be 500 characters or less');
    }

    return errors;
  }

  /**
   * Validate Function-Application Mapping record
   * @private
   */
  _validateFunctionAppMapping(record) {
    const errors = [];
    
    // Validate function code
    if (!record.functionCode || record.functionCode.trim() === '') {
      errors.push('Function Code is required');
    }

    // Validate application code
    if (!record.applicationCode || record.applicationCode.trim() === '') {
      errors.push('Application Code is required');
    }

    return errors;
  }

  /**
   * Validate User record
   * @private
   */
  _validateUser(record) {
    const errors = [];
    
    if (!record.username || record.username.trim() === '') {
      errors.push('Username is required');
    }

    if (!record.displayName || record.displayName.trim() === '') {
      errors.push('DisplayName is required');
    }

    if (!record.email || record.email.trim() === '') {
      errors.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
      errors.push('Invalid email format');
    }

    if (!record.role || !['SuperAdmin', 'AdminEvent', 'ITLead', 'DepartmentHead'].includes(record.role)) {
      errors.push('Role must be SuperAdmin, AdminEvent, ITLead, or DepartmentHead');
    }

    const useLdap = record.useLdap === 'true' || record.useLdap === true;
    if (!useLdap && (!record.password || record.password.length < 8)) {
      errors.push('Password must be at least 8 characters for non-LDAP users');
    }

    return errors;
  }

  /**
   * Validate Application-Department Mapping record
   * @private
   */
  _validateAppDeptMapping(record) {
    const errors = [];
    
    // Validate application code
    if (!record.applicationCode || record.applicationCode.trim() === '') {
      errors.push('Application Code is required');
    }

    // Validate department code
    if (!record.departmentCode || record.departmentCode.trim() === '') {
      errors.push('Department Code is required');
    }

    return errors;
  }

  /**
   * Generate error report
   * @param {Array} errors - Array of error objects
   * @returns {string} Formatted error report
   */
  generateErrorReport(errors) {
    if (!errors || errors.length === 0) {
      return 'No errors';
    }

    let report = `Found ${errors.length} error(s):\n\n`;
    
    errors.forEach((error, index) => {
      report += `Error ${index + 1} (Row ${error.row}):\n`;
      report += `  Data: ${JSON.stringify(error.data)}\n`;
      report += `  Issues:\n`;
      error.errors.forEach(err => {
        report += `    - ${err}\n`;
      });
      report += '\n';
    });

    return report;
  }
}

module.exports = { TemplateParser, ValidationError };
