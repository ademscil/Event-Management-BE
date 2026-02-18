const { SurveyService, ValidationError, NotFoundError } = require('../surveyService');
const db = require('../../database/connection');
const sql = require('mssql');

// Mock dependencies
jest.mock('../../database/connection');
jest.mock('../../config/logger');

describe('SurveyService', () => {
  let surveyService;
  let mockPool;
  let mockRequest;
  let mockTransaction;

  beforeEach(() => {
    surveyService = new SurveyService();
    
    mockRequest = {
      input: jest.fn().mockReturnThis(),
      query: jest.fn()
    };

    mockTransaction = {
      begin: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined)
    };

    mockPool = {
      request: jest.fn().mockReturnValue(mockRequest)
    };

    db.getPool = jest.fn().mockResolvedValue(mockPool);
    
    // Mock sql.Transaction
    sql.Transaction = jest.fn().mockReturnValue(mockTransaction);
    sql.Request = jest.fn().mockReturnValue(mockRequest);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSurvey', () => {
    const validSurveyData = {
      title: 'Customer Satisfaction Survey 2024',
      description: 'Annual customer satisfaction survey',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      createdBy: '11111111-1111-1111-1111-111111111111',
      targetRespondents: 100,
      targetScore: 8.5
    };

    it('should create a survey with valid data', async () => {
      const mockSurvey = {
        SurveyId: '22222222-2222-2222-2222-222222222222',
        Title: validSurveyData.title,
        Status: 'Draft',
        ...validSurveyData
      };

      const mockConfig = {
        ConfigId: '33333333-3333-3333-3333-333333333333',
        SurveyId: mockSurvey.SurveyId,
        ShowProgressBar: true,
        ShowPageNumbers: true,
        MultiPage: false
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [mockSurvey] })
        .mockResolvedValueOnce({ recordset: [mockConfig] });

      const result = await surveyService.createSurvey(validSurveyData);

      expect(result.SurveyId).toBe(mockSurvey.SurveyId);
      expect(result.Title).toBe(validSurveyData.title);
      expect(result.Status).toBe('Draft');
      expect(result.configuration).toBeDefined();
      expect(mockTransaction.begin).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('should throw ValidationError if title is missing', async () => {
      const invalidData = { ...validSurveyData, title: '' };

      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow(ValidationError);
      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow('Title is required');
    });

    it('should throw ValidationError if title exceeds 500 characters', async () => {
      const invalidData = { ...validSurveyData, title: 'a'.repeat(501) };

      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow(ValidationError);
      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow('Title must not exceed 500 characters');
    });

    it('should throw ValidationError if end date is before start date', async () => {
      const invalidData = {
        ...validSurveyData,
        startDate: '2024-12-31',
        endDate: '2024-01-01'
      };

      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow(ValidationError);
      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow('End date must be after start date');
    });

    it('should throw ValidationError if dates are missing', async () => {
      const invalidData = { ...validSurveyData, startDate: undefined, endDate: undefined };

      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow(ValidationError);
      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow('Start date and end date are required');
    });

    it('should throw ValidationError if createdBy is missing', async () => {
      const invalidData = { ...validSurveyData, createdBy: undefined };

      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow(ValidationError);
      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow('CreatedBy is required');
    });

    it('should throw ValidationError if target score is out of range', async () => {
      const invalidData = { ...validSurveyData, targetScore: 11 };

      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow(ValidationError);
      await expect(surveyService.createSurvey(invalidData))
        .rejects.toThrow('Target score must be between 0 and 10');
    });

    it('should create survey with configuration', async () => {
      const dataWithConfig = {
        ...validSurveyData,
        configuration: {
          heroTitle: 'Welcome',
          heroSubtitle: 'Please share your feedback',
          primaryColor: '#007bff',
          showProgressBar: true,
          multiPage: true
        }
      };

      const mockSurvey = {
        SurveyId: '22222222-2222-2222-2222-222222222222',
        Title: dataWithConfig.title,
        Status: 'Draft'
      };

      const mockConfig = {
        ConfigId: '33333333-3333-3333-3333-333333333333',
        SurveyId: mockSurvey.SurveyId,
        HeroTitle: 'Welcome',
        HeroSubtitle: 'Please share your feedback',
        PrimaryColor: '#007bff',
        ShowProgressBar: true,
        MultiPage: true
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [mockSurvey] })
        .mockResolvedValueOnce({ recordset: [mockConfig] });

      const result = await surveyService.createSurvey(dataWithConfig);

      expect(result.configuration.HeroTitle).toBe('Welcome');
      expect(result.configuration.MultiPage).toBe(true);
    });

    it('should rollback transaction on error', async () => {
      mockRequest.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(surveyService.createSurvey(validSurveyData))
        .rejects.toThrow('Database error');
      
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  describe('updateSurvey', () => {
    const surveyId = '22222222-2222-2222-2222-222222222222';

    it('should update survey with valid data', async () => {
      const updateData = {
        title: 'Updated Survey Title',
        description: 'Updated description',
        updatedBy: '11111111-1111-1111-1111-111111111111'
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId, Status: 'Draft' }] })
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId, ...updateData }] });

      const result = await surveyService.updateSurvey(surveyId, updateData);

      expect(result.SurveyId).toBe(surveyId);
      expect(mockRequest.input).toHaveBeenCalledWith('surveyId', expect.anything(), surveyId);
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      // Create a new mock request for this test
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.updateSurvey(surveyId, { title: 'New Title' }))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if title is empty', async () => {
      // Create a new mock request for this test
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [{ SurveyId: surveyId }] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.updateSurvey(surveyId, { title: '' }))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if no fields to update', async () => {
      // Create a new mock request for this test
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [{ SurveyId: surveyId }] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.updateSurvey(surveyId, {}))
        .rejects.toThrow(ValidationError);
    });

    it('should validate dates when both are provided', async () => {
      // Create a new mock request for this test
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [{ SurveyId: surveyId }] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      const invalidDates = {
        startDate: '2024-12-31',
        endDate: '2024-01-01'
      };

      await expect(surveyService.updateSurvey(surveyId, invalidDates))
        .rejects.toThrow(ValidationError);
    });

    it('should validate status if provided', async () => {
      // Create a new mock request for this test
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [{ SurveyId: surveyId }] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.updateSurvey(surveyId, { status: 'InvalidStatus' }))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('deleteSurvey', () => {
    const surveyId = '22222222-2222-2222-2222-222222222222';

    it('should delete survey if no responses exist', async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] })
        .mockResolvedValueOnce({ recordset: [{ count: 0 }] })
        .mockResolvedValueOnce({ rowsAffected: [1] });

      const result = await surveyService.deleteSurvey(surveyId);

      expect(result).toBe(true);
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      // Create a new mock request for this test
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.deleteSurvey(surveyId))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if responses exist', async () => {
      // Create a new mock request for this test
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
          .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] })
          .mockResolvedValueOnce({ recordset: [{ count: 5 }] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.deleteSurvey(surveyId))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('getSurveys', () => {
    it('should return all surveys with configurations', async () => {
      const mockSurveys = [
        {
          SurveyId: '11111111-1111-1111-1111-111111111111',
          Title: 'Survey 1',
          Status: 'Active',
          ConfigId: '22222222-2222-2222-2222-222222222222',
          HeroTitle: 'Welcome',
          ShowProgressBar: true
        },
        {
          SurveyId: '33333333-3333-3333-3333-333333333333',
          Title: 'Survey 2',
          Status: 'Draft',
          ConfigId: '44444444-4444-4444-4444-444444444444',
          HeroTitle: 'Hello',
          ShowProgressBar: false
        }
      ];

      mockRequest.query.mockResolvedValueOnce({ recordset: mockSurveys });

      const result = await surveyService.getSurveys();

      expect(result).toHaveLength(2);
      expect(result[0].SurveyId).toBe(mockSurveys[0].SurveyId);
      expect(result[0].configuration).toBeDefined();
      expect(result[0].configuration.HeroTitle).toBe('Welcome');
    });

    it('should filter surveys by status', async () => {
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      await surveyService.getSurveys({ status: 'Active' });

      expect(mockRequest.input).toHaveBeenCalledWith('status', expect.anything(), 'Active');
    });

    it('should filter surveys by assigned admin', async () => {
      const adminId = '11111111-1111-1111-1111-111111111111';
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      await surveyService.getSurveys({ assignedAdminId: adminId });

      expect(mockRequest.input).toHaveBeenCalledWith('assignedAdminId', expect.anything(), adminId);
    });
  });

  describe('getSurveyById', () => {
    const surveyId = '22222222-2222-2222-2222-222222222222';

    it('should return survey with configuration', async () => {
      const mockSurvey = {
        SurveyId: surveyId,
        Title: 'Test Survey',
        Status: 'Active',
        ConfigId: '33333333-3333-3333-3333-333333333333',
        HeroTitle: 'Welcome',
        ShowProgressBar: true,
        MultiPage: false
      };

      // Mock first query for survey data
      mockRequest.query.mockResolvedValueOnce({ recordset: [mockSurvey] });
      // Mock second query for questions
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      const result = await surveyService.getSurveyById(surveyId);

      expect(result.SurveyId).toBe(surveyId);
      expect(result.configuration).toBeDefined();
      expect(result.configuration.HeroTitle).toBe('Welcome');
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      // Create a new mock request for this test
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.getSurveyById(surveyId))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('updateSurveyConfig', () => {
    const surveyId = '22222222-2222-2222-2222-222222222222';

    it('should update survey configuration', async () => {
      const configData = {
        heroTitle: 'Updated Title',
        primaryColor: '#ff0000',
        showProgressBar: false
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] })
        .mockResolvedValueOnce({ recordset: [{ ConfigId: '33333333-3333-3333-3333-333333333333' }] })
        .mockResolvedValueOnce({ recordset: [{ ...configData }] });

      const result = await surveyService.updateSurveyConfig(surveyId, configData);

      expect(mockRequest.input).toHaveBeenCalledWith('heroTitle', expect.anything(), 'Updated Title');
      expect(mockRequest.input).toHaveBeenCalledWith('primaryColor', expect.anything(), '#ff0000');
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      // Create a new mock request for this test
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.updateSurveyConfig(surveyId, { heroTitle: 'Test' }))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError if configuration does not exist', async () => {
      // Create a new mock request for this test
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
          .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] })
          .mockResolvedValueOnce({ recordset: [] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.updateSurveyConfig(surveyId, { heroTitle: 'Test' }))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if no fields to update', async () => {
      // Create a new mock request for this test
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
          .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] })
          .mockResolvedValueOnce({ recordset: [{ ConfigId: '33333333-3333-3333-3333-333333333333' }] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.updateSurveyConfig(surveyId, {}))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('validateDates', () => {
    it('should not throw error for valid dates', () => {
      expect(() => {
        surveyService.validateDates('2024-01-01', '2024-12-31');
      }).not.toThrow();
    });

    it('should throw ValidationError for invalid start date', () => {
      expect(() => {
        surveyService.validateDates('invalid-date', '2024-12-31');
      }).toThrow(ValidationError);
      expect(() => {
        surveyService.validateDates('invalid-date', '2024-12-31');
      }).toThrow('Invalid start date');
    });

    it('should throw ValidationError for invalid end date', () => {
      expect(() => {
        surveyService.validateDates('2024-01-01', 'invalid-date');
      }).toThrow(ValidationError);
      expect(() => {
        surveyService.validateDates('2024-01-01', 'invalid-date');
      }).toThrow('Invalid end date');
    });

    it('should throw ValidationError if end date is before start date', () => {
      expect(() => {
        surveyService.validateDates('2024-12-31', '2024-01-01');
      }).toThrow(ValidationError);
      expect(() => {
        surveyService.validateDates('2024-12-31', '2024-01-01');
      }).toThrow('End date must be after start date');
    });
  });

  describe('validateStatus', () => {
    it('should not throw error for valid statuses', () => {
      expect(() => surveyService.validateStatus('Draft')).not.toThrow();
      expect(() => surveyService.validateStatus('Active')).not.toThrow();
      expect(() => surveyService.validateStatus('Closed')).not.toThrow();
      expect(() => surveyService.validateStatus('Archived')).not.toThrow();
    });

    it('should throw ValidationError for invalid status', () => {
      expect(() => {
        surveyService.validateStatus('InvalidStatus');
      }).toThrow(ValidationError);
      expect(() => {
        surveyService.validateStatus('InvalidStatus');
      }).toThrow('Status must be one of: Draft, Active, Closed, Archived');
    });
  });

  describe('addQuestion', () => {
    const surveyId = '22222222-2222-2222-2222-222222222222';
    const validQuestionData = {
      type: 'Text',
      promptText: 'What is your feedback?',
      subtitle: 'Please be specific',
      imageUrl: 'https://example.com/image.jpg',
      isMandatory: true,
      pageNumber: 1,
      createdBy: '11111111-1111-1111-1111-111111111111'
    };

    it('should add a question with valid data', async () => {
      const mockQuestion = {
        QuestionId: '33333333-3333-3333-3333-333333333333',
        SurveyId: surveyId,
        Type: 'Text',
        PromptText: 'What is your feedback?',
        Subtitle: 'Please be specific',
        ImageUrl: 'https://example.com/image.jpg',
        IsMandatory: true,
        DisplayOrder: 1,
        PageNumber: 1,
        Options: null
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId, Status: 'Draft' }] })
        .mockResolvedValueOnce({ recordset: [{ NextOrder: 1 }] })
        .mockResolvedValueOnce({ recordset: [mockQuestion] });

      const result = await surveyService.addQuestion(surveyId, validQuestionData);

      expect(result.QuestionId).toBe(mockQuestion.QuestionId);
      expect(result.Type).toBe('Text');
      expect(result.PromptText).toBe('What is your feedback?');
    });

    it('should add a question with options', async () => {
      const questionWithOptions = {
        ...validQuestionData,
        type: 'MultipleChoice',
        layoutOrientation: 'vertical',
        options: {
          choices: [
            { text: 'Option 1', imageUrl: 'https://example.com/opt1.jpg' },
            { text: 'Option 2', imageUrl: 'https://example.com/opt2.jpg' }
          ]
        }
      };

      const mockQuestion = {
        QuestionId: '33333333-3333-3333-3333-333333333333',
        SurveyId: surveyId,
        Type: 'MultipleChoice',
        PromptText: 'What is your feedback?',
        LayoutOrientation: 'vertical',
        Options: JSON.stringify(questionWithOptions.options),
        DisplayOrder: 1,
        PageNumber: 1
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId, Status: 'Draft' }] })
        .mockResolvedValueOnce({ recordset: [{ NextOrder: 1 }] })
        .mockResolvedValueOnce({ recordset: [mockQuestion] });

      const result = await surveyService.addQuestion(surveyId, questionWithOptions);

      expect(result.Type).toBe('MultipleChoice');
      expect(result.Options).toEqual(questionWithOptions.options);
      expect(result.LayoutOrientation).toBe('vertical');
    });

    it('should throw ValidationError if type is missing', async () => {
      const invalidData = { ...validQuestionData, type: undefined };

      await expect(surveyService.addQuestion(surveyId, invalidData))
        .rejects.toThrow(ValidationError);
      await expect(surveyService.addQuestion(surveyId, invalidData))
        .rejects.toThrow('Question type is required');
    });

    it('should throw ValidationError if promptText is missing', async () => {
      const invalidData = { ...validQuestionData, promptText: '' };

      await expect(surveyService.addQuestion(surveyId, invalidData))
        .rejects.toThrow(ValidationError);
      await expect(surveyService.addQuestion(surveyId, invalidData))
        .rejects.toThrow('Prompt text is required');
    });

    it('should throw ValidationError if type is invalid', async () => {
      const invalidData = { ...validQuestionData, type: 'InvalidType' };

      await expect(surveyService.addQuestion(surveyId, invalidData))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if layoutOrientation is invalid', async () => {
      const invalidData = { ...validQuestionData, layoutOrientation: 'diagonal' };

      await expect(surveyService.addQuestion(surveyId, invalidData))
        .rejects.toThrow(ValidationError);
      await expect(surveyService.addQuestion(surveyId, invalidData))
        .rejects.toThrow('Layout orientation must be either "vertical" or "horizontal"');
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.addQuestion(surveyId, validQuestionData))
        .rejects.toThrow(NotFoundError);
    });

    it('should auto-assign display order if not provided', async () => {
      const dataWithoutOrder = { ...validQuestionData, displayOrder: undefined };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId, Status: 'Draft' }] })
        .mockResolvedValueOnce({ recordset: [{ NextOrder: 5 }] })
        .mockResolvedValueOnce({ recordset: [{ QuestionId: '33333333-3333-3333-3333-333333333333', DisplayOrder: 5 }] });

      await surveyService.addQuestion(surveyId, dataWithoutOrder);

      expect(mockRequest.input).toHaveBeenCalledWith('displayOrder', expect.anything(), 5);
    });
  });

  describe('updateQuestion', () => {
    const questionId = '33333333-3333-3333-3333-333333333333';
    const surveyId = '22222222-2222-2222-2222-222222222222';

    it('should update question with valid data', async () => {
      const updateData = {
        promptText: 'Updated question text',
        subtitle: 'Updated subtitle',
        isMandatory: false,
        updatedBy: '11111111-1111-1111-1111-111111111111'
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ QuestionId: questionId, SurveyId: surveyId }] })
        .mockResolvedValueOnce({ recordset: [{ count: 0 }] })
        .mockResolvedValueOnce({ recordset: [{ QuestionId: questionId, ...updateData, Options: null }] });

      const result = await surveyService.updateQuestion(questionId, updateData);

      expect(result.QuestionId).toBe(questionId);
    });

    it('should throw NotFoundError if question does not exist', async () => {
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.updateQuestion(questionId, { promptText: 'Test' }))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if survey has responses', async () => {
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
          .mockResolvedValueOnce({ recordset: [{ QuestionId: questionId, SurveyId: surveyId }] })
          .mockResolvedValueOnce({ recordset: [{ count: 5 }] })
      };
      mockPool.request = jest.fn()
        .mockReturnValueOnce(testRequest)
        .mockReturnValueOnce(testRequest);

      await expect(surveyService.updateQuestion(questionId, { promptText: 'Test' }))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if promptText is empty', async () => {
      const testRequest1 = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValueOnce({ recordset: [{ QuestionId: questionId, SurveyId: surveyId }] })
      };
      const testRequest2 = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValueOnce({ recordset: [{ count: 0 }] })
      };
      const testRequest3 = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
      };
      mockPool.request = jest.fn()
        .mockReturnValueOnce(testRequest1)
        .mockReturnValueOnce(testRequest2)
        .mockReturnValueOnce(testRequest3);

      await expect(surveyService.updateQuestion(questionId, { promptText: '' }))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if no fields to update', async () => {
      const testRequest1 = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValueOnce({ recordset: [{ QuestionId: questionId, SurveyId: surveyId }] })
      };
      const testRequest2 = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValueOnce({ recordset: [{ count: 0 }] })
      };
      const testRequest3 = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
      };
      mockPool.request = jest.fn()
        .mockReturnValueOnce(testRequest1)
        .mockReturnValueOnce(testRequest2)
        .mockReturnValueOnce(testRequest3);

      await expect(surveyService.updateQuestion(questionId, {}))
        .rejects.toThrow(ValidationError);
    });

    it('should update question options', async () => {
      const updateData = {
        options: {
          choices: [
            { text: 'New Option 1', imageUrl: 'https://example.com/new1.jpg' },
            { text: 'New Option 2', imageUrl: 'https://example.com/new2.jpg' }
          ]
        },
        updatedBy: '11111111-1111-1111-1111-111111111111'
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ QuestionId: questionId, SurveyId: surveyId }] })
        .mockResolvedValueOnce({ recordset: [{ count: 0 }] })
        .mockResolvedValueOnce({ recordset: [{ QuestionId: questionId, Options: JSON.stringify(updateData.options) }] });

      const result = await surveyService.updateQuestion(questionId, updateData);

      expect(result.Options).toEqual(updateData.options);
    });
  });

  describe('deleteQuestion', () => {
    const questionId = '33333333-3333-3333-3333-333333333333';
    const surveyId = '22222222-2222-2222-2222-222222222222';

    it('should delete question if survey has no responses', async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ QuestionId: questionId, SurveyId: surveyId }] })
        .mockResolvedValueOnce({ recordset: [{ count: 0 }] })
        .mockResolvedValueOnce({ rowsAffected: [1] });

      const result = await surveyService.deleteQuestion(questionId);

      expect(result).toBe(true);
    });

    it('should throw NotFoundError if question does not exist', async () => {
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      await expect(surveyService.deleteQuestion(questionId))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if survey has responses', async () => {
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
          .mockResolvedValueOnce({ recordset: [{ QuestionId: questionId, SurveyId: surveyId }] })
          .mockResolvedValueOnce({ recordset: [{ count: 5 }] })
      };
      mockPool.request = jest.fn()
        .mockReturnValueOnce(testRequest)
        .mockReturnValueOnce(testRequest);

      await expect(surveyService.deleteQuestion(questionId))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('reorderQuestions', () => {
    const surveyId = '22222222-2222-2222-2222-222222222222';

    it('should reorder questions successfully', async () => {
      const questionOrders = [
        { questionId: '11111111-1111-1111-1111-111111111111', displayOrder: 1 },
        { questionId: '22222222-2222-2222-2222-222222222222', displayOrder: 2 },
        { questionId: '33333333-3333-3333-3333-333333333333', displayOrder: 3 }
      ];

      const mockQuestions = [
        { QuestionId: '11111111-1111-1111-1111-111111111111', DisplayOrder: 1, Options: null },
        { QuestionId: '22222222-2222-2222-2222-222222222222', DisplayOrder: 2, Options: null },
        { QuestionId: '33333333-3333-3333-3333-333333333333', DisplayOrder: 3, Options: null }
      ];

      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
          .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] })
          .mockResolvedValueOnce({ recordset: mockQuestions })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      const result = await surveyService.reorderQuestions(surveyId, questionOrders);

      expect(result).toHaveLength(3);
      expect(mockTransaction.begin).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('should throw ValidationError if questionOrders is empty', async () => {
      await expect(surveyService.reorderQuestions(surveyId, []))
        .rejects.toThrow(ValidationError);
      await expect(surveyService.reorderQuestions(surveyId, []))
        .rejects.toThrow('Question orders array is required');
    });

    it('should throw ValidationError if questionOrders is not an array', async () => {
      await expect(surveyService.reorderQuestions(surveyId, null))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if item missing questionId or displayOrder', async () => {
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
          .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      const invalidOrders = [
        { questionId: '11111111-1111-1111-1111-111111111111' } // missing displayOrder
      ];

      await expect(surveyService.reorderQuestions(surveyId, invalidOrders))
        .rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      const testRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [] })
      };
      mockPool.request = jest.fn().mockReturnValue(testRequest);

      const questionOrders = [
        { questionId: '11111111-1111-1111-1111-111111111111', displayOrder: 1 }
      ];

      await expect(surveyService.reorderQuestions(surveyId, questionOrders))
        .rejects.toThrow(NotFoundError);
    });

    it('should rollback transaction on error', async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] });

      sql.Request = jest.fn().mockReturnValue({
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      const questionOrders = [
        { questionId: '11111111-1111-1111-1111-111111111111', displayOrder: 1 }
      ];

      await expect(surveyService.reorderQuestions(surveyId, questionOrders))
        .rejects.toThrow('Database error');

      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  describe('getQuestionsBySurvey', () => {
    const surveyId = '22222222-2222-2222-2222-222222222222';

    it('should return questions ordered by page and display order', async () => {
      const mockQuestions = [
        {
          QuestionId: '11111111-1111-1111-1111-111111111111',
          Type: 'Text',
          PromptText: 'Question 1',
          PageNumber: 1,
          DisplayOrder: 1,
          Options: null
        },
        {
          QuestionId: '22222222-2222-2222-2222-222222222222',
          Type: 'MultipleChoice',
          PromptText: 'Question 2',
          PageNumber: 1,
          DisplayOrder: 2,
          Options: JSON.stringify({ choices: ['A', 'B', 'C'] })
        },
        {
          QuestionId: '33333333-3333-3333-3333-333333333333',
          Type: 'Rating',
          PromptText: 'Question 3',
          PageNumber: 2,
          DisplayOrder: 1,
          Options: null
        }
      ];

      mockRequest.query.mockResolvedValueOnce({ recordset: mockQuestions });

      const result = await surveyService.getQuestionsBySurvey(surveyId);

      expect(result).toHaveLength(3);
      expect(result[0].QuestionId).toBe('11111111-1111-1111-1111-111111111111');
      expect(result[1].Options).toEqual({ choices: ['A', 'B', 'C'] });
    });

    it('should return empty array if no questions exist', async () => {
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      const result = await surveyService.getQuestionsBySurvey(surveyId);

      expect(result).toHaveLength(0);
    });
  });

  describe('validateQuestionType', () => {
    it('should not throw error for valid question types', () => {
      expect(() => surveyService.validateQuestionType('HeroCover')).not.toThrow();
      expect(() => surveyService.validateQuestionType('Text')).not.toThrow();
      expect(() => surveyService.validateQuestionType('MultipleChoice')).not.toThrow();
      expect(() => surveyService.validateQuestionType('Checkbox')).not.toThrow();
      expect(() => surveyService.validateQuestionType('Dropdown')).not.toThrow();
      expect(() => surveyService.validateQuestionType('MatrixLikert')).not.toThrow();
      expect(() => surveyService.validateQuestionType('Rating')).not.toThrow();
      expect(() => surveyService.validateQuestionType('Date')).not.toThrow();
    });

    it('should throw ValidationError for invalid question type', () => {
      expect(() => {
        surveyService.validateQuestionType('InvalidType');
      }).toThrow(ValidationError);
    });
  });

  describe('validateLayoutOrientation', () => {
    it('should not throw error for valid orientations', () => {
      expect(() => surveyService.validateLayoutOrientation('vertical')).not.toThrow();
      expect(() => surveyService.validateLayoutOrientation('horizontal')).not.toThrow();
      expect(() => surveyService.validateLayoutOrientation(null)).not.toThrow();
      expect(() => surveyService.validateLayoutOrientation(undefined)).not.toThrow();
    });

    it('should throw ValidationError for invalid orientation', () => {
      expect(() => {
        surveyService.validateLayoutOrientation('diagonal');
      }).toThrow(ValidationError);
      expect(() => {
        surveyService.validateLayoutOrientation('diagonal');
      }).toThrow('Layout orientation must be either "vertical" or "horizontal"');
    });
  });
});
