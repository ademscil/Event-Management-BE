const { SurveyService, NotFoundError } = require('../surveyService');
const db = require('../../database/connection');
const config = require('../../config');

// Mock dependencies
jest.mock('../../database/connection');
jest.mock('../../config/logger');
jest.mock('qrcode');

const QRCode = require('qrcode');

describe('SurveyService - Operational Controls', () => {
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
    
    // Mock config
    config.baseUrl = 'http://localhost:3000';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSurveyLink', () => {
    const surveyId = '12345678-1234-1234-1234-123456789012';

    it('should generate survey link without shortening', async () => {
      // Mock survey exists
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ SurveyId: surveyId, Title: 'Test Survey' }]
        })
        .mockResolvedValueOnce({ recordset: [] }); // Update query

      const result = await surveyService.generateSurveyLink(surveyId, false);

      expect(result.surveyLink).toBe(`http://localhost:3000/survey/${surveyId}`);
      expect(result.shortenedLink).toBeNull();
      
      // Verify update was called
      expect(mockRequest.input).toHaveBeenCalledWith('surveyId', expect.anything(), surveyId);
      expect(mockRequest.input).toHaveBeenCalledWith('surveyLink', expect.anything(), `http://localhost:3000/survey/${surveyId}`);
      expect(mockRequest.input).toHaveBeenCalledWith('shortenedLink', expect.anything(), null);
    });

    it('should generate survey link with shortening', async () => {
      // Mock survey exists
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ SurveyId: surveyId, Title: 'Test Survey' }]
        })
        .mockResolvedValueOnce({ recordset: [] }); // Update query

      const result = await surveyService.generateSurveyLink(surveyId, true);

      expect(result.surveyLink).toBe(`http://localhost:3000/survey/${surveyId}`);
      expect(result.shortenedLink).toBe('http://localhost:3000/s/12345678');
      
      // Verify update was called with shortened link
      expect(mockRequest.input).toHaveBeenCalledWith('shortenedLink', expect.anything(), 'http://localhost:3000/s/12345678');
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      // Mock survey not found
      mockRequest.query.mockResolvedValueOnce({
        recordset: []
      });

      await expect(surveyService.generateSurveyLink(surveyId, false))
        .rejects.toThrow(NotFoundError);
    });

    it('should update survey with generated links', async () => {
      // Mock survey exists
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{ SurveyId: surveyId, Title: 'Test Survey' }]
        })
        .mockResolvedValueOnce({ recordset: [] }); // Update query

      await surveyService.generateSurveyLink(surveyId, true);

      // Verify UPDATE query was called
      const updateCall = mockRequest.query.mock.calls[1][0];
      expect(updateCall).toContain('UPDATE Surveys');
      expect(updateCall).toContain('SET SurveyLink = @surveyLink');
      expect(updateCall).toContain('ShortenedLink = @shortenedLink');
    });
  });

  describe('generateQRCode', () => {
    const surveyId = '12345678-1234-1234-1234-123456789012';
    const mockQRDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';

    beforeEach(() => {
      QRCode.toDataURL = jest.fn().mockResolvedValue(mockQRDataUrl);
    });

    it('should generate QR code using existing survey link', async () => {
      const surveyLink = `http://localhost:3000/survey/${surveyId}`;
      
      // Mock survey with existing link
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{
            SurveyId: surveyId,
            SurveyLink: surveyLink,
            ShortenedLink: null
          }]
        })
        .mockResolvedValueOnce({ recordset: [] }); // Update query

      const result = await surveyService.generateQRCode(surveyId);

      expect(result).toBe(mockQRDataUrl);
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        surveyLink,
        expect.objectContaining({
          errorCorrectionLevel: 'M',
          type: 'image/png',
          width: 300,
          margin: 2
        })
      );
    });

    it('should use shortened link if available', async () => {
      const shortenedLink = 'http://localhost:3000/s/12345678';
      
      // Mock survey with shortened link
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{
            SurveyId: surveyId,
            SurveyLink: `http://localhost:3000/survey/${surveyId}`,
            ShortenedLink: shortenedLink
          }]
        })
        .mockResolvedValueOnce({ recordset: [] }); // Update query

      await surveyService.generateQRCode(surveyId);

      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        shortenedLink,
        expect.any(Object)
      );
    });

    it('should generate link first if no link exists', async () => {
      // Mock survey without link
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{
            SurveyId: surveyId,
            SurveyLink: null,
            ShortenedLink: null
          }]
        })
        .mockResolvedValueOnce({
          recordset: [{ SurveyId: surveyId, Title: 'Test Survey' }]
        })
        .mockResolvedValueOnce({ recordset: [] }) // Update from generateSurveyLink
        .mockResolvedValueOnce({ recordset: [] }); // Update for QR code

      await surveyService.generateQRCode(surveyId);

      // Should have called generateSurveyLink
      expect(QRCode.toDataURL).toHaveBeenCalled();
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      // Mock survey not found
      mockRequest.query.mockResolvedValueOnce({
        recordset: []
      });

      await expect(surveyService.generateQRCode(surveyId))
        .rejects.toThrow(NotFoundError);
    });

    it('should update survey with QR code data URL', async () => {
      const surveyLink = `http://localhost:3000/survey/${surveyId}`;
      
      // Mock survey with existing link
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{
            SurveyId: surveyId,
            SurveyLink: surveyLink,
            ShortenedLink: null
          }]
        })
        .mockResolvedValueOnce({ recordset: [] }); // Update query

      await surveyService.generateQRCode(surveyId);

      // Verify UPDATE query was called
      const updateCall = mockRequest.query.mock.calls[1][0];
      expect(updateCall).toContain('UPDATE Surveys');
      expect(updateCall).toContain('SET QRCodeDataUrl = @qrCodeDataUrl');
      expect(mockRequest.input).toHaveBeenCalledWith('qrCodeDataUrl', expect.anything(), mockQRDataUrl);
    });
  });

  describe('generateEmbedCode', () => {
    const surveyId = '12345678-1234-1234-1234-123456789012';
    const surveyTitle = 'Customer Satisfaction Survey';

    it('should generate embed code using existing survey link', async () => {
      const surveyLink = `http://localhost:3000/survey/${surveyId}`;
      
      // Mock survey with existing link
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{
            SurveyId: surveyId,
            SurveyLink: surveyLink,
            Title: surveyTitle
          }]
        })
        .mockResolvedValueOnce({ recordset: [] }); // Update query

      const result = await surveyService.generateEmbedCode(surveyId);

      expect(result).toBe(
        `<iframe src="${surveyLink}" width="100%" height="600px" frameborder="0" title="${surveyTitle}"></iframe>`
      );
    });

    it('should generate link first if no link exists', async () => {
      // Mock survey without link
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{
            SurveyId: surveyId,
            SurveyLink: null,
            Title: surveyTitle
          }]
        })
        .mockResolvedValueOnce({
          recordset: [{ SurveyId: surveyId, Title: surveyTitle }]
        })
        .mockResolvedValueOnce({ recordset: [] }) // Update from generateSurveyLink
        .mockResolvedValueOnce({ recordset: [] }); // Update for embed code

      const result = await surveyService.generateEmbedCode(surveyId);

      expect(result).toContain('<iframe src="http://localhost:3000/survey/');
      expect(result).toContain(`title="${surveyTitle}"`);
    });

    it('should use default title if survey has no title', async () => {
      const surveyLink = `http://localhost:3000/survey/${surveyId}`;
      
      // Mock survey without title
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{
            SurveyId: surveyId,
            SurveyLink: surveyLink,
            Title: null
          }]
        })
        .mockResolvedValueOnce({ recordset: [] }); // Update query

      const result = await surveyService.generateEmbedCode(surveyId);

      expect(result).toContain('title="Survey"');
    });

    it('should throw NotFoundError if survey does not exist', async () => {
      // Mock survey not found
      mockRequest.query.mockResolvedValueOnce({
        recordset: []
      });

      await expect(surveyService.generateEmbedCode(surveyId))
        .rejects.toThrow(NotFoundError);
    });

    it('should update survey with embed code', async () => {
      const surveyLink = `http://localhost:3000/survey/${surveyId}`;
      const expectedEmbedCode = `<iframe src="${surveyLink}" width="100%" height="600px" frameborder="0" title="${surveyTitle}"></iframe>`;
      
      // Mock survey with existing link
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{
            SurveyId: surveyId,
            SurveyLink: surveyLink,
            Title: surveyTitle
          }]
        })
        .mockResolvedValueOnce({ recordset: [] }); // Update query

      await surveyService.generateEmbedCode(surveyId);

      // Verify UPDATE query was called
      const updateCall = mockRequest.query.mock.calls[1][0];
      expect(updateCall).toContain('UPDATE Surveys');
      expect(updateCall).toContain('SET EmbedCode = @embedCode');
      expect(mockRequest.input).toHaveBeenCalledWith('embedCode', expect.anything(), expectedEmbedCode);
    });

    it('should include proper iframe attributes', async () => {
      const surveyLink = `http://localhost:3000/survey/${surveyId}`;
      
      // Mock survey with existing link
      mockRequest.query
        .mockResolvedValueOnce({
          recordset: [{
            SurveyId: surveyId,
            SurveyLink: surveyLink,
            Title: surveyTitle
          }]
        })
        .mockResolvedValueOnce({ recordset: [] }); // Update query

      const result = await surveyService.generateEmbedCode(surveyId);

      expect(result).toContain('width="100%"');
      expect(result).toContain('height="600px"');
      expect(result).toContain('frameborder="0"');
      expect(result).toContain(`src="${surveyLink}"`);
    });
  });
});
