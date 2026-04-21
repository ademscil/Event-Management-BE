const sql = require('../database/sql-client');

  
const { randomUUID } = require('crypto');
const pool = require('../database/connection');
const logger = require('../config/logger');
const publishCycleService = require('./publishCycleService');
const {
  DuplicateError,
  NotFoundError,
  ValidationError
} = require('./response-service/errors');
const {
  checkResponseHasValue,
  extractNumericResponseValue,
  isSourceMappedApplication,
  normalizeQuestionRef,
  validateApplicationSelections,
  validateMandatoryQuestions
} = require('./response-service/validation');
const {
  getOrgHierarchyByApplication,
  normalizeRespondent,
  resolveRespondentOrg,
  validateOrganizationalSelections
} = require('./response-service/respondent');
const {
  getResponseById,
  getResponseStatistics,
  getResponses
} = require('./response-service/read');
const {
  parseComparableDate
} = require('./survey-service/scheduling');
const {
  resolveSurveyIdentifier
} = require('./survey-service/read-model');

function parseSurveyWindowDate(value, fieldName) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ValidationError(`Invalid ${fieldName}`);
    }

    return new Date(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds()
    );
  }

  return parseComparableDate(value, fieldName);
}

/**
 * Response Service
 * Handles survey form rendering, response submission, and retrieval
 */
class ResponseService {
  constructor() {
    this.pool = pool;
    this.questionResponsesHasApplicationId = null;
    this.questionResponsesHasTakeoutStatus = null;
    this.responsesHasApprovalStatus = null;
  }

  async createRequest() {
    if (this.pool && typeof this.pool.getPool === 'function') {
      const dbPool = await this.pool.getPool();
      return dbPool.request();
    }
    return this.pool.request();
  }

  async hasQuestionResponseApplicationIdColumn() {
    if (typeof this.questionResponsesHasApplicationId === 'boolean') {
      return this.questionResponsesHasApplicationId;
    }

    const result = await (await this.createRequest())
      .input('tableName', sql.NVarChar(128), 'QuestionResponses')
      .input('columnName', sql.NVarChar(128), 'ApplicationId')
      .query(`
        SELECT COUNT(1) AS Cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName
          AND COLUMN_NAME = @columnName
      `);

    this.questionResponsesHasApplicationId = Number(result.recordset?.[0]?.Cnt || 0) > 0;
    return this.questionResponsesHasApplicationId;
  }

  async hasQuestionResponseTakeoutStatusColumn() {
    if (typeof this.questionResponsesHasTakeoutStatus === 'boolean') {
      return this.questionResponsesHasTakeoutStatus;
    }

    const result = await (await this.createRequest())
      .input('tableName', sql.NVarChar(128), 'QuestionResponses')
      .input('columnName', sql.NVarChar(128), 'TakeoutStatus')
      .query(`
        SELECT COUNT(1) AS Cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName
          AND COLUMN_NAME = @columnName
      `);

    this.questionResponsesHasTakeoutStatus = Number(result.recordset?.[0]?.Cnt || 0) > 0;
    return this.questionResponsesHasTakeoutStatus;
  }

  async hasResponseApprovalStatusColumn() {
    if (typeof this.responsesHasApprovalStatus === 'boolean') {
      return this.responsesHasApprovalStatus;
    }

    const result = await (await this.createRequest())
      .input('tableName', sql.NVarChar(128), 'Responses')
      .input('columnName', sql.NVarChar(128), 'ResponseApprovalStatus')
      .query(`
        SELECT COUNT(1) AS Cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName
          AND COLUMN_NAME = @columnName
      `);

    this.responsesHasApprovalStatus = Number(result.recordset?.[0]?.Cnt || 0) > 0;
    return this.responsesHasApprovalStatus;
  }

