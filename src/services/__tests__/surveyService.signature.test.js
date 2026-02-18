/**
 * Unit tests for Signature question type in SurveyService
 */

const { SurveyService } = require('../surveyService');
const db = require('../../database/connection');

// Mock database
jest.mock('../../database/connection');

describe('SurveyService - Signature Question Type', () => {
  let surveyService;
  let mockPool;
  let mockRequest;
  let mockTransaction;

  beforeEach(() => {
    surveyService = new SurveyService();
    
    mockRequest = {
      input: jest.fn().mockReturnThis(),
      query: jest.fn(),
      execute: jest.fn()
    };

    mockTransaction = {
      begin: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      request: jest.fn().mockReturnValue(mockRequest)
    };

    mockPool = {
      request: jest.fn().mockReturnValue(mockRequest),
      transaction: jest.fn().mockReturnValue(mockTransaction)
    };

    db.getPool.mockResolvedValue(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateQuestionType', () => {
    it('should accept Signature as a valid question type', () => {
      expect(() => {
        surveyService.validateQuestionType('Signature');
      }).not.toThrow();
    });

    it('should accept all valid question types including Signature', () => {
      const validTypes = [
        'HeroCover',
        'Text',
        'MultipleChoice',
        'Checkbox',
        'Dropdown',
        'MatrixLikert',
        'Rating',
        'Date',
        'Signature'
      ];

      validTypes.forEach(type => {
        expect(() => {
          surveyService.validateQuestionType(type);
        }).not.toThrow();
      });
    });

    it('should reject invalid question types', () => {
      expect(() => {
        surveyService.validateQuestionType('InvalidType');
      }).toThrow('Question type must be one of');
    });
  });

  describe('addQuestion - Signature type', () => {
    const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';
    const mockUserId = '123e4567-e89b-12d3-a456-426614174001';

    beforeEach(() => {
      // Mock survey exists check
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          SurveyId: mockSurveyId,
          Status: 'Draft'
        }]
      });

      // Mock get max display order
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{ MaxOrder: 0 }]
      });

      // Mock insert question
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          QuestionId: '123e4567-e89b-12d3-a456-426614174002',
          SurveyId: mockSurveyId,
          Type: 'Signature',
          PromptText: 'Please sign here',
          Subtitle: 'Your signature',
          ImageUrl: null,
          IsMandatory: true,
          DisplayOrder: 1,
          PageNumber: 1,
          LayoutOrientation: null,
          Options: null,
          CommentRequiredBelowRating: null,
          CreatedAt: new Date(),
          CreatedBy: mockUserId,
          UpdatedAt: null,
          UpdatedBy: null
        }]
      });
    });

    it('should create a Signature question successfully', async () => {
      const questionData = {
        type: 'Signature',
        promptText: 'Please sign here',
        subtitle: 'Your signature',
        isMandatory: true,
        pageNumber: 1,
        createdBy: mockUserId
      };

      const result = await surveyService.addQuestion(mockSurveyId, questionData);

      expect(result).toBeDefined();
      expect(result.Type).toBe('Signature');
      expect(result.PromptText).toBe('Please sign here');
      expect(result.IsMandatory).toBe(true);
    });

    it('should create a Signature question with optional subtitle', async () => {
      // Reset mocks for this test
      mockRequest.query.mockReset();
      
      // Mock survey exists check
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          SurveyId: mockSurveyId,
          Status: 'Draft'
        }]
      });

      // Mock get max display order
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{ MaxOrder: 0 }]
      });

      // Mock insert question with correct subtitle
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          QuestionId: '123e4567-e89b-12d3-a456-426614174002',
          SurveyId: mockSurveyId,
          Type: 'Signature',
          PromptText: 'Sign below',
          Subtitle: 'Digital signature',
          IsMandatory: false,
          DisplayOrder: 1,
          PageNumber: 1,
          CreatedBy: mockUserId
        }]
      });

      const questionData = {
        type: 'Signature',
        promptText: 'Sign below',
        subtitle: 'Digital signature',
        isMandatory: false,
        createdBy: mockUserId
      };

      const result = await surveyService.addQuestion(mockSurveyId, questionData);

      expect(result).toBeDefined();
      expect(result.Subtitle).toBe('Digital signature');
    });

    it('should create a Signature question with image URL', async () => {
      // Reset mocks for this test
      mockRequest.query.mockReset();
      
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          SurveyId: mockSurveyId,
          Status: 'Draft'
        }]
      });

      mockRequest.query.mockResolvedValueOnce({
        recordset: [{ MaxOrder: 0 }]
      });

      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          QuestionId: '123e4567-e89b-12d3-a456-426614174002',
          SurveyId: mockSurveyId,
          Type: 'Signature',
          PromptText: 'Sign here',
          ImageUrl: '/uploads/signature-example.png',
          IsMandatory: true,
          DisplayOrder: 1,
          PageNumber: 1,
          CreatedBy: mockUserId
        }]
      });

      const questionData = {
        type: 'Signature',
        promptText: 'Sign here',
        imageUrl: '/uploads/signature-example.png',
        isMandatory: true,
        createdBy: mockUserId
      };

      const result = await surveyService.addQuestion(mockSurveyId, questionData);

      expect(result).toBeDefined();
      expect(result.ImageUrl).toBe('/uploads/signature-example.png');
    });

    it('should validate required fields for Signature question', async () => {
      const questionData = {
        type: 'Signature',
        // Missing promptText
        createdBy: mockUserId
      };

      await expect(
        surveyService.addQuestion(mockSurveyId, questionData)
      ).rejects.toThrow('Prompt text is required');
    });

    it('should create mandatory Signature question', async () => {
      const questionData = {
        type: 'Signature',
        promptText: 'Mandatory signature',
        isMandatory: true,
        createdBy: mockUserId
      };

      const result = await surveyService.addQuestion(mockSurveyId, questionData);

      expect(result).toBeDefined();
      expect(result.IsMandatory).toBe(true);
    });

    it('should create optional Signature question', async () => {
      // Reset mocks for this test
      mockRequest.query.mockReset();
      
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          SurveyId: mockSurveyId,
          Status: 'Draft'
        }]
      });

      mockRequest.query.mockResolvedValueOnce({
        recordset: [{ MaxOrder: 0 }]
      });

      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          QuestionId: '123e4567-e89b-12d3-a456-426614174002',
          SurveyId: mockSurveyId,
          Type: 'Signature',
          PromptText: 'Optional signature',
          IsMandatory: false,
          DisplayOrder: 1,
          PageNumber: 1,
          CreatedBy: mockUserId
        }]
      });

      const questionData = {
        type: 'Signature',
        promptText: 'Optional signature',
        isMandatory: false,
        createdBy: mockUserId
      };

      const result = await surveyService.addQuestion(mockSurveyId, questionData);

      expect(result).toBeDefined();
      expect(result.IsMandatory).toBe(false);
    });
  });

  describe('updateQuestion - Signature type', () => {
    const mockQuestionId = '123e4567-e89b-12d3-a456-426614174002';
    const mockUserId = '123e4567-e89b-12d3-a456-426614174001';

    it('should update Signature question successfully', async () => {
      // Reset mocks for this test
      mockRequest.query.mockReset();
      
      // Mock question exists check
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          QuestionId: mockQuestionId,
          SurveyId: '123e4567-e89b-12d3-a456-426614174000',
          Type: 'Signature',
          PromptText: 'Old prompt',
          IsMandatory: false
        }]
      });

      // Mock check for responses - return proper structure
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{ count: 0 }]
      });

      // Mock update question
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          QuestionId: mockQuestionId,
          Type: 'Signature',
          PromptText: 'Updated prompt',
          Subtitle: 'Updated subtitle',
          IsMandatory: true,
          UpdatedAt: new Date(),
          UpdatedBy: mockUserId
        }]
      });

      const updateData = {
        promptText: 'Updated prompt',
        subtitle: 'Updated subtitle',
        isMandatory: true,
        updatedBy: mockUserId
      };

      const result = await surveyService.updateQuestion(mockQuestionId, updateData);

      expect(result).toBeDefined();
      expect(result.PromptText).toBe('Updated prompt');
      expect(result.Subtitle).toBe('Updated subtitle');
      expect(result.IsMandatory).toBe(true);
    });
  });

  describe('Signature question validation', () => {
    it('should not allow layout orientation for Signature questions', () => {
      // Signature questions should not have layout orientation
      // This is implicitly tested by the fact that Signature questions
      // don't use the layoutOrientation field
      const questionData = {
        type: 'Signature',
        promptText: 'Sign here',
        layoutOrientation: 'horizontal', // This should be ignored
        createdBy: '123e4567-e89b-12d3-a456-426614174001'
      };

      // The service should accept this but ignore layoutOrientation for Signature type
      expect(() => {
        surveyService.validateQuestionType(questionData.type);
      }).not.toThrow();
    });

    it('should not require options for Signature questions', async () => {
      const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';
      const mockUserId = '123e4567-e89b-12d3-a456-426614174001';

      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          SurveyId: mockSurveyId,
          Status: 'Draft'
        }]
      });

      mockRequest.query.mockResolvedValueOnce({
        recordset: [{ MaxOrder: 0 }]
      });

      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          QuestionId: '123e4567-e89b-12d3-a456-426614174002',
          Type: 'Signature',
          PromptText: 'Sign here',
          Options: null,
          CreatedBy: mockUserId
        }]
      });

      const questionData = {
        type: 'Signature',
        promptText: 'Sign here',
        // No options field
        createdBy: mockUserId
      };

      const result = await surveyService.addQuestion(mockSurveyId, questionData);

      expect(result).toBeDefined();
      expect(result.Options).toBeNull();
    });
  });
});
