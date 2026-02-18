const { SurveyService } = require('../surveyService');
const db = require('../../database/connection');

// This is an integration test - only run when database is available
describe('SurveyService - Operational Controls Integration', () => {
  let surveyService;
  let testSurveyId;

  beforeAll(async () => {
    surveyService = new SurveyService();
    
    // Check if database is available
    try {
      const pool = await db.getPool();
      
      // Create a test survey
      const result = await pool.request()
        .input('title', 'Test Survey for Operational Controls')
        .input('description', 'Integration test survey')
        .input('startDate', new Date())
        .input('endDate', new Date(Date.now() + 86400000)) // Tomorrow
        .query(`
          INSERT INTO Surveys (Title, Description, StartDate, EndDate, Status)
          OUTPUT INSERTED.SurveyId
          VALUES (@title, @description, @startDate, @endDate, 'Draft')
        `);
      
      testSurveyId = result.recordset[0].SurveyId;
    } catch (error) {
      console.log('Database not available, skipping integration tests');
      testSurveyId = null;
    }
  });

  afterAll(async () => {
    // Clean up test survey
    if (testSurveyId) {
      try {
        const pool = await db.getPool();
        await pool.request()
          .input('surveyId', testSurveyId)
          .query('DELETE FROM Surveys WHERE SurveyId = @surveyId');
      } catch (error) {
        console.log('Error cleaning up test survey:', error.message);
      }
    }
  });

  // Skip tests if database is not available
  const testIf = (condition) => condition ? test : test.skip;

  testIf(testSurveyId)('should generate survey link and store in database', async () => {
    const result = await surveyService.generateSurveyLink(testSurveyId, false);

    expect(result.surveyLink).toContain('/survey/');
    expect(result.surveyLink).toContain(testSurveyId);
    expect(result.shortenedLink).toBeNull();

    // Verify it was stored in database
    const pool = await db.getPool();
    const dbResult = await pool.request()
      .input('surveyId', testSurveyId)
      .query('SELECT SurveyLink, ShortenedLink FROM Surveys WHERE SurveyId = @surveyId');

    expect(dbResult.recordset[0].SurveyLink).toBe(result.surveyLink);
    expect(dbResult.recordset[0].ShortenedLink).toBeNull();
  });

  testIf(testSurveyId)('should generate shortened link when requested', async () => {
    const result = await surveyService.generateSurveyLink(testSurveyId, true);

    expect(result.surveyLink).toContain('/survey/');
    expect(result.shortenedLink).toContain('/s/');
    expect(result.shortenedLink).toBeTruthy();

    // Verify it was stored in database
    const pool = await db.getPool();
    const dbResult = await pool.request()
      .input('surveyId', testSurveyId)
      .query('SELECT SurveyLink, ShortenedLink FROM Surveys WHERE SurveyId = @surveyId');

    expect(dbResult.recordset[0].ShortenedLink).toBe(result.shortenedLink);
  });

  testIf(testSurveyId)('should generate QR code and store in database', async () => {
    const qrCodeDataUrl = await surveyService.generateQRCode(testSurveyId);

    expect(qrCodeDataUrl).toContain('data:image/png;base64,');

    // Verify it was stored in database
    const pool = await db.getPool();
    const dbResult = await pool.request()
      .input('surveyId', testSurveyId)
      .query('SELECT QRCodeDataUrl FROM Surveys WHERE SurveyId = @surveyId');

    expect(dbResult.recordset[0].QRCodeDataUrl).toBe(qrCodeDataUrl);
  });

  testIf(testSurveyId)('should generate embed code and store in database', async () => {
    const embedCode = await surveyService.generateEmbedCode(testSurveyId);

    expect(embedCode).toContain('<iframe');
    expect(embedCode).toContain('src=');
    expect(embedCode).toContain('width="100%"');
    expect(embedCode).toContain('height="600px"');

    // Verify it was stored in database
    const pool = await db.getPool();
    const dbResult = await pool.request()
      .input('surveyId', testSurveyId)
      .query('SELECT EmbedCode FROM Surveys WHERE SurveyId = @surveyId');

    expect(dbResult.recordset[0].EmbedCode).toBe(embedCode);
  });

  testIf(testSurveyId)('should generate all operational controls in sequence', async () => {
    // Generate link with shortening
    const linkResult = await surveyService.generateSurveyLink(testSurveyId, true);
    expect(linkResult.surveyLink).toBeTruthy();
    expect(linkResult.shortenedLink).toBeTruthy();

    // Generate QR code (should use shortened link)
    const qrCode = await surveyService.generateQRCode(testSurveyId);
    expect(qrCode).toContain('data:image/png;base64,');

    // Generate embed code
    const embedCode = await surveyService.generateEmbedCode(testSurveyId);
    expect(embedCode).toContain('<iframe');

    // Verify all are stored in database
    const pool = await db.getPool();
    const dbResult = await pool.request()
      .input('surveyId', testSurveyId)
      .query(`
        SELECT SurveyLink, ShortenedLink, QRCodeDataUrl, EmbedCode 
        FROM Surveys 
        WHERE SurveyId = @surveyId
      `);

    const survey = dbResult.recordset[0];
    expect(survey.SurveyLink).toBe(linkResult.surveyLink);
    expect(survey.ShortenedLink).toBe(linkResult.shortenedLink);
    expect(survey.QRCodeDataUrl).toBe(qrCode);
    expect(survey.EmbedCode).toBe(embedCode);
  });
});