  /**
   * Get survey form with configuration and questions
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Object>} Survey form data
   */
  async getSurveyForm(surveyId) {
    try {
      if (!String(surveyId || '').trim()) {
        throw new ValidationError('Survey ID is required');
      }
      const resolvedSurveyId = await resolveSurveyIdentifier(this.pool, sql, NotFoundError, surveyId);
      logger.info(`Getting survey form for surveyId: ${surveyId}`);

      // Get survey details
      const surveyResult = await (await this.createRequest())
        .input('surveyId', sql.UniqueIdentifier, resolvedSurveyId)
        .query(`
          SELECT 
            s.SurveyId,
            s.Title,
            s.Description,
            s.StartDate,
            s.EndDate,
            s.Status,
            s.TargetRespondents,
            s.TargetScore,
            s.DuplicatePreventionEnabled,
            sc.HeroTitle,
            sc.HeroSubtitle,
            sc.HeroImageUrl,
            sc.LogoUrl,
            sc.BackgroundImageUrl,
            sc.BackgroundColor,
            sc.PrimaryColor,
            sc.SecondaryColor,
            sc.FontFamily,
            sc.ButtonStyle,
            sc.ShowProgressBar,
            sc.ShowPageNumbers,
            sc.MultiPage
          FROM Events s
          LEFT JOIN EventConfiguration sc ON s.SurveyId = sc.SurveyId
          WHERE s.SurveyId = @surveyId
        `);

      if (surveyResult.recordset.length === 0) {
        throw new NotFoundError(`Survey with ID ${surveyId} not found`);
      }

      const survey = surveyResult.recordset[0];

      // Check if survey is active
      if (survey.Status !== 'Active') {
        throw new ValidationError('Survey is not currently active');
      }

      // Check if survey is within date range
      const now = new Date();
      const surveyStartDate = parseSurveyWindowDate(survey.StartDate, 'survey start date');
      const surveyEndDate = parseSurveyWindowDate(survey.EndDate, 'survey end date');
      if (now < surveyStartDate || now > surveyEndDate) {
        throw new ValidationError('Survey is not available at this time');
      }

      // Get questions
      const questionsResult = await (await this.createRequest())
        .input('surveyId', sql.UniqueIdentifier, resolvedSurveyId)
        .query(`
          SELECT 
            QuestionId,
            SurveyId,
            Type,
            PromptText,
            Subtitle,
            IsMandatory,
            DisplayOrder,
            PageNumber,
            Options,
            ImageUrl,
            LayoutOrientation
          FROM Questions
          WHERE SurveyId = @surveyId
          ORDER BY DisplayOrder
        `);

      const questions = questionsResult.recordset.map(q => ({
        questionId: q.QuestionId,
        surveyId: q.SurveyId,
        type: q.Type,
        promptText: q.PromptText,
        subtitle: q.Subtitle,
        isMandatory: q.IsMandatory,
        displayOrder: q.DisplayOrder,
        pageNumber: q.PageNumber,
        options: q.Options ? JSON.parse(q.Options) : null,
        imageUrl: q.ImageUrl,
        layoutOrientation: q.LayoutOrientation
      }));

      return {
        surveyId: survey.SurveyId,
        title: survey.Title,
        description: survey.Description,
        startDate: survey.StartDate,
        endDate: survey.EndDate,
        status: survey.Status,
        targetRespondents: survey.TargetRespondents,
        targetScore: survey.TargetScore,
        duplicatePreventionEnabled: survey.DuplicatePreventionEnabled,
        configuration: {
          heroTitle: survey.HeroTitle,
          heroSubtitle: survey.HeroSubtitle,
          heroImageUrl: survey.HeroImageUrl,
          logoUrl: survey.LogoUrl,
          backgroundImageUrl: survey.BackgroundImageUrl,
          backgroundColor: survey.BackgroundColor,
          primaryColor: survey.PrimaryColor,
          secondaryColor: survey.SecondaryColor,
          fontFamily: survey.FontFamily,
          buttonStyle: survey.ButtonStyle,
          showProgressBar: survey.ShowProgressBar,
          showPageNumbers: survey.ShowPageNumbers,
          multiPage: survey.MultiPage
        },
        questions: questions
      };
    } catch (error) {
      logger.error(`Error getting survey form: ${error.message}`, { error, surveyId });
      throw error;
    }
  }

