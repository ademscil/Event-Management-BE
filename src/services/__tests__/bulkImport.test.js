const { TemplateParser } = require('../templateParser');
const { BulkImportService } = require('../bulkImportService');
const ExcelJS = require('exceljs');

describe('Bulk Import Service', () => {
  describe('TemplateParser', () => {
    let parser;

    beforeEach(() => {
      parser = new TemplateParser();
    });

    test('should parse valid Business Unit Excel file', async () => {
      // Create test Excel file
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('BusinessUnits');

      // Add headers
      worksheet.addRow(['Code', 'Name']);

      // Add data
      worksheet.addRow(['BU001', 'Business Unit 1']);
      worksheet.addRow(['BU002', 'Business Unit 2']);

      // Convert to buffer
      const buffer = await workbook.xlsx.writeBuffer();

      // Parse
      const config = {
        entityType: 'BusinessUnit',
        columnMapping: {
          'Code': 'code',
          'Name': 'name'
        }
      };

      const result = await parser.parseExcelFile(buffer, config);

      expect(result.success).toBe(true);
      expect(result.validRecords).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.validRecords[0].data).toEqual({
        code: 'BU001',
        name: 'Business Unit 1'
      });
    });

    test('should detect validation errors in Excel file', async () => {
      // Create test Excel file with invalid data
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('BusinessUnits');

      // Add headers
      worksheet.addRow(['Code', 'Name']);

      // Add invalid data (code too long)
      worksheet.addRow(['BU001-VERY-LONG-CODE-THAT-EXCEEDS-LIMIT', 'Business Unit 1']);
      worksheet.addRow(['', 'Business Unit 2']); // Missing code

      const buffer = await workbook.xlsx.writeBuffer();

      const config = {
        entityType: 'BusinessUnit',
        columnMapping: {
          'Code': 'code',
          'Name': 'name'
        }
      };

      const result = await parser.parseExcelFile(buffer, config);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].errors).toContain('Code must be 2-20 characters, alphanumeric and hyphen only');
      expect(result.errors[1].errors).toContain('Code is required');
    });

    test('should detect missing required columns', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('BusinessUnits');

      // Add headers with missing column
      worksheet.addRow(['Code']); // Missing 'Name' column

      worksheet.addRow(['BU001']);

      const buffer = await workbook.xlsx.writeBuffer();

      const config = {
        entityType: 'BusinessUnit',
        columnMapping: {
          'Code': 'code',
          'Name': 'name'
        }
      };

      await expect(parser.parseExcelFile(buffer, config)).rejects.toThrow('Missing required columns');
    });

    test('should skip empty rows', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('BusinessUnits');

      worksheet.addRow(['Code', 'Name']);
      worksheet.addRow(['BU001', 'Business Unit 1']);
      worksheet.addRow([]); // Empty row
      worksheet.addRow(['BU002', 'Business Unit 2']);

      const buffer = await workbook.xlsx.writeBuffer();

      const config = {
        entityType: 'BusinessUnit',
        columnMapping: {
          'Code': 'code',
          'Name': 'name'
        }
      };

      const result = await parser.parseExcelFile(buffer, config);

      expect(result.validRecords).toHaveLength(2);
    });

    test('should validate Division with Business Unit reference', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Divisions');

      worksheet.addRow(['Code', 'Name', 'Business Unit Code']);
      worksheet.addRow(['DIV001', 'Division 1', 'BU001']);
      worksheet.addRow(['DIV002', 'Division 2', '']); // Missing BU code

      const buffer = await workbook.xlsx.writeBuffer();

      const config = {
        entityType: 'Division',
        columnMapping: {
          'Code': 'code',
          'Name': 'name',
          'Business Unit Code': 'businessUnitCode'
        }
      };

      const result = await parser.parseExcelFile(buffer, config);

      expect(result.validRecords).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errors).toContain('Business Unit Code is required');
    });

    test('should validate Application with optional description', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Applications');

      worksheet.addRow(['Code', 'Name', 'Description']);
      worksheet.addRow(['APP001', 'Application 1', 'Test description']);
      worksheet.addRow(['APP002', 'Application 2', '']); // Empty description is OK

      const buffer = await workbook.xlsx.writeBuffer();

      const config = {
        entityType: 'Application',
        columnMapping: {
          'Code': 'code',
          'Name': 'name',
          'Description': 'description'
        }
      };

      const result = await parser.parseExcelFile(buffer, config);

      expect(result.validRecords).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    test('should validate mapping records', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Mappings');

      worksheet.addRow(['Function Code', 'Application Code']);
      worksheet.addRow(['FUNC001', 'APP001']);
      worksheet.addRow(['', 'APP002']); // Missing function code

      const buffer = await workbook.xlsx.writeBuffer();

      const config = {
        entityType: 'FunctionAppMapping',
        columnMapping: {
          'Function Code': 'functionCode',
          'Application Code': 'applicationCode'
        }
      };

      const result = await parser.parseExcelFile(buffer, config);

      expect(result.validRecords).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errors).toContain('Function Code is required');
    });

    test('should generate error report', () => {
      const errors = [
        {
          row: 2,
          data: { code: '', name: 'Test' },
          errors: ['Code is required']
        },
        {
          row: 3,
          data: { code: 'TOOLONG123456789012345', name: 'Test' },
          errors: ['Code must be 2-20 characters, alphanumeric and hyphen only']
        }
      ];

      const report = parser.generateErrorReport(errors);

      expect(report).toContain('Found 2 error(s)');
      expect(report).toContain('Row 2');
      expect(report).toContain('Row 3');
      expect(report).toContain('Code is required');
    });
  });

  describe('BulkImportService', () => {
    let service;

    beforeEach(() => {
      service = new BulkImportService();
    });

    test('should get correct entity config for BusinessUnit', () => {
      const config = service._getEntityConfig('BusinessUnit');

      expect(config.entityType).toBe('BusinessUnit');
      expect(config.columnMapping).toHaveProperty('Code');
      expect(config.columnMapping).toHaveProperty('Name');
    });

    test('should get correct entity config for Division', () => {
      const config = service._getEntityConfig('Division');

      expect(config.entityType).toBe('Division');
      expect(config.columnMapping).toHaveProperty('Code');
      expect(config.columnMapping).toHaveProperty('Name');
      expect(config.columnMapping).toHaveProperty('Business Unit Code');
    });

    test('should throw error for unknown entity type', () => {
      expect(() => service._getEntityConfig('UnknownType')).toThrow('Unknown entity type');
    });

    test('should generate import report', () => {
      const results = {
        success: true,
        totalRows: 10,
        imported: 8,
        updated: 1,
        skipped: 0,
        failed: 1,
        errors: [
          {
            row: 5,
            data: { code: 'TEST', name: 'Test' },
            errors: ['Duplicate code']
          }
        ],
        duration: 1500
      };

      const report = service.generateReport(results);

      expect(report).toContain('SUCCESS');
      expect(report).toContain('Total Rows: 10');
      expect(report).toContain('Imported: 8');
      expect(report).toContain('Failed: 1');
      expect(report).toContain('Row 5');
    });
  });
});
