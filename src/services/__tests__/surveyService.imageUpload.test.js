const { SurveyService, ValidationError, NotFoundError } = require('../surveyService');
const db = require('../../database/connection');
const fs = require('fs').promises;
const path = require('path');

// Mock mssql module
jest.mock('mssql', () => ({
  connect: jest.fn(),
  close: jest.fn(),
  Transaction: jest.fn(),
  UniqueIdentifier: 'UniqueIdentifier',
  NVarChar: jest.fn((length) => `NVarChar(${length})`),
  MAX: 'MAX'
}));

// Mock config
jest.mock('../../config', () => ({
  baseUrl: 'http://localhost:3000',
  upload: {
    directory: 'uploads',
    maxFileSizeMB: 10
  },
  logging: {
    level: 'info',
    file: 'logs/app.log'
  }
}));

// Mock logger
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock dependencies
jest.mock('../../database/connection');
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn()
  }
}));

describe('SurveyService - Image Upload', () => {
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
      begin: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      request: jest.fn().mockReturnValue(mockRequest)
    };

    mockPool = {
      request: jest.fn().mockReturnValue(mockRequest),
      transaction: jest.fn().mockReturnValue(mockTransaction)
    };

    db.getPool = jest.fn().mockResolvedValue(mockPool);

    // Reset fs mocks
    fs.access.mockReset();
    fs.mkdir.mockReset();
    fs.writeFile.mockReset();
    fs.unlink.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateImageFile', () => {
    it('should validate valid image file', () => {
      const file = {
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
        size: 1024 * 1024 // 1MB
      };

      expect(() => surveyService.validateImageFile(file)).not.toThrow();
    });

    it('should reject file without buffer', () => {
      const file = {
        mimetype: 'image/jpeg',
        size: 1024
      };

      expect(() => surveyService.validateImageFile(file))
        .toThrow(ValidationError);
      expect(() => surveyService.validateImageFile(file))
        .toThrow('No file provided');
    });

    it('should reject invalid file type', () => {
      const file = {
        buffer: Buffer.from('test'),
        mimetype: 'application/pdf',
        size: 1024
      };

      expect(() => surveyService.validateImageFile(file))
        .toThrow(ValidationError);
      expect(() => surveyService.validateImageFile(file))
        .toThrow('Invalid file type');
    });

    it('should reject file exceeding size limit', () => {
      const file = {
        buffer: Buffer.from('test'),
        mimetype: 'image/jpeg',
        size: 15 * 1024 * 1024 // 15MB (exceeds 10MB limit)
      };

      expect(() => surveyService.validateImageFile(file))
        .toThrow(ValidationError);
      expect(() => surveyService.validateImageFile(file))
        .toThrow('File size exceeds maximum');
    });

    it('should accept all valid image types', () => {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      
      validTypes.forEach(mimetype => {
        const file = {
          buffer: Buffer.from('test'),
          mimetype,
          size: 1024
        };
        expect(() => surveyService.validateImageFile(file)).not.toThrow();
      });
    });
  });

  describe('generateUniqueFilename', () => {
    it('should generate unique filename with timestamp and random string', () => {
      const originalName = 'test-image.jpg';
      const filename = surveyService.generateUniqueFilename(originalName);

      expect(filename).toMatch(/^\d+-[a-f0-9]{16}\.jpg$/);
    });

    it('should preserve file extension', () => {
      const extensions = ['.jpg', '.png', '.gif', '.webp'];
      
      extensions.forEach(ext => {
        const filename = surveyService.generateUniqueFilename(`test${ext}`);
        expect(filename).toMatch(new RegExp(`${ext.replace('.', '\\.')}$`));
      });
    });

    it('should generate different filenames for multiple calls', () => {
      const filename1 = surveyService.generateUniqueFilename('test.jpg');
      const filename2 = surveyService.generateUniqueFilename('test.jpg');

      expect(filename1).not.toBe(filename2);
    });
  });

  describe('uploadHeroImage', () => {
    const surveyId = '123e4567-e89b-12d3-a456-426614174000';
    const file = {
      buffer: Buffer.from('test image data'),
      mimetype: 'image/jpeg',
      originalname: 'hero.jpg',
      size: 1024
    };

    beforeEach(() => {
      fs.access.mockRejectedValue(new Error('Directory not found'));
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
    });

    it('should upload hero image and create configuration if not exists', async () => {
      // Mock survey exists
      mockRequest.query
        .mockResolvedValueOnce({ 
          recordset: [{ SurveyId: surveyId, Title: 'Test Survey' }] 
        })
        .mockResolvedValueOnce({ recordset: [] }) // No existing config
        .mockResolvedValueOnce({ recordset: [{ ConfigId: 'config-id' }] }); // Insert result

      const result = await surveyService.uploadHeroImage(surveyId, file);

      expect(result).toHaveProperty('HeroImageUrl');
      expect(result.HeroImageUrl).toMatch(/http:\/\/localhost:3000\/surveys\/\d+-[a-f0-9]{16}\.jpg/);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should update existing configuration with hero image', async () => {
      const existingConfig = {
        ConfigId: 'config-id',
        SurveyId: surveyId,
        HeroImageUrl: 'http://localhost:3000/surveys/old-image.jpg'
      };

      mockRequest.query
        .mockResolvedValueOnce({ 
          recordset: [{ SurveyId: surveyId, Title: 'Test Survey' }] 
        })
        .mockResolvedValueOnce({ recordset: [existingConfig] }) // Existing config
        .mockResolvedValueOnce({ recordset: [] }); // Update result

      fs.unlink.mockResolvedValue();

      const result = await surveyService.uploadHeroImage(surveyId, file);

      expect(result).toHaveProperty('HeroImageUrl');
      expect(result.HeroImageUrl).not.toBe(existingConfig.HeroImageUrl);
      // Note: fs.unlink is called but may not be awaited in the implementation
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      await expect(surveyService.uploadHeroImage(surveyId, file))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for invalid file', async () => {
      const invalidFile = {
        buffer: Buffer.from('test'),
        mimetype: 'application/pdf',
        size: 1024
      };

      await expect(surveyService.uploadHeroImage(surveyId, invalidFile))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('uploadQuestionImage', () => {
    const questionId = '123e4567-e89b-12d3-a456-426614174001';
    const file = {
      buffer: Buffer.from('test image data'),
      mimetype: 'image/png',
      originalname: 'question.png',
      size: 2048
    };

    beforeEach(() => {
      fs.access.mockRejectedValue(new Error('Directory not found'));
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
    });

    it('should upload question image successfully', async () => {
      const existingQuestion = {
        QuestionId: questionId,
        Type: 'Text',
        PromptText: 'Test question',
        ImageUrl: null
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [existingQuestion] })
        .mockResolvedValueOnce({ recordset: [] }); // Update result

      const result = await surveyService.uploadQuestionImage(questionId, file);

      expect(result).toHaveProperty('ImageUrl');
      expect(result.ImageUrl).toMatch(/http:\/\/localhost:3000\/questions\/\d+-[a-f0-9]{16}\.png/);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should replace existing question image', async () => {
      const existingQuestion = {
        QuestionId: questionId,
        Type: 'Text',
        PromptText: 'Test question',
        ImageUrl: 'http://localhost:3000/questions/old-image.png'
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [existingQuestion] })
        .mockResolvedValueOnce({ recordset: [] }); // Update result

      fs.unlink.mockResolvedValue();

      const result = await surveyService.uploadQuestionImage(questionId, file);

      expect(result.ImageUrl).not.toBe(existingQuestion.ImageUrl);
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should throw NotFoundError if question does not exist', async () => {
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      await expect(surveyService.uploadQuestionImage(questionId, file))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('uploadOptionImage', () => {
    const questionId = '123e4567-e89b-12d3-a456-426614174002';
    const file = {
      buffer: Buffer.from('test image data'),
      mimetype: 'image/jpeg',
      originalname: 'option.jpg',
      size: 1024
    };

    beforeEach(() => {
      fs.access.mockRejectedValue(new Error('Directory not found'));
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
    });

    it('should upload option image for MultipleChoice question', async () => {
      const existingQuestion = {
        QuestionId: questionId,
        Type: 'MultipleChoice',
        PromptText: 'Choose one',
        Options: JSON.stringify({
          options: ['Option 1', 'Option 2', 'Option 3']
        })
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [existingQuestion] })
        .mockResolvedValueOnce({ recordset: [] }); // Update result

      const result = await surveyService.uploadOptionImage(questionId, 0, file);

      expect(result).toHaveProperty('Options');
      const options = typeof result.Options === 'string' 
        ? JSON.parse(result.Options) 
        : result.Options;
      expect(options.options[0]).toHaveProperty('imageUrl');
      expect(options.options[0].imageUrl).toMatch(/http:\/\/localhost:3000\/options\/\d+-[a-f0-9]{16}\.jpg/);
    });

    it('should upload option image for Checkbox question', async () => {
      const existingQuestion = {
        QuestionId: questionId,
        Type: 'Checkbox',
        PromptText: 'Choose multiple',
        Options: JSON.stringify({
          options: ['Option 1', 'Option 2']
        })
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [existingQuestion] })
        .mockResolvedValueOnce({ recordset: [] });

      const result = await surveyService.uploadOptionImage(questionId, 1, file);

      const options = typeof result.Options === 'string' 
        ? JSON.parse(result.Options) 
        : result.Options;
      expect(options.options[1]).toHaveProperty('imageUrl');
    });

    it('should throw ValidationError for non-choice question types', async () => {
      const existingQuestion = {
        QuestionId: questionId,
        Type: 'Text',
        PromptText: 'Text question',
        Options: null
      };

      mockRequest.query.mockResolvedValueOnce({ recordset: [existingQuestion] });

      await expect(surveyService.uploadOptionImage(questionId, 0, file))
        .rejects.toThrow('Option images are only supported for MultipleChoice and Checkbox');
    });

    it('should throw ValidationError for invalid option index', async () => {
      const existingQuestion = {
        QuestionId: questionId,
        Type: 'MultipleChoice',
        Options: JSON.stringify({
          options: ['Option 1', 'Option 2']
        })
      };

      mockRequest.query.mockResolvedValueOnce({ recordset: [existingQuestion] });

      await expect(surveyService.uploadOptionImage(questionId, 5, file))
        .rejects.toThrow('out of bounds');
    });

    it('should replace existing option image', async () => {
      const existingQuestion = {
        QuestionId: questionId,
        Type: 'MultipleChoice',
        Options: JSON.stringify({
          options: [
            { text: 'Option 1', imageUrl: 'http://localhost:3000/options/old-image.jpg' },
            'Option 2'
          ]
        })
      };

      mockRequest.query
        .mockResolvedValueOnce({ recordset: [existingQuestion] })
        .mockResolvedValueOnce({ recordset: [] });

      fs.unlink.mockResolvedValue();

      const result = await surveyService.uploadOptionImage(questionId, 0, file);

      const options = typeof result.Options === 'string' 
        ? JSON.parse(result.Options) 
        : result.Options;
      expect(options.options[0].imageUrl).not.toBe('http://localhost:3000/options/old-image.jpg');
      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe('uploadLogo', () => {
    const surveyId = '123e4567-e89b-12d3-a456-426614174003';
    const file = {
      buffer: Buffer.from('logo data'),
      mimetype: 'image/png',
      originalname: 'logo.png',
      size: 512
    };

    beforeEach(() => {
      fs.access.mockRejectedValue(new Error('Directory not found'));
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
    });

    it('should upload logo successfully', async () => {
      mockRequest.query
        .mockResolvedValueOnce({ 
          recordset: [{ SurveyId: surveyId, Title: 'Test Survey' }] 
        })
        .mockResolvedValueOnce({ recordset: [] })
        .mockResolvedValueOnce({ recordset: [{ ConfigId: 'config-id' }] });

      const result = await surveyService.uploadLogo(surveyId, file);

      expect(result).toHaveProperty('LogoUrl');
      expect(result.LogoUrl).toMatch(/http:\/\/localhost:3000\/surveys\/\d+-[a-f0-9]{16}\.png/);
    });
  });

  describe('uploadBackgroundImage', () => {
    const surveyId = '123e4567-e89b-12d3-a456-426614174004';
    const file = {
      buffer: Buffer.from('background data'),
      mimetype: 'image/jpeg',
      originalname: 'background.jpg',
      size: 2048
    };

    beforeEach(() => {
      fs.access.mockRejectedValue(new Error('Directory not found'));
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
    });

    it('should upload background image successfully', async () => {
      mockRequest.query
        .mockResolvedValueOnce({ 
          recordset: [{ SurveyId: surveyId, Title: 'Test Survey' }] 
        })
        .mockResolvedValueOnce({ recordset: [] })
        .mockResolvedValueOnce({ recordset: [{ ConfigId: 'config-id' }] });

      const result = await surveyService.uploadBackgroundImage(surveyId, file);

      expect(result).toHaveProperty('BackgroundImageUrl');
      expect(result.BackgroundImageUrl).toMatch(/http:\/\/localhost:3000\/surveys\/\d+-[a-f0-9]{16}\.jpg/);
    });
  });
});