  /**
   * Get available applications for respondent selection.
   * If departmentId/functionId are provided, filter by mapping.
   * Otherwise return all active mapped applications.
   * @param {string} surveyId - Survey ID
   * @param {string} departmentId - Department ID (optional)
   * @param {string} functionId - Function ID (optional)
   * @returns {Promise<Array>} List of available applications
   */
  async getAvailableApplications(surveyId, departmentId, functionId) {
    try {
      if (!String(surveyId || '').trim()) {
        throw new ValidationError('Survey ID is required');
      }
      logger.info(`Getting available applications for surveyId: ${surveyId}, departmentId: ${departmentId}, functionId: ${functionId}`);

      const request = await this.createRequest();
      let query = `
          SELECT DISTINCT
            a.ApplicationId,
            a.Code,
            a.Name,
            a.Description
          FROM Applications a
          WHERE a.IsActive = 1
      `;

      if (departmentId) {
        query += `
          AND EXISTS (
            SELECT 1
            FROM ApplicationDepartmentMappings adm
            WHERE adm.ApplicationId = a.ApplicationId
              AND adm.DepartmentId = @departmentId
          )
        `;
        request.input('departmentId', sql.UniqueIdentifier, departmentId);
      }

      if (functionId) {
        query += `
          AND EXISTS (
            SELECT 1
            FROM FunctionApplicationMappings fam
            WHERE fam.ApplicationId = a.ApplicationId
              AND fam.FunctionId = @functionId
          )
        `;
        request.input('functionId', sql.UniqueIdentifier, functionId);
      }

      if (!departmentId && !functionId) {
        query += `
          AND EXISTS (
            SELECT 1
            FROM ApplicationDepartmentMappings adm
            WHERE adm.ApplicationId = a.ApplicationId
          )
        `;
      }

      query += `
          ORDER BY a.Name
      `;

      const result = await request.query(query);

      return result.recordset.map(app => ({
        applicationId: app.ApplicationId,
        code: app.Code,
        name: app.Name,
        description: app.Description
      }));
    } catch (error) {
      logger.error(`Error getting available applications: ${error.message}`, { error, surveyId, departmentId, functionId });
      throw error;
    }
  }

  /**
   * Validate optional organizational selections (UUID format already checked in controller).
   * If provided partially, missing parts may still be derived from application mappings.
   * @param {Object} respondent - Respondent information
   */
  validateOrganizationalSelections(respondent) {
    return validateOrganizationalSelections(respondent);
  }

  normalizeRespondent(respondent) {
    return normalizeRespondent(respondent);
  }

  /**
   * Resolve organizational hierarchy from selected application mapping.
   * @param {string} applicationId - Application ID
   * @returns {Promise<Object|null>} org hierarchy or null when mapping missing
   */
  async getOrgHierarchyByApplication(applicationId) {
    return getOrgHierarchyByApplication(this.createRequest.bind(this), sql, applicationId);
  }

  /**
   * Fill missing respondent org fields from application mapping.
   * @param {Object} respondent - Respondent object
   * @param {string} applicationId - Application ID
   * @returns {Promise<Object>} resolved org values
   */
  async resolveRespondentOrg(respondent, applicationId) {
    return resolveRespondentOrg(this.createRequest.bind(this), sql, respondent, applicationId);
  }

  /**
   * Validate application selections
   * @param {Array} selectedApplicationIds - Selected application IDs
   * @throws {ValidationError} If validation fails
   */
  validateApplicationSelections(selectedApplicationIds) {
    return validateApplicationSelections(ValidationError, selectedApplicationIds);
  }

  /**
   * Validate mandatory questions
   * @param {Array} questions - Survey questions
   * @param {Array} responses - Question responses
   * @throws {ValidationError} If validation fails
   */
  validateMandatoryQuestions(questions, responses) {
    return validateMandatoryQuestions(ValidationError, questions, responses);
  }

  checkResponseHasValue(type, value) {
    return checkResponseHasValue(type, value);
  }

  extractNumericResponseValue(value) {
    return extractNumericResponseValue(value);
  }

