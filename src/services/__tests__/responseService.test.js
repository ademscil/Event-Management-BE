const responseService = require('../responseService');
const pool = require('../../database/connection');

// Mock the database connection
jest.mock('../../database/connection', () => ({
  request: jest.fn()
}));

describe('ResponseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    responseService.questionResponsesHasApplicationId = null;
    responseService.questionResponsesHasTakeoutStatus = null;
  });

  describe('getSurveyForm', () => {
    it('should return survey form with questions', async () => {
      const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';
      const mockSurvey = {
        SurveyId: mockSurveyId,
        Title: 'Test Survey',
        Description: 'Test Description',
        StartDate: new Date('2025-01-01'),
        EndDate: new Date('2027-12-31'),
        Status: 'Active',
        TargetRespondents: 100,
        TargetScore: 8,
        DuplicatePreventionEnabled: true,
        HeroTitle: 'Welcome to CSI Survey',
        HeroSubtitle: 'Please share your feedback',
        HeroImageUrl: null,
        LogoUrl: null,
        BackgroundImageUrl: null,
        BackgroundColor: '#ffffff',
        PrimaryColor: '#125ba1',
        SecondaryColor: '#2c8dd8',
        FontFamily: 'Arial',
        ButtonStyle: 'pill',
        ShowProgressBar: true,
        ShowPageNumbers: true,
        MultiPage: false,
        Styles: null
      };

      const mockQuestions = [
        {
          QuestionId: '223e4567-e89b-12d3-a456-426614174000',
          SurveyId: mockSurveyId,
          Type: 'Text',
          PromptText: 'What is your name?',
          Subtitle: null,
          IsMandatory: true,
          DisplayOrder: 1,
          PageNumber: 1,
          Options: null,
          ImageUrl: null,
          LayoutOrientation: null
        }
      ];

      const mockRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
          .mockResolvedValueOnce({ recordset: [mockSurvey] })
          .mockResolvedValueOnce({ recordset: mockQuestions })
      };

      pool.request.mockReturnValue(mockRequest);

      const result = await responseService.getSurveyForm(mockSurveyId);

      expect(result).toBeDefined();
      expect(result.surveyId).toBe(mockSurveyId);
      expect(result.title).toBe('Test Survey');
      expect(result.configuration.heroTitle).toBe('Welcome to CSI Survey');
      expect(result.configuration.heroSubtitle).toBe('Please share your feedback');
      expect(result.configuration.primaryColor).toBe('#125ba1');
      expect(result.configuration.secondaryColor).toBe('#2c8dd8');
      expect(result.configuration.buttonStyle).toBe('pill');
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].type).toBe('Text');
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';

      const mockRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [] })
      };

      pool.request.mockReturnValue(mockRequest);

      await expect(responseService.getSurveyForm(mockSurveyId))
        .rejects.toThrow('Survey with ID');
    });

    it('should throw ValidationError if survey is not active', async () => {
      const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';
      const mockSurvey = {
        SurveyId: mockSurveyId,
        Title: 'Test Survey',
        Status: 'Draft',
        StartDate: new Date('2025-01-01'),
        EndDate: new Date('2027-12-31')
      };

      const mockRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [mockSurvey] })
      };

      pool.request.mockReturnValue(mockRequest);

      await expect(responseService.getSurveyForm(mockSurveyId))
        .rejects.toThrow('Survey is not currently active');
    });
  });

  describe('getAvailableApplications', () => {
    it('should return applications for a department', async () => {
      const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';
      const mockDepartmentId = '223e4567-e89b-12d3-a456-426614174000';
      const mockApplications = [
        {
          ApplicationId: '323e4567-e89b-12d3-a456-426614174000',
          Code: 'APP001',
          Name: 'Test Application',
          Description: 'Test Description'
        }
      ];

      const mockRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: mockApplications })
      };

      pool.request.mockReturnValue(mockRequest);

      const result = await responseService.getAvailableApplications(mockSurveyId, mockDepartmentId);

      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('APP001');
      expect(result[0].name).toBe('Test Application');
    });

    it('should throw ValidationError if surveyId is missing', async () => {
      await expect(responseService.getAvailableApplications(null, 'dept-id'))
        .rejects.toThrow('Survey ID is required');
    });

    it('should return mapped applications when departmentId is missing', async () => {
      const mockRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [] })
      };

      pool.request.mockReturnValue(mockRequest);

      await expect(responseService.getAvailableApplications('survey-id', null))
        .resolves.toEqual([]);
    });
  });

  describe('checkDuplicateResponse', () => {
    it('should return true if duplicate exists', async () => {
      const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';
      const mockEmail = 'test@example.com';
      const mockApplicationId = '223e4567-e89b-12d3-a456-426614174000';

      const mockRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [{ Count: 1 }] })
      };

      pool.request.mockReturnValue(mockRequest);

      const result = await responseService.checkDuplicateResponse(mockSurveyId, mockEmail, mockApplicationId);

      expect(result).toBe(true);
    });

    it('should return false if no duplicate exists', async () => {
      const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';
      const mockEmail = 'test@example.com';
      const mockApplicationId = '223e4567-e89b-12d3-a456-426614174000';

      const mockRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: [{ Count: 0 }] })
      };

      pool.request.mockReturnValue(mockRequest);

      const result = await responseService.checkDuplicateResponse(mockSurveyId, mockEmail, mockApplicationId);

      expect(result).toBe(false);
    });

    it('should throw ValidationError if required parameters are missing', async () => {
      await expect(responseService.checkDuplicateResponse(null, 'email', 'app-id'))
        .rejects.toThrow('Survey ID is required');

      await expect(responseService.checkDuplicateResponse('survey-id', null, 'app-id'))
        .rejects.toThrow('Email is required');

      await expect(responseService.checkDuplicateResponse('survey-id', 'email', null))
        .rejects.toThrow('Application ID is required');
    });
  });

  describe('validateOrganizationalSelections', () => {
    it('should not throw when org fields are missing', () => {
      const respondent = {
        name: 'Test User',
        email: 'test@example.com'
      };

      expect(() => responseService.validateOrganizationalSelections(respondent))
        .not.toThrow();
    });

    it('should not throw if all selections are present', () => {
      const respondent = {
        businessUnitId: 'bu-id',
        divisionId: 'div-id',
        departmentId: 'dept-id'
      };

      expect(() => responseService.validateOrganizationalSelections(respondent))
        .not.toThrow();
    });

    it('should throw ValidationError if respondent is missing', () => {
      expect(() => responseService.validateOrganizationalSelections(null))
        .toThrow('Respondent information is required');
    });
  });

  describe('normalizeRespondent', () => {
    it('should default missing name and email to safe values', () => {
      const result = responseService.normalizeRespondent({});

      expect(result.name).toBe('Respondent');
      expect(result.email).toBeNull();
    });

    it('should normalize provided email to lowercase', () => {
      const result = responseService.normalizeRespondent({
        name: 'John Doe',
        email: 'John.Doe@Example.COM '
      });

      expect(result.name).toBe('John Doe');
      expect(result.email).toBe('john.doe@example.com');
    });
  });

  describe('validateApplicationSelections', () => {
    it('should throw ValidationError if no applications selected', () => {
      expect(() => responseService.validateApplicationSelections([]))
        .toThrow('At least one application must be selected');

      expect(() => responseService.validateApplicationSelections(null))
        .toThrow('At least one application must be selected');
    });

    it('should not throw if applications are selected', () => {
      expect(() => responseService.validateApplicationSelections(['app-id-1']))
        .not.toThrow();
    });
  });

  describe('checkResponseHasValue', () => {
    it('should validate Text question responses', () => {
      expect(responseService.checkResponseHasValue('Text', { textValue: 'answer' })).toBeTruthy();
      expect(responseService.checkResponseHasValue('Text', { textValue: '' })).toBeFalsy();
      expect(responseService.checkResponseHasValue('Text', { textValue: '   ' })).toBeFalsy();
      expect(responseService.checkResponseHasValue('Text', null)).toBeFalsy();
    });

    it('should validate Rating question responses', () => {
      expect(responseService.checkResponseHasValue('Rating', { numericValue: 5 })).toBeTruthy();
      expect(responseService.checkResponseHasValue('Rating', { numericValue: 0 })).toBeTruthy();
      expect(responseService.checkResponseHasValue('Rating', { numericValue: null })).toBeFalsy();
      expect(responseService.checkResponseHasValue('Rating', null)).toBeFalsy();
    });

    it('should validate MatrixLikert question responses', () => {
      expect(responseService.checkResponseHasValue('MatrixLikert', { matrixValues: { row1: 5 } })).toBeTruthy();
      expect(responseService.checkResponseHasValue('MatrixLikert', { matrixValues: {} })).toBeFalsy();
      expect(responseService.checkResponseHasValue('MatrixLikert', null)).toBeFalsy();
    });

    it('should validate Date question responses', () => {
      expect(responseService.checkResponseHasValue('Date', { dateValue: new Date() })).toBeTruthy();
      expect(responseService.checkResponseHasValue('Date', { dateValue: null })).toBeFalsy();
      expect(responseService.checkResponseHasValue('Date', null)).toBeFalsy();
    });

    it('should validate Signature question responses', () => {
      expect(responseService.checkResponseHasValue('Signature', { textValue: 'data:image/png;base64,...' })).toBeTruthy();
      expect(responseService.checkResponseHasValue('Signature', { textValue: '' })).toBeFalsy();
      expect(responseService.checkResponseHasValue('Signature', null)).toBeFalsy();
    });
  });

  describe('validateMandatoryQuestions', () => {
    it('should skip mandatory validation for after_mapped_selection questions when mapped app is not selected', () => {
      const questions = [
        {
          questionId: 'mapped-q',
          type: 'MultipleChoice',
          promptText: 'Aplikasi',
          isMandatory: true,
          options: { dataSource: 'app_department' }
        },
        {
          questionId: 'dependent-q',
          type: 'Rating',
          promptText: 'Rating',
          isMandatory: true,
          options: { displayCondition: 'after_mapped_selection' }
        }
      ];

      expect(() => responseService.validateMandatoryQuestions(questions, []))
        .toThrow('Aplikasi');
    });

    it('should enforce comment rule when rating below threshold', () => {
      const questions = [
        {
          questionId: 'rating-q',
          type: 'Rating',
          promptText: 'Rating layanan',
          isMandatory: true,
          options: { commentRequiredBelowRating: 7 }
        }
      ];

      const responses = [
        {
          questionId: 'rating-q',
          value: { numericValue: 6, commentValue: '' }
        }
      ];

      expect(() => responseService.validateMandatoryQuestions(questions, responses))
        .toThrow('comment is required');
    });

    it('should accept normalized question ids with q- prefix in conditional source', () => {
      const questions = [
        {
          questionId: 'rating-q',
          type: 'Rating',
          promptText: 'Rating',
          isMandatory: true,
          options: {}
        },
        {
          questionId: 'text-q',
          type: 'Text',
          promptText: 'Alasan',
          isMandatory: false,
          options: {
            conditionalRequired: {
              sourceElementId: 'q-rating-q',
              threshold: 7
            }
          }
        }
      ];

      const responses = [
        { questionId: 'rating-q', value: { numericValue: 6 } },
        { questionId: 'text-q', value: { textValue: 'Perlu perbaikan' } }
      ];

      expect(() => responseService.validateMandatoryQuestions(questions, responses))
        .not.toThrow();
    });
  });

  describe('getResponses', () => {
    it('should return filtered responses', async () => {
      const mockResponses = [
        {
          ResponseId: '123e4567-e89b-12d3-a456-426614174000',
          SurveyId: '223e4567-e89b-12d3-a456-426614174000',
          SurveyTitle: 'Test Survey',
          RespondentName: 'John Doe',
          RespondentEmail: 'john@example.com',
          BusinessUnitId: '323e4567-e89b-12d3-a456-426614174000',
          BusinessUnitName: 'IT',
          DivisionId: '423e4567-e89b-12d3-a456-426614174000',
          DivisionName: 'Software',
          DepartmentId: '523e4567-e89b-12d3-a456-426614174000',
          DepartmentName: 'Development',
          ApplicationId: '623e4567-e89b-12d3-a456-426614174000',
          ApplicationName: 'Test App',
          ApplicationCode: 'APP001',
          SubmittedAt: new Date(),
          IpAddress: '192.168.1.1'
        }
      ];

      const mockRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({ recordset: mockResponses })
      };

      pool.request.mockReturnValue(mockRequest);

      const result = await responseService.getResponses({ surveyId: '223e4567-e89b-12d3-a456-426614174000' });

      expect(result).toHaveLength(1);
      expect(result[0].respondentName).toBe('John Doe');
    });
  });

  describe('getResponseStatistics', () => {
    it('should return statistics for a survey', async () => {
      const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';

      const mockRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
          .mockResolvedValueOnce({ recordset: [{ TotalResponses: 10 }] })
          .mockResolvedValueOnce({ recordset: [] })
          .mockResolvedValueOnce({ recordset: [] })
          .mockResolvedValueOnce({ recordset: [{ Cnt: 1 }] })
          .mockResolvedValueOnce({ recordset: [] })
          .mockResolvedValueOnce({ recordset: [{ ActiveCount: 8, ProposedCount: 1, TakenOutCount: 1 }] })
      };

      pool.request.mockReturnValue(mockRequest);

      const result = await responseService.getResponseStatistics(mockSurveyId);

      expect(result.totalResponses).toBe(10);
      expect(result.takeoutStatistics.active).toBe(8);
      expect(result.takeoutStatistics.proposed).toBe(1);
      expect(result.takeoutStatistics.takenOut).toBe(1);
    });

    it('should fallback takeout stats when TakeoutStatus column is unavailable', async () => {
      responseService.questionResponsesHasTakeoutStatus = null;
      const mockSurveyId = '123e4567-e89b-12d3-a456-426614174000';

      const mockRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn()
          .mockResolvedValueOnce({ recordset: [{ TotalResponses: 3 }] })
          .mockResolvedValueOnce({ recordset: [] })
          .mockResolvedValueOnce({ recordset: [] })
          .mockResolvedValueOnce({ recordset: [{ Cnt: 0 }] })
          .mockResolvedValueOnce({ recordset: [] })
      };

      pool.request.mockReturnValue(mockRequest);

      const result = await responseService.getResponseStatistics(mockSurveyId);

      expect(result.totalResponses).toBe(3);
      expect(result.takeoutStatistics.active).toBe(0);
      expect(result.takeoutStatistics.proposed).toBe(0);
      expect(result.takeoutStatistics.takenOut).toBe(0);
    });

    it('should throw ValidationError if surveyId is missing', async () => {
      await expect(responseService.getResponseStatistics(null))
        .rejects.toThrow('Survey ID is required');
    });
  });
});
