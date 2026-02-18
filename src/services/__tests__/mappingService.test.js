const mappingService = require('../mappingService');
const db = require('../../database/connection');

// Mock the database connection
jest.mock('../../database/connection');
jest.mock('../../config/logger');

describe('MappingService', () => {
  let mockPool;
  let mockRequest;
  let mockTransaction;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock request
    mockRequest = {
      input: jest.fn().mockReturnThis(),
      query: jest.fn()
    };

    // Setup mock pool
    mockPool = {
      request: jest.fn().mockReturnValue(mockRequest)
    };

    // Setup mock transaction
    mockTransaction = {
      begin: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined)
    };

    db.getPool.mockResolvedValue(mockPool);
  });

  describe('Function-Application Mapping', () => {
    describe('createFunctionAppMapping', () => {
      it('should create a single Function-Application mapping', async () => {
        const functionId = 'func-123';
        const applicationId = 'app-456';
        const createdBy = 'user-789';

        // Mock validation queries
        mockRequest.query
          .mockResolvedValueOnce({ recordset: [{ FunctionId: functionId }] }) // Function exists
          .mockResolvedValueOnce({ recordset: [{ ApplicationId: applicationId }] }) // Application exists
          .mockResolvedValueOnce({ recordset: [] }) // No duplicate
          .mockResolvedValueOnce({ 
            recordset: [{ 
              MappingId: 'mapping-123',
              FunctionId: functionId,
              ApplicationId: applicationId,
              CreatedBy: createdBy
            }] 
          }); // Create mapping

        const result = await mappingService.createFunctionAppMapping(functionId, applicationId, createdBy);

        expect(result).toBeDefined();
        expect(result.FunctionId).toBe(functionId);
        expect(result.ApplicationId).toBe(applicationId);
      });

      it('should throw error if function does not exist', async () => {
        const functionId = 'invalid-func';
        const applicationId = 'app-456';

        mockRequest.query.mockResolvedValueOnce({ recordset: [] }); // Function not found

        await expect(
          mappingService.createFunctionAppMapping(functionId, applicationId)
        ).rejects.toThrow('Function not found or inactive');
      });

      it('should throw error if mapping already exists', async () => {
        const functionId = 'func-123';
        const applicationId = 'app-456';

        mockRequest.query
          .mockResolvedValueOnce({ recordset: [{ FunctionId: functionId }] }) // Function exists
          .mockResolvedValueOnce({ recordset: [{ ApplicationId: applicationId }] }) // Application exists
          .mockResolvedValueOnce({ recordset: [{ MappingId: 'existing' }] }); // Duplicate found

        await expect(
          mappingService.createFunctionAppMapping(functionId, applicationId)
        ).rejects.toThrow('Mapping already exists');
      });
    });

    describe('getFunctionAppMappingsWithDetails', () => {
      it('should return mappings grouped by function with application tags', async () => {
        const mockData = [
          {
            FunctionId: 'func-1',
            FunctionCode: 'F001',
            FunctionName: 'IT Support',
            ApplicationId: 'app-1',
            ApplicationCode: 'A001',
            ApplicationName: 'App 1',
            MappingId: 'map-1',
            CreatedAt: new Date()
          },
          {
            FunctionId: 'func-1',
            FunctionCode: 'F001',
            FunctionName: 'IT Support',
            ApplicationId: 'app-2',
            ApplicationCode: 'A002',
            ApplicationName: 'App 2',
            MappingId: 'map-2',
            CreatedAt: new Date()
          }
        ];

        mockRequest.query.mockResolvedValueOnce({ recordset: mockData });

        const result = await mappingService.getFunctionAppMappingsWithDetails();

        expect(result).toHaveLength(1);
        expect(result[0].functionId).toBe('func-1');
        expect(result[0].applications).toHaveLength(2);
        expect(result[0].applications[0].applicationId).toBe('app-1');
        expect(result[0].applications[1].applicationId).toBe('app-2');
      });
    });

    describe('deleteFunctionAppMappingByEntities', () => {
      it('should delete mapping by function and application IDs', async () => {
        const functionId = 'func-123';
        const applicationId = 'app-456';

        mockRequest.query.mockResolvedValueOnce({ rowsAffected: [1] });

        const result = await mappingService.deleteFunctionAppMappingByEntities(functionId, applicationId);

        expect(result).toBe(true);
        expect(mockRequest.input).toHaveBeenCalledWith('functionId', functionId);
        expect(mockRequest.input).toHaveBeenCalledWith('applicationId', applicationId);
      });

      it('should throw error if mapping not found', async () => {
        mockRequest.query.mockResolvedValueOnce({ rowsAffected: [0] });

        await expect(
          mappingService.deleteFunctionAppMappingByEntities('func-123', 'app-456')
        ).rejects.toThrow('Mapping not found');
      });
    });
  });

  describe('Application-Department Mapping', () => {
    describe('createAppDeptMapping', () => {
      it('should create a single Application-Department mapping', async () => {
        const applicationId = 'app-123';
        const departmentId = 'dept-456';
        const createdBy = 'user-789';

        mockRequest.query
          .mockResolvedValueOnce({ recordset: [{ ApplicationId: applicationId }] }) // Application exists
          .mockResolvedValueOnce({ recordset: [{ DepartmentId: departmentId }] }) // Department exists
          .mockResolvedValueOnce({ recordset: [] }) // No duplicate
          .mockResolvedValueOnce({ 
            recordset: [{ 
              MappingId: 'mapping-123',
              ApplicationId: applicationId,
              DepartmentId: departmentId,
              CreatedBy: createdBy
            }] 
          }); // Create mapping

        const result = await mappingService.createAppDeptMapping(applicationId, departmentId, createdBy);

        expect(result).toBeDefined();
        expect(result.ApplicationId).toBe(applicationId);
        expect(result.DepartmentId).toBe(departmentId);
      });
    });

    describe('getAppDeptMappingsHierarchical', () => {
      it('should return hierarchical structure (BU -> Division -> Department -> Applications)', async () => {
        const mockData = [
          {
            BusinessUnitId: 'bu-1',
            BusinessUnitCode: 'BU001',
            BusinessUnitName: 'Business Unit 1',
            DivisionId: 'div-1',
            DivisionCode: 'DIV001',
            DivisionName: 'Division 1',
            DepartmentId: 'dept-1',
            DepartmentCode: 'DEPT001',
            DepartmentName: 'Department 1',
            ApplicationId: 'app-1',
            ApplicationCode: 'APP001',
            ApplicationName: 'Application 1',
            MappingId: 'map-1',
            CreatedAt: new Date()
          }
        ];

        mockRequest.query.mockResolvedValueOnce({ recordset: mockData });

        const result = await mappingService.getAppDeptMappingsHierarchical();

        expect(result).toHaveLength(1);
        expect(result[0].businessUnitId).toBe('bu-1');
        expect(result[0].divisions).toHaveLength(1);
        expect(result[0].divisions[0].divisionId).toBe('div-1');
        expect(result[0].divisions[0].departments).toHaveLength(1);
        expect(result[0].divisions[0].departments[0].departmentId).toBe('dept-1');
        expect(result[0].divisions[0].departments[0].applications).toHaveLength(1);
      });
    });
  });

  describe('CSV Export', () => {
    describe('exportFunctionAppMappingsToCSV', () => {
      it('should export Function-Application mappings to CSV format', async () => {
        const mockData = [
          {
            FunctionCode: 'F001',
            FunctionName: 'IT Support',
            ApplicationCode: 'A001',
            ApplicationName: 'App 1',
            CreatedAt: new Date('2024-01-15T10:30:00')
          },
          {
            FunctionCode: 'F002',
            FunctionName: 'Development',
            ApplicationCode: 'A002',
            ApplicationName: 'App 2',
            CreatedAt: new Date('2024-01-16T14:45:00')
          }
        ];

        mockRequest.query.mockResolvedValueOnce({ recordset: mockData });

        const csv = await mappingService.exportFunctionAppMappingsToCSV();

        expect(csv).toContain('Function Code,Function Name,Application Code,Application Name,Created At');
        expect(csv).toContain('F001,IT Support,A001,App 1');
        expect(csv).toContain('F002,Development,A002,App 2');
      });

      it('should escape CSV values with commas and quotes', async () => {
        const mockData = [
          {
            FunctionCode: 'F001',
            FunctionName: 'IT Support, Help Desk',
            ApplicationCode: 'A001',
            ApplicationName: 'App "Special"',
            CreatedAt: new Date('2024-01-15T10:30:00')
          }
        ];

        mockRequest.query.mockResolvedValueOnce({ recordset: mockData });

        const csv = await mappingService.exportFunctionAppMappingsToCSV();

        expect(csv).toContain('"IT Support, Help Desk"');
        expect(csv).toContain('"App ""Special"""');
      });
    });

    describe('exportAppDeptMappingsToCSV', () => {
      it('should export Application-Department mappings to CSV format', async () => {
        const mockData = [
          {
            BusinessUnitCode: 'BU001',
            BusinessUnitName: 'Business Unit 1',
            DivisionCode: 'DIV001',
            DivisionName: 'Division 1',
            DepartmentCode: 'DEPT001',
            DepartmentName: 'Department 1',
            ApplicationCode: 'APP001',
            ApplicationName: 'Application 1',
            CreatedAt: new Date('2024-01-15T10:30:00')
          }
        ];

        mockRequest.query.mockResolvedValueOnce({ recordset: mockData });

        const csv = await mappingService.exportAppDeptMappingsToCSV();

        expect(csv).toContain('Business Unit Code,Business Unit Name');
        expect(csv).toContain('BU001,Business Unit 1');
        expect(csv).toContain('DEPT001,Department 1');
        expect(csv).toContain('APP001,Application 1');
      });
    });
  });
});