  /**
   * Check if response has a value based on question type
   * @param {string} type - Question type
   * @param {Object} value - Response value
   * @returns {boolean} True if response has value
   */
  /**
   * Submit survey response
   * @param {Object} request - Response submission request
   * @returns {Promise<Object>} Submission result
   */
  async submitResponse(request) {
    const dbPool = this.pool && typeof this.pool.getPool === 'function'
      ? await this.pool.getPool()
      : this.pool;
    const transaction = new sql.Transaction(dbPool);
    
    try {
      logger.info(`Submitting response for surveyId: ${request.surveyId}`);

      // Validate required fields
      if (!request.surveyId) {
        throw new ValidationError('Survey ID is required');
      }
      const resolvedSurveyId = await resolveSurveyIdentifier(this.pool, sql, NotFoundError, request.surveyId);
      if (!request.respondent) {
        throw new ValidationError('Respondent information is required');
      }
      if (!request.selectedApplicationIds || request.selectedApplicationIds.length === 0) {
        throw new ValidationError('At least one application must be selected');
      }
      if (!request.responses || request.responses.length === 0) {
        throw new ValidationError('Survey responses are required');
      }

      request.respondent = this.normalizeRespondent(request.respondent);

      // Validate organizational selections
      this.validateOrganizationalSelections(request.respondent);

      // Validate application selections
      this.validateApplicationSelections(request.selectedApplicationIds);

      // Get survey and questions
      const survey = await this.getSurveyForm(resolvedSurveyId);

      // Validate mandatory questions
      this.validateMandatoryQuestions(survey.questions, request.responses);

      // Check for duplicates if enabled
      if (survey.duplicatePreventionEnabled && request.respondent.email) {
        for (const applicationId of request.selectedApplicationIds) {
          const isDuplicate = await this.checkDuplicateResponse(
            request.surveyId,
            request.respondent.email,
            applicationId
          );
          
          if (isDuplicate) {
            const app = await this.getApplicationById(applicationId);
            throw new DuplicateError(`You have already submitted a response for application: ${app.name}`);
          }
        }
      }

      // Get IP address from request (if available)
      const ipAddress = request.ipAddress || null;

      await transaction.begin();
      const hasQuestionResponseApplicationId = await this.hasQuestionResponseApplicationIdColumn();
      const hasResponseApprovalStatus = await this.hasResponseApprovalStatusColumn();
      const publishCycle = await publishCycleService.ensureCurrentCycle(transaction, resolvedSurveyId);

      // Create responses for each selected application
      const responseIds = [];
      
      for (const applicationId of request.selectedApplicationIds) {
        const resolvedOrg = await this.resolveRespondentOrg(request.respondent, applicationId);

        // Insert main response record
        const responseInsertRequest = transaction.request()
          .input('responseId', sql.UniqueIdentifier, randomUUID())
          .input('surveyId', sql.UniqueIdentifier, resolvedSurveyId)
          .input('respondentName', sql.NVarChar(200), request.respondent.name)
          .input('respondentEmail', sql.NVarChar(200), request.respondent.email)
          .input('businessUnitId', sql.UniqueIdentifier, resolvedOrg.businessUnitId)
          .input('divisionId', sql.UniqueIdentifier, resolvedOrg.divisionId)
          .input('departmentId', sql.UniqueIdentifier, resolvedOrg.departmentId)
          .input('applicationId', sql.UniqueIdentifier, applicationId)
          .input('submittedAt', sql.DateTime, new Date())
          .input('ipAddress', sql.NVarChar(50), ipAddress);

        let responseResult;
        if (publishCycle?.PublishCycleId && hasResponseApprovalStatus) {
          responseResult = await responseInsertRequest
            .input('publishCycleId', sql.UniqueIdentifier, publishCycle.PublishCycleId)
            .input('responseApprovalStatus', sql.NVarChar(50), 'Submitted')
            .query(`
              INSERT INTO Responses (
                ResponseId, SurveyId, PublishCycleId, RespondentName, RespondentEmail,
                BusinessUnitId, DivisionId, DepartmentId, ApplicationId,
                SubmittedAt, IpAddress, ResponseApprovalStatus
              )
              OUTPUT INSERTED.ResponseId
              VALUES (
                @responseId, @surveyId, @publishCycleId, @respondentName, @respondentEmail,
                @businessUnitId, @divisionId, @departmentId, @applicationId,
                @submittedAt, @ipAddress, @responseApprovalStatus
              )
            `);
        } else if (publishCycle?.PublishCycleId) {
          responseResult = await responseInsertRequest
            .input('publishCycleId', sql.UniqueIdentifier, publishCycle.PublishCycleId)
            .query(`
              INSERT INTO Responses (
                ResponseId, SurveyId, PublishCycleId, RespondentName, RespondentEmail,
                BusinessUnitId, DivisionId, DepartmentId, ApplicationId,
                SubmittedAt, IpAddress
              )
              OUTPUT INSERTED.ResponseId
              VALUES (
                @responseId, @surveyId, @publishCycleId, @respondentName, @respondentEmail,
                @businessUnitId, @divisionId, @departmentId, @applicationId,
                @submittedAt, @ipAddress
              )
            `);
        } else if (hasResponseApprovalStatus) {
          responseResult = await responseInsertRequest
            .input('responseApprovalStatus', sql.NVarChar(50), 'Submitted')
            .query(`
              INSERT INTO Responses (
                ResponseId, SurveyId, RespondentName, RespondentEmail,
                BusinessUnitId, DivisionId, DepartmentId, ApplicationId,
                SubmittedAt, IpAddress, ResponseApprovalStatus
              )
              OUTPUT INSERTED.ResponseId
              VALUES (
                @responseId, @surveyId, @respondentName, @respondentEmail,
                @businessUnitId, @divisionId, @departmentId, @applicationId,
                @submittedAt, @ipAddress, @responseApprovalStatus
              )
            `);
        } else {
          responseResult = await responseInsertRequest.query(`
            INSERT INTO Responses (
              ResponseId, SurveyId, RespondentName, RespondentEmail,
              BusinessUnitId, DivisionId, DepartmentId, ApplicationId,
              SubmittedAt, IpAddress
            )
            OUTPUT INSERTED.ResponseId
            VALUES (
              @responseId, @surveyId, @respondentName, @respondentEmail,
              @businessUnitId, @divisionId, @departmentId, @applicationId,
              @submittedAt, @ipAddress
            )
          `);
        }

        const responseId = responseResult.recordset[0].ResponseId;
        responseIds.push(responseId);

        // Insert question responses
        for (const response of request.responses) {
          const value = response.value;

          const questionResponseRequest = transaction.request()
            .input('questionResponseId', sql.UniqueIdentifier, randomUUID())
            .input('responseId', sql.UniqueIdentifier, responseId)
            .input('questionId', sql.UniqueIdentifier, response.questionId)
            .input('textValue', sql.NVarChar(sql.MAX), value.textValue || null)
            .input('numericValue', sql.Decimal(10, 2), value.numericValue || null)
            .input('dateValue', sql.DateTime, value.dateValue || null)
            .input('matrixValues', sql.NVarChar(sql.MAX), value.matrixValues ? JSON.stringify(value.matrixValues) : null)
            .input('commentValue', sql.NVarChar(sql.MAX), value.commentValue || null)
            .input('takeoutStatus', sql.NVarChar(50), 'Active');

          if (hasQuestionResponseApplicationId) {
            await questionResponseRequest
              .input('applicationId', sql.UniqueIdentifier, applicationId)
              .query(`
                INSERT INTO QuestionResponses (
                  QuestionResponseId, ResponseId, QuestionId, ApplicationId,
                  TextValue, NumericValue, DateValue, MatrixValues, CommentValue,
                  TakeoutStatus
                )
                VALUES (
                  @questionResponseId, @responseId, @questionId, @applicationId,
                  @textValue, @numericValue, @dateValue, @matrixValues, @commentValue,
                  @takeoutStatus
                )
              `);
          } else {
            await questionResponseRequest.query(`
              INSERT INTO QuestionResponses (
                QuestionResponseId, ResponseId, QuestionId,
                TextValue, NumericValue, DateValue, MatrixValues, CommentValue,
                TakeoutStatus
              )
              VALUES (
                @questionResponseId, @responseId, @questionId,
                @textValue, @numericValue, @dateValue, @matrixValues, @commentValue,
                @takeoutStatus
              )
            `);
          }
        }
      }

      await transaction.commit();

      logger.info(`Response submitted successfully for surveyId: ${resolvedSurveyId}, responseIds: ${responseIds.join(', ')}`);

      return {
        success: true,
        message: 'Survey response submitted successfully',
        responseIds: responseIds
      };
    } catch (error) {
      if (transaction._aborted === false) {
        await transaction.rollback();
      }
      logger.error(`Error submitting response: ${error.message}`, { error, request });
      throw error;
    }
  }

