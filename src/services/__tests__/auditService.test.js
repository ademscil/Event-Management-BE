const auditService = require('../auditService');
const { getPool } = require('../../database/connection');

// Mock dependencies
jest.mock('../../database/connection');
jest.mock('../../config/logger');

describe('AuditService', () => {
  let mockPool;
  let mockRequest;

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

    getPool.mockResolvedValue(mockPool);
  });

  describe('logAction', () => {
    it('should log a valid action successfully', async () => {
      const mockAuditLog = {
        LogId: 'test-log-id',
        Timestamp: new Date(),
        Action: 'Create',
        EntityType: 'User',
        EntityId: 'test-entity-id'
      };

      mockRequest.query.mockResolvedValue({
        recordset: [mockAuditLog]
      });

      const logData = {
        userId: 'test-user-id',
        username: 'testuser',
        action: 'Create',
        entityType: 'User',
        entityId: 'test-entity-id',
        newValues: { name: 'Test User' },
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      };

      const result = await auditService.logAction(logData);

      expect(result.success).toBe(true);
      expect(result.logId).toBe(mockAuditLog.LogId);
      expect(mockRequest.input).toHaveBeenCalledWith('userId', expect.anything(), logData.userId);
      expect(mockRequest.input).toHaveBeenCalledWith('username', expect.anything(), logData.username);
      expect(mockRequest.input).toHaveBeenCalledWith('action', expect.anything(), logData.action);
    });

    it('should reject invalid action type', async () => {
      const logData = {
        userId: 'test-user-id',
        username: 'testuser',
        action: 'InvalidAction',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      };

      const result = await auditService.logAction(logData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid action type');
    });

    it('should handle null userId for failed logins', async () => {
      const mockAuditLog = {
        LogId: 'test-log-id',
        Timestamp: new Date(),
        Action: 'LoginFailed'
      };

      mockRequest.query.mockResolvedValue({
        recordset: [mockAuditLog]
      });

      const logData = {
        userId: null,
        username: 'testuser',
        action: 'LoginFailed',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      };

      const result = await auditService.logAction(logData);

      expect(result.success).toBe(true);
      expect(mockRequest.input).toHaveBeenCalledWith('userId', expect.anything(), null);
    });

    it('should serialize objects to JSON', async () => {
      const mockAuditLog = {
        LogId: 'test-log-id',
        Timestamp: new Date(),
        Action: 'Update'
      };

      mockRequest.query.mockResolvedValue({
        recordset: [mockAuditLog]
      });

      const oldValues = { name: 'Old Name' };
      const newValues = { name: 'New Name' };

      const logData = {
        userId: 'test-user-id',
        username: 'testuser',
        action: 'Update',
        entityType: 'User',
        entityId: 'test-entity-id',
        oldValues: oldValues,
        newValues: newValues,
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      };

      await auditService.logAction(logData);

      expect(mockRequest.input).toHaveBeenCalledWith('oldValues', expect.anything(), JSON.stringify(oldValues));
      expect(mockRequest.input).toHaveBeenCalledWith('newValues', expect.anything(), JSON.stringify(newValues));
    });
  });

  describe('logAuthAttempt', () => {
    it('should log successful login', async () => {
      const mockAuditLog = {
        LogId: 'test-log-id',
        Timestamp: new Date(),
        Action: 'Login'
      };

      mockRequest.query.mockResolvedValue({
        recordset: [mockAuditLog]
      });

      const result = await auditService.logAuthAttempt(
        'testuser',
        true,
        '127.0.0.1',
        'Test Agent',
        'test-user-id'
      );

      expect(result.success).toBe(true);
      expect(mockRequest.input).toHaveBeenCalledWith('action', expect.anything(), 'Login');
    });

    it('should log failed login', async () => {
      const mockAuditLog = {
        LogId: 'test-log-id',
        Timestamp: new Date(),
        Action: 'LoginFailed'
      };

      mockRequest.query.mockResolvedValue({
        recordset: [mockAuditLog]
      });

      const result = await auditService.logAuthAttempt(
        'testuser',
        false,
        '127.0.0.1',
        'Test Agent'
      );

      expect(result.success).toBe(true);
      expect(mockRequest.input).toHaveBeenCalledWith('action', expect.anything(), 'LoginFailed');
      expect(mockRequest.input).toHaveBeenCalledWith('userId', expect.anything(), null);
    });
  });

  describe('getAuditLogs', () => {
    it('should retrieve audit logs with pagination', async () => {
      const mockLogs = [
        {
          LogId: 'log-1',
          Timestamp: new Date(),
          Action: 'Create',
          OldValues: null,
          NewValues: '{"name":"Test"}'
        }
      ];

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ Total: 1 }] })
        .mockResolvedValueOnce({ recordset: mockLogs });

      const result = await auditService.getAuditLogs({
        page: 1,
        pageSize: 50
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].NewValues).toEqual({ name: 'Test' });
      expect(result.pagination.totalRecords).toBe(1);
    });

    it('should apply filters correctly', async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ Total: 0 }] })
        .mockResolvedValueOnce({ recordset: [] });

      await auditService.getAuditLogs({
        userId: 'test-user-id',
        action: 'Create',
        entityType: 'User',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31')
      });

      expect(mockRequest.input).toHaveBeenCalledWith('userId', expect.anything(), 'test-user-id');
      expect(mockRequest.input).toHaveBeenCalledWith('action', expect.anything(), 'Create');
      expect(mockRequest.input).toHaveBeenCalledWith('entityType', expect.anything(), 'User');
    });
  });

  describe('getEntityHistory', () => {
    it('should retrieve entity history', async () => {
      const mockHistory = [
        {
          LogId: 'log-1',
          Timestamp: new Date('2024-01-01'),
          Action: 'Create',
          OldValues: null,
          NewValues: '{"name":"Test"}'
        },
        {
          LogId: 'log-2',
          Timestamp: new Date('2024-01-02'),
          Action: 'Update',
          OldValues: '{"name":"Test"}',
          NewValues: '{"name":"Updated"}'
        }
      ];

      mockRequest.query.mockResolvedValue({ recordset: mockHistory });

      const result = await auditService.getEntityHistory('User', 'test-user-id');

      expect(result.success).toBe(true);
      expect(result.entityType).toBe('User');
      expect(result.entityId).toBe('test-user-id');
      expect(result.history).toHaveLength(2);
      expect(result.totalChanges).toBe(2);
    });
  });

  describe('helper methods', () => {
    it('should log create action', async () => {
      const mockAuditLog = {
        LogId: 'test-log-id',
        Timestamp: new Date(),
        Action: 'Create'
      };

      mockRequest.query.mockResolvedValue({
        recordset: [mockAuditLog]
      });

      const result = await auditService.logCreate(
        'user-id',
        'username',
        'User',
        'entity-id',
        { name: 'Test' },
        '127.0.0.1',
        'Test Agent'
      );

      expect(result.success).toBe(true);
      expect(mockRequest.input).toHaveBeenCalledWith('action', expect.anything(), 'Create');
    });

    it('should log update action', async () => {
      const mockAuditLog = {
        LogId: 'test-log-id',
        Timestamp: new Date(),
        Action: 'Update'
      };

      mockRequest.query.mockResolvedValue({
        recordset: [mockAuditLog]
      });

      const result = await auditService.logUpdate(
        'user-id',
        'username',
        'User',
        'entity-id',
        { name: 'Old' },
        { name: 'New' },
        '127.0.0.1',
        'Test Agent'
      );

      expect(result.success).toBe(true);
      expect(mockRequest.input).toHaveBeenCalledWith('action', expect.anything(), 'Update');
    });

    it('should log approve action', async () => {
      const mockAuditLog = {
        LogId: 'test-log-id',
        Timestamp: new Date(),
        Action: 'Approve'
      };

      mockRequest.query.mockResolvedValue({
        recordset: [mockAuditLog]
      });

      const result = await auditService.logApprove(
        'user-id',
        'username',
        'Response',
        'entity-id',
        { reason: 'Approved' },
        '127.0.0.1',
        'Test Agent'
      );

      expect(result.success).toBe(true);
      expect(mockRequest.input).toHaveBeenCalledWith('action', expect.anything(), 'Approve');
    });
  });
});
