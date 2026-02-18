const { SurveyService, ValidationError, NotFoundError, ConflictError } = require('../surveyService');
const db = require('../../database/connection');
const sql = require('mssql');

// Mock dependencies
jest.mock('../../database/connection');
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('SurveyService - Scheduling Operations', () => {
  let surveyService;
  let mockPool;
  let mockRequest;

  beforeEach(() => {
    surveyService = new SurveyService();
    
    mockRequest = {
      input: jest.fn().mockReturnThis(),
      query: jest.fn()
    };

    mockPool = {
      request: jest.fn().mockReturnValue(mockRequest)
    };

    db.getPool.mockResolvedValue(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateNextExecution', () => {
    it('should return null for once frequency', () => {
      const scheduledDate = new Date('2024-03-15T10:00:00');
      const result = surveyService.calculateNextExecution(scheduledDate, 'once', '10:00', null);
      
      expect(result).toBeNull();
    });

    it('should calculate next day for daily frequency', () => {
      const scheduledDate = new Date('2024-03-15T10:00:00');
      const result = surveyService.calculateNextExecution(scheduledDate, 'daily', '14:30', null);
      
      expect(result.getDate()).toBe(16);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });

    it('should calculate next week for weekly frequency', () => {
      const scheduledDate = new Date('2024-03-15T10:00:00');
      const result = surveyService.calculateNextExecution(scheduledDate, 'weekly', '09:00', 5);
      
      expect(result.getDate()).toBe(22);
      expect(result.getHours()).toBe(9);
      expect(result.getMinutes()).toBe(0);
    });

    it('should calculate next month for monthly frequency', () => {
      const scheduledDate = new Date('2024-03-15T10:00:00');
      const result = surveyService.calculateNextExecution(scheduledDate, 'monthly', '11:00', null);
      
      expect(result.getMonth()).toBe(3); // April (0-indexed)
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(11);
      expect(result.getMinutes()).toBe(0);
    });

    it('should return null for invalid frequency', () => {
      const scheduledDate = new Date('2024-03-15T10:00:00');
      const result = surveyService.calculateNextExecution(scheduledDate, 'invalid', '10:00', null);
      
      expect(result).toBeNull();
    });
  });

  describe('scheduleBlast', () => {
    const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';
    const mockUserId = '123e4567-e89b-12d3-a456-426614174001';

    it('should schedule a one-time blast successfully', async () => {
      const request = {
        surveyId: mockSurveyId,
        scheduledDate: new Date('2024-03-20T10:00:00'),
        frequency: 'once',
        emailTemplate: 'Test email template',
        embedCover: true,
        targetCriteria: { businessUnitIds: ['bu1'] },
        createdBy: mockUserId
      };

      // Mock survey exists check
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ SurveyId: mockSurveyId, Title: 'Test Survey' }]
        })
        // Mock insert operation
        .mockResolvedValueOnce({
          recordset: [{
            OperationId: 'op-123',
            SurveyId: mockSurveyId,
            OperationType: 'Blast',
            Frequency: 'once',
            ScheduledDate: request.scheduledDate,
            ScheduledTime: null,
            DayOfWeek: null,
            EmailTemplate: request.emailTemplate,
            EmbedCover: true,
            TargetCriteria: JSON.stringify(request.targetCriteria),
            Status: 'Pending',
            NextExecutionAt: null,
            CreatedAt: new Date()
          }]
        });

      const result = await surveyService.scheduleBlast(request);

      expect(result).toHaveProperty('operationId', 'op-123');
      expect(result).toHaveProperty('operationType', 'Blast');
      expect(result).toHaveProperty('frequency', 'once');
      expect(result).toHaveProperty('status', 'Pending');
      expect(result.targetCriteria).toEqual(request.targetCriteria);
      expect(mockRequest.input).toHaveBeenCalledWith('operationType', sql.NVarChar(50), 'Blast');
    });

    it('should schedule a recurring daily blast successfully', async () => {
      const request = {
        surveyId: mockSurveyId,
        scheduledDate: new Date('2024-03-20T10:00:00'),
        frequency: 'daily',
        scheduledTime: '14:30',
        emailTemplate: 'Daily email template',
        embedCover: false,
        createdBy: mockUserId
      };

      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ SurveyId: mockSurveyId, Title: 'Test Survey' }]
        })
        .mockResolvedValueOnce({
          recordset: [{
            OperationId: 'op-456',
            SurveyId: mockSurveyId,
            OperationType: 'Blast',
            Frequency: 'daily',
            ScheduledDate: request.scheduledDate,
            ScheduledTime: '14:30',
            DayOfWeek: null,
            EmailTemplate: request.emailTemplate,
            EmbedCover: false,
            TargetCriteria: null,
            Status: 'Pending',
            NextExecutionAt: new Date('2024-03-21T14:30:00'),
            CreatedAt: new Date()
          }]
        });

      const result = await surveyService.scheduleBlast(request);

      expect(result).toHaveProperty('frequency', 'daily');
      expect(result).toHaveProperty('scheduledTime', '14:30');
      expect(result.nextExecutionAt).toBeTruthy();
    });

    it('should schedule a weekly blast successfully', async () => {
      const request = {
        surveyId: mockSurveyId,
        scheduledDate: new Date('2024-03-20T10:00:00'),
        frequency: 'weekly',
        scheduledTime: '09:00',
        dayOfWeek: 3, // Wednesday
        emailTemplate: 'Weekly email template',
        embedCover: true,
        createdBy: mockUserId
      };

      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ SurveyId: mockSurveyId, Title: 'Test Survey' }]
        })
        .mockResolvedValueOnce({
          recordset: [{
            OperationId: 'op-789',
            SurveyId: mockSurveyId,
            OperationType: 'Blast',
            Frequency: 'weekly',
            ScheduledDate: request.scheduledDate,
            ScheduledTime: '09:00',
            DayOfWeek: 3,
            EmailTemplate: request.emailTemplate,
            EmbedCover: true,
            TargetCriteria: null,
            Status: 'Pending',
            NextExecutionAt: new Date('2024-03-27T09:00:00'),
            CreatedAt: new Date()
          }]
        });

      const result = await surveyService.scheduleBlast(request);

      expect(result).toHaveProperty('frequency', 'weekly');
      expect(result).toHaveProperty('dayOfWeek', 3);
    });

    it('should throw ValidationError if required fields are missing', async () => {
      const request = {
        surveyId: mockSurveyId
        // Missing scheduledDate and emailTemplate
      };

      await expect(surveyService.scheduleBlast(request))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid frequency', async () => {
      const request = {
        surveyId: mockSurveyId,
        scheduledDate: new Date('2024-03-20T10:00:00'),
        frequency: 'invalid',
        emailTemplate: 'Test template'
      };

      await expect(surveyService.scheduleBlast(request))
        .rejects.toThrow('Frequency must be one of');
    });

    it('should throw ValidationError for weekly without dayOfWeek', async () => {
      const request = {
        surveyId: mockSurveyId,
        scheduledDate: new Date('2024-03-20T10:00:00'),
        frequency: 'weekly',
        scheduledTime: '10:00',
        emailTemplate: 'Test template'
      };

      await expect(surveyService.scheduleBlast(request))
        .rejects.toThrow('Weekly scheduling requires dayOfWeek');
    });

    it('should throw ValidationError for recurring without scheduledTime', async () => {
      const request = {
        surveyId: mockSurveyId,
        scheduledDate: new Date('2024-03-20T10:00:00'),
        frequency: 'daily',
        emailTemplate: 'Test template'
      };

      await expect(surveyService.scheduleBlast(request))
        .rejects.toThrow('Recurring schedules require scheduledTime');
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      const request = {
        surveyId: mockSurveyId,
        scheduledDate: new Date('2024-03-20T10:00:00'),
        frequency: 'once',
        emailTemplate: 'Test template'
      };

      mockRequest.query.mockResolvedValueOnce({
        recordset: [] // Survey not found
      });

      await expect(surveyService.scheduleBlast(request))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('scheduleReminder', () => {
    const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';
    const mockUserId = '123e4567-e89b-12d3-a456-426614174001';

    it('should schedule a one-time reminder successfully', async () => {
      const request = {
        surveyId: mockSurveyId,
        scheduledDate: new Date('2024-03-25T15:00:00'),
        frequency: 'once',
        emailTemplate: 'Reminder email template',
        embedCover: false,
        createdBy: mockUserId
      };

      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ SurveyId: mockSurveyId, Title: 'Test Survey' }]
        })
        .mockResolvedValueOnce({
          recordset: [{
            OperationId: 'rem-123',
            SurveyId: mockSurveyId,
            OperationType: 'Reminder',
            Frequency: 'once',
            ScheduledDate: request.scheduledDate,
            ScheduledTime: null,
            DayOfWeek: null,
            EmailTemplate: request.emailTemplate,
            EmbedCover: false,
            Status: 'Pending',
            NextExecutionAt: null,
            CreatedAt: new Date()
          }]
        });

      const result = await surveyService.scheduleReminder(request);

      expect(result).toHaveProperty('operationId', 'rem-123');
      expect(result).toHaveProperty('operationType', 'Reminder');
      expect(result).toHaveProperty('frequency', 'once');
      expect(mockRequest.input).toHaveBeenCalledWith('operationType', sql.NVarChar(50), 'Reminder');
    });

    it('should schedule a recurring weekly reminder successfully', async () => {
      const request = {
        surveyId: mockSurveyId,
        scheduledDate: new Date('2024-03-20T10:00:00'),
        frequency: 'weekly',
        scheduledTime: '16:00',
        dayOfWeek: 1, // Monday
        emailTemplate: 'Weekly reminder template',
        embedCover: true,
        createdBy: mockUserId
      };

      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ SurveyId: mockSurveyId, Title: 'Test Survey' }]
        })
        .mockResolvedValueOnce({
          recordset: [{
            OperationId: 'rem-456',
            SurveyId: mockSurveyId,
            OperationType: 'Reminder',
            Frequency: 'weekly',
            ScheduledDate: request.scheduledDate,
            ScheduledTime: '16:00',
            DayOfWeek: 1,
            EmailTemplate: request.emailTemplate,
            EmbedCover: true,
            Status: 'Pending',
            NextExecutionAt: new Date('2024-03-27T16:00:00'),
            CreatedAt: new Date()
          }]
        });

      const result = await surveyService.scheduleReminder(request);

      expect(result).toHaveProperty('frequency', 'weekly');
      expect(result).toHaveProperty('dayOfWeek', 1);
      expect(result.nextExecutionAt).toBeTruthy();
    });

    it('should throw ValidationError if required fields are missing', async () => {
      const request = {
        surveyId: mockSurveyId
      };

      await expect(surveyService.scheduleReminder(request))
        .rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      const request = {
        surveyId: mockSurveyId,
        scheduledDate: new Date('2024-03-25T15:00:00'),
        frequency: 'once',
        emailTemplate: 'Test template'
      };

      mockRequest.query.mockResolvedValueOnce({
        recordset: []
      });

      await expect(surveyService.scheduleReminder(request))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('getScheduledOperations', () => {
    const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';

    it('should retrieve all scheduled operations for a survey', async () => {
      const mockOperations = [
        {
          OperationId: 'op-1',
          SurveyId: mockSurveyId,
          OperationType: 'Blast',
          Frequency: 'once',
          ScheduledDate: new Date('2024-03-20T10:00:00'),
          ScheduledTime: null,
          DayOfWeek: null,
          EmailTemplate: 'Template 1',
          EmbedCover: true,
          TargetCriteria: JSON.stringify({ businessUnitIds: ['bu1'] }),
          Status: 'Pending',
          NextExecutionAt: null,
          LastExecutedAt: null,
          ExecutionCount: 0,
          ErrorMessage: null,
          CreatedAt: new Date(),
          CreatedBy: 'user-1',
          DisplayName: 'John Doe'
        },
        {
          OperationId: 'op-2',
          SurveyId: mockSurveyId,
          OperationType: 'Reminder',
          Frequency: 'daily',
          ScheduledDate: new Date('2024-03-21T14:00:00'),
          ScheduledTime: '14:00',
          DayOfWeek: null,
          EmailTemplate: 'Template 2',
          EmbedCover: false,
          TargetCriteria: null,
          Status: 'Completed',
          NextExecutionAt: new Date('2024-03-22T14:00:00'),
          LastExecutedAt: new Date('2024-03-21T14:00:00'),
          ExecutionCount: 1,
          ErrorMessage: null,
          CreatedAt: new Date(),
          CreatedBy: 'user-1',
          DisplayName: 'John Doe'
        }
      ];

      mockRequest.query.mockResolvedValueOnce({
        recordset: mockOperations
      });

      const result = await surveyService.getScheduledOperations(mockSurveyId);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('operationId', 'op-1');
      expect(result[0]).toHaveProperty('operationType', 'Blast');
      expect(result[0].targetCriteria).toEqual({ businessUnitIds: ['bu1'] });
      expect(result[1]).toHaveProperty('operationType', 'Reminder');
      expect(result[1]).toHaveProperty('executionCount', 1);
    });

    it('should filter operations by type', async () => {
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          OperationId: 'op-1',
          SurveyId: mockSurveyId,
          OperationType: 'Blast',
          Frequency: 'once',
          ScheduledDate: new Date(),
          ScheduledTime: null,
          DayOfWeek: null,
          EmailTemplate: 'Template',
          EmbedCover: false,
          TargetCriteria: null,
          Status: 'Pending',
          NextExecutionAt: null,
          LastExecutedAt: null,
          ExecutionCount: 0,
          ErrorMessage: null,
          CreatedAt: new Date(),
          CreatedBy: null,
          DisplayName: null
        }]
      });

      const result = await surveyService.getScheduledOperations(mockSurveyId, {
        operationType: 'Blast'
      });

      expect(result).toHaveLength(1);
      expect(result[0].operationType).toBe('Blast');
      expect(mockRequest.input).toHaveBeenCalledWith('operationType', sql.NVarChar(50), 'Blast');
    });

    it('should filter operations by status', async () => {
      mockRequest.query.mockResolvedValueOnce({
        recordset: []
      });

      await surveyService.getScheduledOperations(mockSurveyId, {
        status: 'Pending'
      });

      expect(mockRequest.input).toHaveBeenCalledWith('status', sql.NVarChar(50), 'Pending');
    });

    it('should return empty array if no operations found', async () => {
      mockRequest.query.mockResolvedValueOnce({
        recordset: []
      });

      const result = await surveyService.getScheduledOperations(mockSurveyId);

      expect(result).toEqual([]);
    });
  });

  describe('cancelScheduledOperation', () => {
    const mockOperationId = 'op-123';

    it('should cancel a pending operation successfully', async () => {
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{
            OperationId: mockOperationId,
            Status: 'Pending',
            OperationType: 'Blast',
            SurveyId: 'survey-123'
          }]
        })
        .mockResolvedValueOnce({
          recordset: [{
            OperationId: mockOperationId,
            SurveyId: 'survey-123',
            OperationType: 'Blast',
            Status: 'Cancelled',
            Frequency: 'once',
            ScheduledDate: new Date(),
            NextExecutionAt: null
          }]
        });

      const result = await surveyService.cancelScheduledOperation(mockOperationId);

      expect(result).toHaveProperty('operationId', mockOperationId);
      expect(result).toHaveProperty('status', 'Cancelled');
      expect(result.nextExecutionAt).toBeNull();
    });

    it('should cancel a failed operation successfully', async () => {
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{
            OperationId: mockOperationId,
            Status: 'Failed',
            OperationType: 'Reminder',
            SurveyId: 'survey-123'
          }]
        })
        .mockResolvedValueOnce({
          recordset: [{
            OperationId: mockOperationId,
            SurveyId: 'survey-123',
            OperationType: 'Reminder',
            Status: 'Cancelled',
            Frequency: 'daily',
            ScheduledDate: new Date(),
            NextExecutionAt: null
          }]
        });

      const result = await surveyService.cancelScheduledOperation(mockOperationId);

      expect(result.status).toBe('Cancelled');
    });

    it('should throw NotFoundError if operation does not exist', async () => {
      mockRequest.query.mockResolvedValueOnce({
        recordset: []
      });

      await expect(surveyService.cancelScheduledOperation(mockOperationId))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError if operation is completed', async () => {
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          OperationId: mockOperationId,
          Status: 'Completed',
          OperationType: 'Blast',
          SurveyId: 'survey-123'
        }]
      });

      await expect(surveyService.cancelScheduledOperation(mockOperationId))
        .rejects.toThrow('Cannot cancel completed operation');
    });

    it('should throw ConflictError if operation is already cancelled', async () => {
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          OperationId: mockOperationId,
          Status: 'Cancelled',
          OperationType: 'Blast',
          SurveyId: 'survey-123'
        }]
      });

      await expect(surveyService.cancelScheduledOperation(mockOperationId))
        .rejects.toThrow('Operation is already cancelled');
    });

    it('should throw ConflictError if operation is running', async () => {
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          OperationId: mockOperationId,
          Status: 'Running',
          OperationType: 'Blast',
          SurveyId: 'survey-123'
        }]
      });

      await expect(surveyService.cancelScheduledOperation(mockOperationId))
        .rejects.toThrow('Cannot cancel operation that is currently running');
    });
  });
});