  /**
   * Get application by ID (helper method)
   * @param {string} applicationId - Application ID
   * @returns {Promise<Object>} Application details
   */
  async getApplicationById(applicationId) {
    try {
      const result = await (await this.createRequest())
        .input('applicationId', sql.UniqueIdentifier, applicationId)
        .query(`
          SELECT ApplicationId, Code, Name, Description
          FROM Applications
          WHERE ApplicationId = @applicationId
        `);

      if (result.recordset.length === 0) {
        throw new NotFoundError(`Application with ID ${applicationId} not found`);
      }

      return {
        applicationId: result.recordset[0].ApplicationId,
        code: result.recordset[0].Code,
        name: result.recordset[0].Name,
        description: result.recordset[0].Description
      };
    } catch (error) {
      logger.error(`Error getting application: ${error.message}`, { error, applicationId });
      throw error;
    }
  }

  /**
   * Check for duplicate response
   * @param {string} surveyId - Survey ID
   * @param {string} email - Respondent email
   * @param {string} applicationId - Application ID
   * @returns {Promise<boolean>} True if duplicate exists
   */
  async checkDuplicateResponse(surveyId, email, applicationId) {
    try {
      if (!String(surveyId || '').trim()) {
        throw new ValidationError('Survey ID is required');
      }
      if (!email) {
        throw new ValidationError('Email is required');
      }
      if (!applicationId) {
        throw new ValidationError('Application ID is required');
      }
      const resolvedSurveyId = await resolveSurveyIdentifier(this.pool, sql, NotFoundError, surveyId);
      logger.info(`Checking duplicate response for surveyId: ${surveyId}, email: ${email}, applicationId: ${applicationId}`);

      const dbPool = this.pool && typeof this.pool.getPool === 'function'
        ? await this.pool.getPool()
        : this.pool;
      const publishCycle = await publishCycleService.ensureCurrentCycle(dbPool, resolvedSurveyId);
      const request = await this.createRequest();
      request
        .input('surveyId', sql.UniqueIdentifier, resolvedSurveyId)
        .input('email', sql.NVarChar(200), email.toLowerCase().trim())
        .input('applicationId', sql.UniqueIdentifier, applicationId);

      let query = `
          SELECT COUNT(*) as Count
          FROM Responses
          WHERE SurveyId = @surveyId
            AND LOWER(LTRIM(RTRIM(RespondentEmail))) = @email
            AND ApplicationId = @applicationId
        `;
      if (publishCycle?.PublishCycleId) {
        query += ' AND PublishCycleId = @publishCycleId';
        request.input('publishCycleId', sql.UniqueIdentifier, publishCycle.PublishCycleId);
      }

      const result = await request.query(query);

      const isDuplicate = result.recordset[0].Count > 0;

      logger.info(`Duplicate check result: ${isDuplicate}`);

      return isDuplicate;
    } catch (error) {
      logger.error(`Error checking duplicate response: ${error.message}`, { error, surveyId, email, applicationId });
      throw error;
    }
  }

