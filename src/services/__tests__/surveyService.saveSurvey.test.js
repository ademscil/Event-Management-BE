const { SurveyService, ValidationError, NotFoundError } = require('../surveyService');
const db = require('../../database/connection');
const sql = require('mssql');

describe('SurveyService - saveSurvey and getSurveyById', () => {
  let surveyService;
  let testUserId;
  let createdSurveyIds = [];

  beforeAll(async () => {
    surveyService = new SurveyService();
    
    // Create or get test user
    const pool = await db.getPool();
    
    // Check if user exists
    const existingUser = await pool.request()
      .input('username', sql.NVarChar(100), 'testuser_survey_save')
      .query('SELECT UserId FROM Users WHERE Username = @username');
    
    if (existingUser.recordset.length > 0) {
      testUserId = existingUser.recordset[0].UserId;
    } else {
      const userResult = await pool.request()
        .input('username', sql.NVarChar(100), 'testuser_survey_save')
        .input('email', sql.NVarChar(255), 'testuser_survey_save@test.com')
        .input('displayName', sql.NVarChar(200), 'Test User Survey Save')
        .input('role', sql.NVarChar(50), 'AdminEvent')
        .input('useLDAP', sql.Bit, false)
        .input('passwordHash', sql.NVarChar(255), 'hash123')
        .query(`
          INSERT INTO Users (Username, Email, DisplayName, Role, UseLDAP, PasswordHash, IsActive, CreatedAt)
          OUTPUT INSERTED.UserId
          VALUES (@username, @email, @displayName, @role, @useLDAP, @passwordHash, 1, GETDATE())
        `);
      
      testUserId = userResult.recordset[0].UserId;
    }
  });

  afterAll(async () => {
    const pool = await db.getPool();
    
    // Clean up created surveys first (before deleting users due to FK constraint)
    for (const surveyId of createdSurveyIds) {
      try {
        // Delete questions first (FK constraint from Questions to Surveys)
        await pool.request()
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .query('DELETE FROM Questions WHERE SurveyId = @surveyId');
        
        // Delete survey configuration (FK constraint from SurveyConfiguration to Surveys)
        await pool.request()
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .query('DELETE FROM SurveyConfiguration WHERE SurveyId = @surveyId');
        
        // Now delete the survey
        await pool.request()
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .query('DELETE FROM Surveys WHERE SurveyId = @surveyId');
      } catch (error) {
        // Ignore errors during cleanup
        console.log('Cleanup error for survey:', surveyId, error.message);
      }
    }
    
    // Clean up test user (after surveys are deleted)
    if (testUserId) {
      try {
        await pool.request()
          .input('userId', sql.UniqueIdentifier, testUserId)
          .query('DELETE FROM Users WHERE UserId = @userId');
      } catch (error) {
        // Ignore errors during cleanup
        console.log('Cleanup error for user:', testUserId, error.message);
      }
    }
  });

  describe('saveSurvey - Create', () => {
    test('should create a new survey with basic data', async () => {
      const surveyData = {
        title: 'Test Survey - Save Function',
        description: 'Testing saveSurvey function',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        userId: testUserId
      };

      const result = await surveyService.saveSurvey(surveyData);

      expect(result).toBeDefined();
      expect(result.SurveyId).toBeDefined();
      expect(result.Title).toBe(surveyData.title);
      expect(result.Description).toBe(surveyData.description);
      expect(result.Status).toBe('Draft');
      expect(result.configuration).toBeDefined();

      createdSurveyIds.push(result.SurveyId);
    });

    test('should create a survey with configuration', async () => {
      const surveyData = {
        title: 'Test Survey with Config',
        description: 'Testing with configuration',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        userId: testUserId,
        configuration: {
          heroTitle: 'Welcome to Survey',
          heroSubtitle: 'Please provide your feedback',
          backgroundColor: '#ffffff',
          primaryColor: '#007bff',
          fontFamily: 'Arial',
          showProgressBar: true,
          showPageNumbers: true,
          multiPage: false
        }
      };

      const result = await surveyService.saveSurvey(surveyData);

      expect(result).toBeDefined();
      expect(result.configuration).toBeDefined();
      expect(result.configuration.HeroTitle).toBe('Welcome to Survey');
      expect(result.configuration.HeroSubtitle).toBe('Please provide your feedback');
      expect(result.configuration.BackgroundColor).toBe('#ffffff');
      expect(result.configuration.PrimaryColor).toBe('#007bff');
      expect(result.configuration.ShowProgressBar).toBe(true);

      createdSurveyIds.push(result.SurveyId);
    });

    test('should create a survey with questions', async () => {
      const surveyData = {
        title: 'Test Survey with Questions',
        description: 'Testing with questions',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        userId: testUserId,
        questions: [
          {
            type: 'Text',
            promptText: 'What is your name?',
            isMandatory: true,
            displayOrder: 1,
            pageNumber: 1
          },
          {
            type: 'Rating',
            promptText: 'How satisfied are you?',
            isMandatory: true,
            displayOrder: 2,
            pageNumber: 1,
            options: { ratingScale: 10 },
            commentRequiredBelowRating: 5
          },
          {
            type: 'MultipleChoice',
            promptText: 'Select your preference',
            isMandatory: false,
            displayOrder: 3,
            pageNumber: 1,
            layoutOrientation: 'vertical',
            options: { choices: ['Option 1', 'Option 2', 'Option 3'] }
          }
        ]
      };

      const result = await surveyService.saveSurvey(surveyData);

      expect(result).toBeDefined();
      expect(result.questions).toBeDefined();
      expect(result.questions.length).toBe(3);
      expect(result.questions[0].Type).toBe('Text');
      expect(result.questions[0].PromptText).toBe('What is your name?');
      expect(result.questions[1].Type).toBe('Rating');
      expect(result.questions[1].CommentRequiredBelowRating).toBe(5);
      expect(result.questions[2].Type).toBe('MultipleChoice');
      expect(result.questions[2].LayoutOrientation).toBe('vertical');

      createdSurveyIds.push(result.SurveyId);
    });

    test('should create a survey with status', async () => {
      const surveyData = {
        title: 'Test Survey with Status',
        description: 'Testing with status',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        status: 'Active',
        userId: testUserId
      };

      const result = await surveyService.saveSurvey(surveyData);

      expect(result).toBeDefined();
      expect(result.Status).toBe('Active');

      createdSurveyIds.push(result.SurveyId);
    });

    test('should throw ValidationError if userId is missing', async () => {
      const surveyData = {
        title: 'Test Survey',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31')
      };

      await expect(surveyService.saveSurvey(surveyData)).rejects.toThrow(ValidationError);
      await expect(surveyService.saveSurvey(surveyData)).rejects.toThrow('userId is required');
    });

    test('should throw ValidationError if title is missing', async () => {
      const surveyData = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        userId: testUserId
      };

      await expect(surveyService.saveSurvey(surveyData)).rejects.toThrow(ValidationError);
      await expect(surveyService.saveSurvey(surveyData)).rejects.toThrow('Title is required');
    });
  });

  describe('saveSurvey - Update', () => {
    let existingSurveyId;

    beforeEach(async () => {
      // Create a survey to update
      const surveyData = {
        title: 'Original Survey',
        description: 'Original description',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        userId: testUserId,
        configuration: {
          heroTitle: 'Original Hero',
          backgroundColor: '#ffffff'
        },
        questions: [
          {
            type: 'Text',
            promptText: 'Original question',
            isMandatory: true,
            displayOrder: 1,
            pageNumber: 1
          }
        ]
      };

      const result = await surveyService.saveSurvey(surveyData);
      existingSurveyId = result.SurveyId;
      createdSurveyIds.push(existingSurveyId);
    });

    test('should update survey basic info', async () => {
      const updateData = {
        surveyId: existingSurveyId,
        title: 'Updated Survey Title',
        description: 'Updated description',
        userId: testUserId
      };

      const result = await surveyService.saveSurvey(updateData);

      expect(result).toBeDefined();
      expect(result.SurveyId).toBe(existingSurveyId);
      expect(result.Title).toBe('Updated Survey Title');
      expect(result.Description).toBe('Updated description');
    });

    test('should update survey configuration', async () => {
      const updateData = {
        surveyId: existingSurveyId,
        userId: testUserId,
        configuration: {
          heroTitle: 'Updated Hero',
          heroSubtitle: 'New subtitle',
          backgroundColor: '#000000',
          primaryColor: '#ff0000'
        }
      };

      const result = await surveyService.saveSurvey(updateData);

      expect(result).toBeDefined();
      expect(result.configuration.HeroTitle).toBe('Updated Hero');
      expect(result.configuration.HeroSubtitle).toBe('New subtitle');
      expect(result.configuration.BackgroundColor).toBe('#000000');
      expect(result.configuration.PrimaryColor).toBe('#ff0000');
    });

    test('should update survey questions', async () => {
      // Get existing question
      const existing = await surveyService.getSurveyById(existingSurveyId);
      const existingQuestionId = existing.questions[0].QuestionId;

      const updateData = {
        surveyId: existingSurveyId,
        userId: testUserId,
        questions: [
          {
            QuestionId: existingQuestionId,
            type: 'Text',
            promptText: 'Updated question text',
            isMandatory: false,
            displayOrder: 1,
            pageNumber: 1
          },
          {
            type: 'Rating',
            promptText: 'New question',
            isMandatory: true,
            displayOrder: 2,
            pageNumber: 1,
            options: { ratingScale: 5 }
          }
        ]
      };

      const result = await surveyService.saveSurvey(updateData);

      expect(result).toBeDefined();
      expect(result.questions.length).toBe(2);
      expect(result.questions[0].PromptText).toBe('Updated question text');
      expect(result.questions[0].IsMandatory).toBe(false);
      expect(result.questions[1].Type).toBe('Rating');
      expect(result.questions[1].PromptText).toBe('New question');
    });

    test('should throw NotFoundError if survey does not exist', async () => {
      const updateData = {
        surveyId: '00000000-0000-0000-0000-000000000000',
        title: 'Updated Title',
        userId: testUserId
      };

      await expect(surveyService.saveSurvey(updateData)).rejects.toThrow(NotFoundError);
      await expect(surveyService.saveSurvey(updateData)).rejects.toThrow('Survey not found');
    });
  });

  describe('getSurveyById - Complete Data', () => {
    let testSurveyId;

    beforeEach(async () => {
      // Create a complete survey
      const surveyData = {
        title: 'Complete Survey Test',
        description: 'Testing complete data retrieval',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        targetRespondents: 100,
        targetScore: 8.5,
        userId: testUserId,
        configuration: {
          heroTitle: 'Welcome',
          heroSubtitle: 'Feedback Survey',
          backgroundColor: '#f0f0f0',
          primaryColor: '#007bff',
          fontFamily: 'Arial',
          showProgressBar: true,
          showPageNumbers: true,
          multiPage: true
        },
        questions: [
          {
            type: 'Text',
            promptText: 'Question 1',
            isMandatory: true,
            displayOrder: 1,
            pageNumber: 1
          },
          {
            type: 'Rating',
            promptText: 'Question 2',
            isMandatory: true,
            displayOrder: 2,
            pageNumber: 1,
            options: { ratingScale: 10 }
          },
          {
            type: 'Text',
            promptText: 'Question 3',
            isMandatory: false,
            displayOrder: 3,
            pageNumber: 2
          }
        ]
      };

      const result = await surveyService.saveSurvey(surveyData);
      testSurveyId = result.SurveyId;
      createdSurveyIds.push(testSurveyId);
    });

    test('should retrieve complete survey with all nested data', async () => {
      const result = await surveyService.getSurveyById(testSurveyId);

      expect(result).toBeDefined();
      expect(result.SurveyId).toBe(testSurveyId);
      expect(result.Title).toBe('Complete Survey Test');
      expect(result.TargetRespondents).toBe(100);
      expect(result.TargetScore).toBe(8.5);
      
      // Check configuration
      expect(result.configuration).toBeDefined();
      expect(result.configuration.HeroTitle).toBe('Welcome');
      expect(result.configuration.HeroSubtitle).toBe('Feedback Survey');
      expect(result.configuration.MultiPage).toBe(true);
      
      // Check questions
      expect(result.questions).toBeDefined();
      expect(result.questions.length).toBe(3);
      
      // Check pages organization
      expect(result.pages).toBeDefined();
      expect(result.pages[1]).toBeDefined();
      expect(result.pages[1].length).toBe(2);
      expect(result.pages[2]).toBeDefined();
      expect(result.pages[2].length).toBe(1);
    });

    test('should throw NotFoundError if survey does not exist', async () => {
      await expect(
        surveyService.getSurveyById('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(NotFoundError);
    });
  });
});
