const sql = require('mssql');
const { randomUUID } = require('crypto');
const pool = require('../database/connection');
const logger = require('../config/logger');

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class DuplicateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DuplicateError';
  }
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

  /**
   * Get survey form with configuration and questions
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Object>} Survey form data
   */
  async getSurveyForm(surveyId) {
    try {
      logger.info(`Getting survey form for surveyId: ${surveyId}`);

      // Get survey details
      const surveyResult = await (await this.createRequest())
        .input('surveyId', sql.UniqueIdentifier, surveyId)
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
            sc.HeroImageUrl,
            sc.LogoUrl,
            sc.BackgroundImageUrl,
            sc.BackgroundColor,
            sc.FontFamily,
            sc.ShowProgressBar,
            sc.ShowPageNumbers,
            sc.MultiPage
          FROM Surveys s
          LEFT JOIN SurveyConfiguration sc ON s.SurveyId = sc.SurveyId
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
      if (now < new Date(survey.StartDate) || now > new Date(survey.EndDate)) {
        throw new ValidationError('Survey is not available at this time');
      }

      // Get questions
      const questionsResult = await (await this.createRequest())
        .input('surveyId', sql.UniqueIdentifier, surveyId)
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
          heroImageUrl: survey.HeroImageUrl,
          logoUrl: survey.LogoUrl,
          backgroundImageUrl: survey.BackgroundImageUrl,
          backgroundColor: survey.BackgroundColor,
          fontFamily: survey.FontFamily,
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
      logger.info(`Getting available applications for surveyId: ${surveyId}, departmentId: ${departmentId}, functionId: ${functionId}`);

      if (!surveyId) {
        throw new ValidationError('Survey ID is required');
      }

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
    if (!respondent) {
      throw new ValidationError('Respondent information is required');
    }
  }

  /**
   * Resolve organizational hierarchy from selected application mapping.
   * @param {string} applicationId - Application ID
   * @returns {Promise<Object|null>} org hierarchy or null when mapping missing
   */
  async getOrgHierarchyByApplication(applicationId) {
    const result = await (await this.createRequest())
      .input('applicationId', sql.UniqueIdentifier, applicationId)
      .query(`
        SELECT TOP 1
          bu.BusinessUnitId,
          div.DivisionId,
          dept.DepartmentId
        FROM ApplicationDepartmentMappings adm
        INNER JOIN Departments dept ON adm.DepartmentId = dept.DepartmentId
        INNER JOIN Divisions div ON dept.DivisionId = div.DivisionId
        INNER JOIN BusinessUnits bu ON div.BusinessUnitId = bu.BusinessUnitId
        WHERE adm.ApplicationId = @applicationId
          AND bu.IsActive = 1
          AND div.IsActive = 1
          AND dept.IsActive = 1
      `);

    if (result.recordset.length === 0) {
      return null;
    }

    return {
      businessUnitId: result.recordset[0].BusinessUnitId,
      divisionId: result.recordset[0].DivisionId,
      departmentId: result.recordset[0].DepartmentId
    };
  }

  /**
   * Fill missing respondent org fields from application mapping.
   * @param {Object} respondent - Respondent object
   * @param {string} applicationId - Application ID
   * @returns {Promise<Object>} resolved org values
   */
  async resolveRespondentOrg(respondent, applicationId) {
    const resolved = {
      businessUnitId: respondent.businessUnitId || null,
      divisionId: respondent.divisionId || null,
      departmentId: respondent.departmentId || null
    };

    if (resolved.businessUnitId && resolved.divisionId && resolved.departmentId) {
      return resolved;
    }

    const mappedOrg = await this.getOrgHierarchyByApplication(applicationId);
    if (!mappedOrg) {
      throw new ValidationError(`Application mapping is incomplete for applicationId: ${applicationId}`);
    }

    return {
      businessUnitId: resolved.businessUnitId || mappedOrg.businessUnitId,
      divisionId: resolved.divisionId || mappedOrg.divisionId,
      departmentId: resolved.departmentId || mappedOrg.departmentId
    };
  }

  /**
   * Validate application selections
   * @param {Array} selectedApplicationIds - Selected application IDs
   * @throws {ValidationError} If validation fails
   */
  validateApplicationSelections(selectedApplicationIds) {
    if (!selectedApplicationIds || selectedApplicationIds.length === 0) {
      throw new ValidationError('At least one application must be selected');
    }
  }

  /**
   * Validate mandatory questions
   * @param {Array} questions - Survey questions
   * @param {Array} responses - Question responses
   * @throws {ValidationError} If validation fails
   */
  validateMandatoryQuestions(questions, responses) {
    const normalizeQuestionRef = (value) => {
      const raw = String(value || '').trim();
      if (raw.toLowerCase().startsWith('q-')) {
        return raw.slice(2);
      }
      return raw;
    };

    const responseMap = new Map(
      responses.map((response) => [normalizeQuestionRef(response.questionId), response]),
    );

    const conditionallyMandatoryQuestionIds = new Set();
    const isSourceMappedApplication = (options) => {
      const dataSource = String(options?.dataSource || '').toLowerCase();
      return dataSource === 'app_department' || dataSource === 'app_function';
    };

    const mappedSelectorQuestion = questions.find((question) => {
      const options = typeof question.options === 'string'
        ? JSON.parse(question.options)
        : question.options;
      return isSourceMappedApplication(options);
    });
    const mappedSelectorResponse = mappedSelectorQuestion
      ? responseMap.get(normalizeQuestionRef(mappedSelectorQuestion.questionId))
      : null;
    const hasMappedSelection = mappedSelectorQuestion
      ? this.checkResponseHasValue(mappedSelectorQuestion.type, mappedSelectorResponse?.value || null)
      : false;

    const shouldSkipByVisibility = (question, options) => {
      const displayCondition = String(options?.displayCondition || 'always');
      return displayCondition === 'after_mapped_selection' && !hasMappedSelection;
    };

    for (const question of questions) {
      const options = typeof question.options === 'string'
        ? JSON.parse(question.options)
        : question.options;
      if (shouldSkipByVisibility(question, options)) {
        continue;
      }

      const conditional = options && options.conditionalRequired;
      if (!conditional || !conditional.sourceElementId) {
        continue;
      }

      const sourceQuestionId = normalizeQuestionRef(conditional.sourceElementId);
      if (!sourceQuestionId) {
        continue;
      }

      const sourceResponse = responseMap.get(sourceQuestionId);
      const sourceNumericValue = this.extractNumericResponseValue(sourceResponse ? sourceResponse.value : null);
      if (sourceNumericValue === null) {
        continue;
      }

      const rawThreshold = Number(conditional.threshold);
      const threshold = Number.isFinite(rawThreshold)
        ? Math.min(10, Math.max(1, Math.round(rawThreshold)))
        : 7;

      if (sourceNumericValue > 0 && sourceNumericValue < threshold) {
        conditionallyMandatoryQuestionIds.add(normalizeQuestionRef(question.questionId));
      }
    }

    const mandatoryQuestions = questions.filter((question) => {
      const options = typeof question.options === 'string'
        ? JSON.parse(question.options)
        : question.options;
      if (shouldSkipByVisibility(question, options)) {
        return false;
      }
      return question.isMandatory || conditionallyMandatoryQuestionIds.has(normalizeQuestionRef(question.questionId));
    });
    
    for (const question of mandatoryQuestions) {
      const response = responseMap.get(normalizeQuestionRef(question.questionId));
      
      if (!response) {
        throw new ValidationError(`Question "${question.promptText}" is mandatory and must be answered`);
      }

      // Check if response has a value based on question type
      const hasValue = this.checkResponseHasValue(question.type, response.value);
      
      if (!hasValue) {
        throw new ValidationError(`Question "${question.promptText}" is mandatory and must be answered`);
      }

      // Check comment requirement for rating questions
      if (question.type === 'Rating' && question.options) {
        const options = typeof question.options === 'string' ? JSON.parse(question.options) : question.options;
        if (options.commentRequiredBelowRating && response.value.numericValue < options.commentRequiredBelowRating) {
          if (!response.value.commentValue || response.value.commentValue.trim() === '') {
            throw new ValidationError(`A comment is required for ratings below ${options.commentRequiredBelowRating} for question "${question.promptText}"`);
          }
        }
      }
    }
  }

  /**
   * Check if response has a value based on question type
   * @param {string} type - Question type
   * @param {Object} value - Response value
   * @returns {boolean} True if response has value
   */
  checkResponseHasValue(type, value) {
    if (!value) return false;

    switch (type) {
      case 'Text':
        return value.textValue && value.textValue.trim() !== '';
      case 'Dropdown':
      case 'MultipleChoice':
      case 'Checkbox':
        return value.textValue && value.textValue.trim() !== '';
      case 'Rating':
        return value.numericValue !== null && value.numericValue !== undefined;
      case 'Date':
        return value.dateValue !== null && value.dateValue !== undefined;
      case 'MatrixLikert':
        return value.matrixValues && Object.keys(value.matrixValues).length > 0;
      case 'Signature':
        return value.textValue && value.textValue.trim() !== '';
      default:
        return false;
    }
  }

  /**
   * Extract numeric response value from generic response object.
   * @param {Object|null} value - Response value payload
   * @returns {number|null} numeric value when available
   */
  extractNumericResponseValue(value) {
    if (!value || typeof value !== 'object') return null;

    const numericValue = Number(value.numericValue);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const textValue = Number(String(value.textValue || '').trim());
    if (Number.isFinite(textValue)) {
      return textValue;
    }

    if (value.matrixValues && typeof value.matrixValues === 'object') {
      const scores = Object.values(value.matrixValues)
        .map((item) => Number(String(item || '').trim()))
        .filter((item) => Number.isFinite(item) && item > 0);

      if (scores.length > 0) {
        return scores.reduce((sum, item) => sum + item, 0) / scores.length;
      }
    }

    return null;
  }

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
      if (!request.respondent) {
        throw new ValidationError('Respondent information is required');
      }
      if (!request.selectedApplicationIds || request.selectedApplicationIds.length === 0) {
        throw new ValidationError('At least one application must be selected');
      }
      if (!request.responses || request.responses.length === 0) {
        throw new ValidationError('Survey responses are required');
      }

      // Validate organizational selections
      this.validateOrganizationalSelections(request.respondent);

      // Validate application selections
      this.validateApplicationSelections(request.selectedApplicationIds);

      // Get survey and questions
      const survey = await this.getSurveyForm(request.surveyId);

      // Validate mandatory questions
      this.validateMandatoryQuestions(survey.questions, request.responses);

      // Check for duplicates if enabled
      if (survey.duplicatePreventionEnabled) {
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

      // Create responses for each selected application
      const responseIds = [];
      
      for (const applicationId of request.selectedApplicationIds) {
        const resolvedOrg = await this.resolveRespondentOrg(request.respondent, applicationId);

        // Insert main response record
        const responseResult = await transaction.request()
          .input('responseId', sql.UniqueIdentifier, randomUUID())
          .input('surveyId', sql.UniqueIdentifier, request.surveyId)
          .input('respondentName', sql.NVarChar(200), request.respondent.name)
          .input('respondentEmail', sql.NVarChar(200), request.respondent.email)
          .input('businessUnitId', sql.UniqueIdentifier, resolvedOrg.businessUnitId)
          .input('divisionId', sql.UniqueIdentifier, resolvedOrg.divisionId)
          .input('departmentId', sql.UniqueIdentifier, resolvedOrg.departmentId)
          .input('applicationId', sql.UniqueIdentifier, applicationId)
          .input('submittedAt', sql.DateTime, new Date())
          .input('ipAddress', sql.NVarChar(50), ipAddress)
          .query(`
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

      logger.info(`Response submitted successfully for surveyId: ${request.surveyId}, responseIds: ${responseIds.join(', ')}`);

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
      logger.info(`Checking duplicate response for surveyId: ${surveyId}, email: ${email}, applicationId: ${applicationId}`);

      if (!surveyId) {
        throw new ValidationError('Survey ID is required');
      }
      if (!email) {
        throw new ValidationError('Email is required');
      }
      if (!applicationId) {
        throw new ValidationError('Application ID is required');
      }

      const result = await (await this.createRequest())
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .input('email', sql.NVarChar(200), email.toLowerCase().trim())
        .input('applicationId', sql.UniqueIdentifier, applicationId)
        .query(`
          SELECT COUNT(*) as Count
          FROM Responses
          WHERE SurveyId = @surveyId
            AND LOWER(LTRIM(RTRIM(RespondentEmail))) = @email
            AND ApplicationId = @applicationId
        `);

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
      logger.info('Getting responses with filter', { filter });

      let query = `
        SELECT 
          r.ResponseId,
          r.SurveyId,
          r.RespondentName,
          r.RespondentEmail,
          r.BusinessUnitId,
          r.DivisionId,
          r.DepartmentId,
          r.ApplicationId,
          r.SubmittedAt,
          r.IpAddress,
          s.Title as SurveyTitle,
          bu.Name as BusinessUnitName,
          d.Name as DivisionName,
          dept.Name as DepartmentName,
          a.Name as ApplicationName,
          a.Code as ApplicationCode
        FROM Responses r
        INNER JOIN Surveys s ON r.SurveyId = s.SurveyId
        LEFT JOIN BusinessUnits bu ON r.BusinessUnitId = bu.BusinessUnitId
        LEFT JOIN Divisions d ON r.DivisionId = d.DivisionId
        LEFT JOIN Departments dept ON r.DepartmentId = dept.DepartmentId
        LEFT JOIN Applications a ON r.ApplicationId = a.ApplicationId
        WHERE 1=1
      `;

      const request = await this.createRequest();

      // Apply filters
      if (filter.surveyId) {
        query += ' AND r.SurveyId = @surveyId';
        request.input('surveyId', sql.UniqueIdentifier, filter.surveyId);
      }

      if (filter.departmentId) {
        query += ' AND r.DepartmentId = @departmentId';
        request.input('departmentId', sql.UniqueIdentifier, filter.departmentId);
      }

      if (filter.applicationId) {
        query += ' AND r.ApplicationId = @applicationId';
        request.input('applicationId', sql.UniqueIdentifier, filter.applicationId);
      }

      if (filter.businessUnitId) {
        query += ' AND r.BusinessUnitId = @businessUnitId';
        request.input('businessUnitId', sql.UniqueIdentifier, filter.businessUnitId);
      }

      if (filter.divisionId) {
        query += ' AND r.DivisionId = @divisionId';
        request.input('divisionId', sql.UniqueIdentifier, filter.divisionId);
      }

      if (filter.email) {
        query += ' AND LOWER(r.RespondentEmail) LIKE @email';
        request.input('email', sql.NVarChar(200), `%${filter.email.toLowerCase()}%`);
      }

      if (filter.startDate) {
        query += ' AND r.SubmittedAt >= @startDate';
        request.input('startDate', sql.DateTime, filter.startDate);
      }

      if (filter.endDate) {
        query += ' AND r.SubmittedAt <= @endDate';
        request.input('endDate', sql.DateTime, filter.endDate);
      }

      query += ' ORDER BY r.SubmittedAt DESC';

      const result = await request.query(query);

      return result.recordset.map(r => ({
        responseId: r.ResponseId,
        surveyId: r.SurveyId,
        surveyTitle: r.SurveyTitle,
        respondentName: r.RespondentName,
        respondentEmail: r.RespondentEmail,
        businessUnitId: r.BusinessUnitId,
        businessUnitName: r.BusinessUnitName,
        divisionId: r.DivisionId,
        divisionName: r.DivisionName,
        departmentId: r.DepartmentId,
        departmentName: r.DepartmentName,
        applicationId: r.ApplicationId,
        applicationName: r.ApplicationName,
        applicationCode: r.ApplicationCode,
        submittedAt: r.SubmittedAt,
        ipAddress: r.IpAddress
      }));
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
      logger.info(`Getting response by ID: ${responseId}`);

      if (!responseId) {
        throw new ValidationError('Response ID is required');
      }

      // Get main response
      const responseResult = await (await this.createRequest())
        .input('responseId', sql.UniqueIdentifier, responseId)
        .query(`
          SELECT 
            r.ResponseId,
            r.SurveyId,
            r.RespondentName,
            r.RespondentEmail,
            r.BusinessUnitId,
            r.DivisionId,
            r.DepartmentId,
            r.ApplicationId,
            r.SubmittedAt,
            r.IpAddress,
            s.Title as SurveyTitle,
            bu.Name as BusinessUnitName,
            d.Name as DivisionName,
            dept.Name as DepartmentName,
            a.Name as ApplicationName,
            a.Code as ApplicationCode
          FROM Responses r
          INNER JOIN Surveys s ON r.SurveyId = s.SurveyId
          LEFT JOIN BusinessUnits bu ON r.BusinessUnitId = bu.BusinessUnitId
          LEFT JOIN Divisions d ON r.DivisionId = d.DivisionId
          LEFT JOIN Departments dept ON r.DepartmentId = dept.DepartmentId
          LEFT JOIN Applications a ON r.ApplicationId = a.ApplicationId
          WHERE r.ResponseId = @responseId
        `);

      if (responseResult.recordset.length === 0) {
        throw new NotFoundError(`Response with ID ${responseId} not found`);
      }

      const response = responseResult.recordset[0];

      // Get question responses
      const hasQuestionResponseApplicationId = await this.hasQuestionResponseApplicationIdColumn();
      const questionResponsesResult = await (await this.createRequest())
        .input('responseId', sql.UniqueIdentifier, responseId)
        .query(`
          SELECT 
            qr.QuestionResponseId,
            qr.ResponseId,
            qr.QuestionId,
            ${hasQuestionResponseApplicationId ? 'qr.ApplicationId' : 'CAST(NULL AS UNIQUEIDENTIFIER) AS ApplicationId'},
            qr.TextValue,
            qr.NumericValue,
            qr.DateValue,
            qr.MatrixValues,
            qr.CommentValue,
            qr.TakeoutStatus,
            qr.TakeoutReason,
            qr.ProposedBy,
            qr.ProposedAt,
            qr.ApprovedBy,
            qr.ApprovedAt,
            qr.IsBestComment,
            q.Type as QuestionType,
            q.PromptText as QuestionText,
            q.DisplayOrder
          FROM QuestionResponses qr
          INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
          WHERE qr.ResponseId = @responseId
          ORDER BY q.DisplayOrder
        `);

      const questionResponses = questionResponsesResult.recordset.map(qr => ({
        questionResponseId: qr.QuestionResponseId,
        responseId: qr.ResponseId,
        questionId: qr.QuestionId,
        applicationId: qr.ApplicationId,
        questionType: qr.QuestionType,
        questionText: qr.QuestionText,
        displayOrder: qr.DisplayOrder,
        value: {
          textValue: qr.TextValue,
          numericValue: qr.NumericValue,
          dateValue: qr.DateValue,
          matrixValues: qr.MatrixValues ? JSON.parse(qr.MatrixValues) : null,
          commentValue: qr.CommentValue
        },
        takeoutStatus: qr.TakeoutStatus,
        takeoutReason: qr.TakeoutReason,
        proposedBy: qr.ProposedBy,
        proposedAt: qr.ProposedAt,
        approvedBy: qr.ApprovedBy,
        approvedAt: qr.ApprovedAt,
        isBestComment: qr.IsBestComment
      }));

      return {
        responseId: response.ResponseId,
        surveyId: response.SurveyId,
        surveyTitle: response.SurveyTitle,
        respondentName: response.RespondentName,
        respondentEmail: response.RespondentEmail,
        businessUnitId: response.BusinessUnitId,
        businessUnitName: response.BusinessUnitName,
        divisionId: response.DivisionId,
        divisionName: response.DivisionName,
        departmentId: response.DepartmentId,
        departmentName: response.DepartmentName,
        applicationId: response.ApplicationId,
        applicationName: response.ApplicationName,
        applicationCode: response.ApplicationCode,
        submittedAt: response.SubmittedAt,
        ipAddress: response.IpAddress,
        questionResponses: questionResponses
      };
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
      logger.info(`Getting response statistics for surveyId: ${surveyId}`);

      if (!surveyId) {
        throw new ValidationError('Survey ID is required');
      }

      // Get total response count
      const totalResult = await (await this.createRequest())
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT COUNT(DISTINCT ResponseId) as TotalResponses
          FROM Responses
          WHERE SurveyId = @surveyId
        `);

      // Get response count by department
      const byDepartmentResult = await (await this.createRequest())
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT 
            dept.DepartmentId,
            dept.Name as DepartmentName,
            COUNT(DISTINCT r.ResponseId) as ResponseCount
          FROM Responses r
          INNER JOIN Departments dept ON r.DepartmentId = dept.DepartmentId
          WHERE r.SurveyId = @surveyId
          GROUP BY dept.DepartmentId, dept.Name
          ORDER BY dept.Name
        `);

      // Get response count by application
      const byApplicationResult = await (await this.createRequest())
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT 
            a.ApplicationId,
            a.Name as ApplicationName,
            a.Code as ApplicationCode,
            COUNT(DISTINCT r.ResponseId) as ResponseCount
          FROM Responses r
          INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
          WHERE r.SurveyId = @surveyId
          GROUP BY a.ApplicationId, a.Name, a.Code
          ORDER BY a.Name
        `);

      const hasTakeoutStatus = await this.hasQuestionResponseTakeoutStatusColumn();
      // Get average ratings by question
      const avgRatingsResult = await (await this.createRequest())
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT 
            q.QuestionId,
            q.PromptText,
            AVG(CAST(qr.NumericValue as FLOAT)) as AverageRating,
            COUNT(*) as ResponseCount
          FROM QuestionResponses qr
          INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
          INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
          WHERE r.SurveyId = @surveyId
            AND q.Type IN ('Rating', 'MatrixLikert')
            AND qr.NumericValue IS NOT NULL
            ${hasTakeoutStatus ? "AND qr.TakeoutStatus = 'Active'" : ''}
          GROUP BY q.QuestionId, q.PromptText
          ORDER BY q.DisplayOrder
        `);

      // Get takeout statistics
      const takeoutResult = hasTakeoutStatus
        ? await (await this.createRequest())
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .query(`
            SELECT 
              COUNT(CASE WHEN TakeoutStatus = 'Active' THEN 1 END) as ActiveCount,
              COUNT(CASE WHEN TakeoutStatus = 'ProposedTakeout' THEN 1 END) as ProposedCount,
              COUNT(CASE WHEN TakeoutStatus = 'TakenOut' THEN 1 END) as TakenOutCount
            FROM QuestionResponses qr
            INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
            WHERE r.SurveyId = @surveyId
          `)
        : { recordset: [{ ActiveCount: 0, ProposedCount: 0, TakenOutCount: 0 }] };

      return {
        totalResponses: totalResult.recordset[0].TotalResponses,
        byDepartment: byDepartmentResult.recordset.map(d => ({
          departmentId: d.DepartmentId,
          departmentName: d.DepartmentName,
          responseCount: d.ResponseCount
        })),
        byApplication: byApplicationResult.recordset.map(a => ({
          applicationId: a.ApplicationId,
          applicationName: a.ApplicationName,
          applicationCode: a.ApplicationCode,
          responseCount: a.ResponseCount
        })),
        averageRatings: avgRatingsResult.recordset.map(r => ({
          questionId: r.QuestionId,
          questionText: r.PromptText,
          averageRating: r.AverageRating,
          responseCount: r.ResponseCount
        })),
        takeoutStatistics: {
          active: takeoutResult.recordset[0].ActiveCount,
          proposed: takeoutResult.recordset[0].ProposedCount,
          takenOut: takeoutResult.recordset[0].TakenOutCount
        }
      };
    } catch (error) {
      logger.error(`Error getting response statistics: ${error.message}`, { error, surveyId });
      throw error;
    }
  }
}

module.exports = new ResponseService();