  /**
   * Get responses with filtering
   * @param {Object} filter - Filter criteria
   * @returns {Promise<Array>} List of responses
   */
  async getResponses(filter = {}) {
    try {
      return await getResponses(this.createRequest.bind(this), sql, logger, filter);
    } catch (error) {
      logger.error(`Error getting responses: ${error.message}`, { error, filter });
      throw error;
    }
  }

  /**
   * Get response by ID with question responses
   * @param {string} responseId - Response ID
   * @returns {Promise<Object>} Response details with question responses
   */
  async getResponseById(responseId) {
    try {
      return await getResponseById(
        this.createRequest.bind(this),
        sql,
        { NotFoundError, ValidationError },
        logger,
        this.hasQuestionResponseApplicationIdColumn.bind(this),
        responseId,
      );
    } catch (error) {
      logger.error(`Error getting response by ID: ${error.message}`, { error, responseId });
      throw error;
    }
  }

  /**
   * Get response statistics for a survey
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Object>} Response statistics
   */
  async getResponseStatistics(surveyId) {
    try {
      if (!String(surveyId || '').trim()) {
        throw new ValidationError('Survey ID is required');
      }
      const resolvedSurveyId = await resolveSurveyIdentifier(this.pool, sql, NotFoundError, surveyId);
      return await getResponseStatistics(
        this.createRequest.bind(this),
        sql,
        { ValidationError },
        logger,
        this.hasQuestionResponseTakeoutStatusColumn.bind(this),
        resolvedSurveyId,
      );
    } catch (error) {
      logger.error(`Error getting response statistics: ${error.message}`, { error, surveyId });
      throw error;
    }
  }
}

module.exports = new ResponseService();

