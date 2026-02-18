const { SurveyService } = require('../surveyService');
const db = require('../../database/connection');

// Mock the database connection
jest.mock('../../database/connection');
jest.mock('../../config/logger');

describe('SurveyService - Preview and Configuration', () => {
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

    db.getPool = jest.fn().mockResolvedValue(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateSurveyConfig', () => {
    const surveyId = 'survey-123';
    const mockConfig = {
      heroTitle: 'Welcome to Survey',
      heroSubtitle: 'Please share your feedback',
      backgroundColor: '#f0f0f0',
      primaryColor: '#007bff',
      fontFamily: 'Arial, sans-serif',
      showProgressBar: true,
      showPageNumbers: true,
      multiPage: false
    };

    it('should update survey configuration successfully', async () => {
      // Mock survey exists check
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] }) // Survey exists
        .mockResolvedValueOnce({ recordset: [{ ConfigId: 'config-123' }] }) // Config exists
        .mockResolvedValueOnce({ recordset: [{ ...mockConfig, ConfigId: 'config-123' }] }); // Update result

      const result = await surveyService.updateSurveyConfig(surveyId, mockConfig);

      expect(result).toBeDefined();
      expect(mockRequest.input).toHaveBeenCalledWith('surveyId', expect.anything(), surveyId);
      expect(mockRequest.input).toHaveBeenCalledWith('heroTitle', expect.anything(), mockConfig.heroTitle);
      expect(mockRequest.input).toHaveBeenCalledWith('backgroundColor', expect.anything(), mockConfig.backgroundColor);
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      mockRequest.query.mockResolvedValueOnce({ recordset: [] }); // Survey not found

      await expect(surveyService.updateSurveyConfig(surveyId, mockConfig))
        .rejects.toThrow('Survey not found');
    });

    it('should throw NotFoundError if configuration does not exist', async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] }) // Survey exists
        .mockResolvedValueOnce({ recordset: [] }); // Config not found

      await expect(surveyService.updateSurveyConfig(surveyId, mockConfig))
        .rejects.toThrow('Survey configuration not found');
    });

    it('should throw ValidationError if no fields to update', async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] }) // Survey exists
        .mockResolvedValueOnce({ recordset: [{ ConfigId: 'config-123' }] }); // Config exists

      await expect(surveyService.updateSurveyConfig(surveyId, {}))
        .rejects.toThrow('No fields to update');
    });

    it('should update only provided fields', async () => {
      const partialConfig = {
        heroTitle: 'New Title',
        primaryColor: '#ff0000'
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [{ SurveyId: surveyId }] })
        .mockResolvedValueOnce({ recordset: [{ ConfigId: 'config-123' }] })
        .mockResolvedValueOnce({ recordset: [{ ...partialConfig, ConfigId: 'config-123' }] });

      await surveyService.updateSurveyConfig(surveyId, partialConfig);

      expect(mockRequest.input).toHaveBeenCalledWith('heroTitle', expect.anything(), 'New Title');
      expect(mockRequest.input).toHaveBeenCalledWith('primaryColor', expect.anything(), '#ff0000');
      expect(mockRequest.input).not.toHaveBeenCalledWith('backgroundColor', expect.anything(), expect.anything());
    });
  });

  describe('generatePreview', () => {
    const surveyId = 'survey-123';
    const mockSurveyData = {
      SurveyId: surveyId,
      Title: 'Test Survey',
      Description: 'Test Description',
      StartDate: new Date('2024-01-01'),
      EndDate: new Date('2024-12-31'),
      Status: 'Active',
      TargetRespondents: 100,
      TargetScore: 8.5,
      HeroTitle: 'Welcome',
      HeroSubtitle: 'Share your feedback',
      HeroImageUrl: '/images/hero.jpg',
      LogoUrl: '/images/logo.png',
      BackgroundColor: '#f0f0f0',
      BackgroundImageUrl: '/images/bg.jpg',
      PrimaryColor: '#007bff',
      SecondaryColor: '#6c757d',
      FontFamily: 'Arial, sans-serif',
      ButtonStyle: 'rounded',
      ShowProgressBar: true,
      ShowPageNumbers: true,
      MultiPage: false
    };

    const mockQuestions = [
      {
        QuestionId: 'q1',
        Type: 'Text',
        PromptText: 'What is your name?',
        Subtitle: 'Please enter your full name',
        ImageUrl: null,
        IsMandatory: true,
        DisplayOrder: 1,
        PageNumber: 1,
        LayoutOrientation: null,
        CommentRequiredBelowRating: null,
        Options: null
      },
      {
        QuestionId: 'q2',
        Type: 'Rating',
        PromptText: 'How satisfied are you?',
        Subtitle: null,
        ImageUrl: null,
        IsMandatory: true,
        DisplayOrder: 2,
        PageNumber: 1,
        LayoutOrientation: null,
        CommentRequiredBelowRating: 5,
        Options: JSON.stringify({ ratingScale: 10, ratingLowLabel: 'Poor', ratingHighLabel: 'Excellent' })
      }
    ];

    it('should generate preview with configuration and questions', async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [mockSurveyData] }) // Survey with config
        .mockResolvedValueOnce({ recordset: mockQuestions }); // Questions

      const preview = await surveyService.generatePreview(surveyId);

      expect(preview).toBeDefined();
      expect(preview.surveyId).toBe(surveyId);
      expect(preview.title).toBe('Test Survey');
      expect(preview.readOnly).toBe(true);
      expect(preview.configuration).toBeDefined();
      expect(preview.configuration.heroTitle).toBe('Welcome');
      expect(preview.configuration.backgroundColor).toBe('#f0f0f0');
      expect(preview.questions).toHaveLength(2);
      expect(preview.styles).toBeDefined();
      expect(preview.styles.cssText).toContain('background-color: #f0f0f0');
    });

    it('should organize questions by pages for multi-page surveys', async () => {
      const multiPageSurvey = { ...mockSurveyData, MultiPage: true };
      const multiPageQuestions = [
        { ...mockQuestions[0], PageNumber: 1 },
        { ...mockQuestions[1], PageNumber: 2 }
      ];

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [multiPageSurvey] })
        .mockResolvedValueOnce({ recordset: multiPageQuestions });

      const preview = await surveyService.generatePreview(surveyId);

      expect(preview.pages).toBeDefined();
      expect(preview.pages[1]).toHaveLength(1);
      expect(preview.pages[2]).toHaveLength(1);
      expect(preview.totalPages).toBe(2);
      expect(preview.questions).toBeUndefined();
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      await expect(surveyService.generatePreview(surveyId))
        .rejects.toThrow('Survey not found');
    });

    it('should parse question options correctly', async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [mockSurveyData] })
        .mockResolvedValueOnce({ recordset: mockQuestions });

      const preview = await surveyService.generatePreview(surveyId);

      expect(preview.questions[1].options).toBeDefined();
      expect(preview.questions[1].options.ratingScale).toBe(10);
      expect(preview.questions[1].options.ratingLowLabel).toBe('Poor');
    });

    it('should handle questions without options', async () => {
      mockRequest.query
        .mockResolvedValueOnce({ recordset: [mockSurveyData] })
        .mockResolvedValueOnce({ recordset: [mockQuestions[0]] });

      const preview = await surveyService.generatePreview(surveyId);

      expect(preview.questions[0].options).toBeUndefined();
    });
  });

  describe('generatePreviewStyles', () => {
    it('should generate default styles when no configuration provided', () => {
      const config = {};
      const styles = surveyService.generatePreviewStyles(config);

      expect(styles.backgroundColor).toBe('#ffffff');
      expect(styles.primaryColor).toBe('#007bff');
      expect(styles.fontFamily).toBe('Arial, sans-serif');
      expect(styles.buttonStyle).toBe('rounded');
      expect(styles.cssText).toContain('background-color: #ffffff');
    });

    it('should apply custom colors and fonts', () => {
      const config = {
        backgroundColor: '#f5f5f5',
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00',
        fontFamily: 'Helvetica, sans-serif'
      };

      const styles = surveyService.generatePreviewStyles(config);

      expect(styles.backgroundColor).toBe('#f5f5f5');
      expect(styles.primaryColor).toBe('#ff0000');
      expect(styles.secondaryColor).toBe('#00ff00');
      expect(styles.fontFamily).toBe('Helvetica, sans-serif');
      expect(styles.cssText).toContain('background-color: #f5f5f5');
      expect(styles.cssText).toContain('font-family: Helvetica, sans-serif');
    });

    it('should include background image when provided', () => {
      const config = {
        backgroundImageUrl: '/images/background.jpg'
      };

      const styles = surveyService.generatePreviewStyles(config);

      expect(styles.backgroundImage).toBe('url(/images/background.jpg)');
      expect(styles.cssText).toContain('background-image: url(/images/background.jpg)');
    });

    it('should apply button style variations', () => {
      const roundedConfig = { buttonStyle: 'rounded' };
      const pillConfig = { buttonStyle: 'pill' };
      const squareConfig = { buttonStyle: 'square' };

      const roundedStyles = surveyService.generatePreviewStyles(roundedConfig);
      const pillStyles = surveyService.generatePreviewStyles(pillConfig);
      const squareStyles = surveyService.generatePreviewStyles(squareConfig);

      expect(roundedStyles.cssText).toContain('border-radius: 0.25rem');
      expect(pillStyles.cssText).toContain('border-radius: 50rem');
      expect(squareStyles.cssText).toContain('border-radius: 0');
    });
  });
});
