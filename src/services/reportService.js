const sql = require('mssql');
const pool = require('../database/connection');
const logger = require('../config/logger');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

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

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Report Service
 * Handles report generation, filtering, and export capabilities
 */
class ReportService {
  constructor() {
    this.pool = pool;
  }

  /**
   * Generate report with filtering
   * @param {Object} request - Report request parameters
   * @param {string} request.surveyId - Survey ID
   * @param {string} request.businessUnitId - Optional BU filter
   * @param {string} request.divisionId - Optional Division filter
   * @param {string} request.departmentId - Optional Department filter
   * @param {string} request.functionId - Optional Function filter
   * @param {string} request.applicationId - Optional Application filter
   * @param {boolean} request.includeTakenOut - Include taken out responses
   * @param {string} request.userId - User ID for authorization
   * @param {string} request.userRole - User role for authorization
   * @returns {Promise<Object>} Report data
   */
  async generateReport(request) {
    try {
      logger.info(`Generating report for surveyId: ${request.surveyId}`);

      // Validate survey exists
      const surveyResult = await this.pool.request()
        .input('surveyId', sql.UniqueIdentifier, request.surveyId)
        .query(`
          SELECT SurveyId, Title, Description, StartDate, EndDate, Status
          FROM Surveys
          WHERE SurveyId = @surveyId
        `);

      if (surveyResult.recordset.length === 0) {
        throw new NotFoundError(`Survey with ID ${request.surveyId} not found`);
      }

      const survey = surveyResult.recordset[0];

      // Apply Department Head data isolation
      if (request.userRole === 'DepartmentHead' && request.userId) {
        const userDepartmentId = await this.getUserDepartmentId(request.userId);
        if (!userDepartmentId) {
          throw new UnauthorizedError('Department Head must be assigned to a department');
        }
        // Override department filter with user's department
        request.departmentId = userDepartmentId;
      }

      // Build filter query
      let filterConditions = ['r.SurveyId = @surveyId'];
      const sqlRequest = this.pool.request();
      sqlRequest.input('surveyId', sql.UniqueIdentifier, request.surveyId);

      // Apply hierarchical filters
      if (request.businessUnitId) {
        filterConditions.push('r.BusinessUnitId = @businessUnitId');
        sqlRequest.input('businessUnitId', sql.UniqueIdentifier, request.businessUnitId);
      }

      if (request.divisionId) {
        filterConditions.push('r.DivisionId = @divisionId');
        sqlRequest.input('divisionId', sql.UniqueIdentifier, request.divisionId);
      }

      if (request.departmentId) {
        filterConditions.push('r.DepartmentId = @departmentId');
        sqlRequest.input('departmentId', sql.UniqueIdentifier, request.departmentId);
      }

      if (request.applicationId) {
        filterConditions.push('r.ApplicationId = @applicationId');
        sqlRequest.input('applicationId', sql.UniqueIdentifier, request.applicationId);
      }

      // Apply function filter through application mapping
      if (request.functionId) {
        filterConditions.push(`
          EXISTS (
            SELECT 1 FROM FunctionApplicationMappings fam
            WHERE fam.ApplicationId = r.ApplicationId
            AND fam.FunctionId = @functionId
          )
        `);
        sqlRequest.input('functionId', sql.UniqueIdentifier, request.functionId);
      }

      // Apply takeout filter
      if (!request.includeTakenOut) {
        filterConditions.push('qr.TakeoutStatus != \'TakenOut\'');
      }

      const whereClause = filterConditions.join(' AND ');

      // Get aggregate statistics
      const statsQuery = `
        SELECT 
          COUNT(DISTINCT r.ResponseId) as TotalResponses,
          COUNT(DISTINCT r.RespondentEmail) as UniqueRespondents,
          AVG(CAST(qr.NumericValue as FLOAT)) as AverageRating,
          MIN(qr.NumericValue) as MinRating,
          MAX(qr.NumericValue) as MaxRating,
          COUNT(CASE WHEN qr.TakeoutStatus = 'TakenOut' THEN 1 END) as TakenOutCount,
          COUNT(CASE WHEN qr.TakeoutStatus = 'Active' THEN 1 END) as ActiveCount,
          COUNT(CASE WHEN qr.TakeoutStatus = 'ProposedTakeout' THEN 1 END) as ProposedCount
        FROM Responses r
        INNER JOIN QuestionResponses qr ON r.ResponseId = qr.ResponseId
        WHERE ${whereClause}
        AND qr.NumericValue IS NOT NULL
      `;

      const statsResult = await sqlRequest.query(statsQuery);
      const statistics = statsResult.recordset[0];

      // Get detailed responses
      const detailsQuery = `
        SELECT 
          r.ResponseId,
          r.RespondentEmail,
          r.RespondentName,
          r.SubmittedAt,
          bu.Name as BusinessUnitName,
          d.Name as DivisionName,
          dept.Name as DepartmentName,
          a.Name as ApplicationName,
          q.QuestionId,
          q.PromptText,
          q.Type as QuestionType,
          qr.TextValue,
          qr.NumericValue,
          qr.DateValue,
          qr.MatrixValues,
          qr.CommentValue,
          qr.TakeoutStatus,
          qr.TakeoutReason,
          qr.IsBestComment
        FROM Responses r
        INNER JOIN QuestionResponses qr ON r.ResponseId = qr.ResponseId
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN BusinessUnits bu ON r.BusinessUnitId = bu.BusinessUnitId
        INNER JOIN Divisions d ON r.DivisionId = d.DivisionId
        INNER JOIN Departments dept ON r.DepartmentId = dept.DepartmentId
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        WHERE ${whereClause}
        ORDER BY r.SubmittedAt DESC, q.DisplayOrder
      `;

      const detailsResult = await sqlRequest.query(detailsQuery);

      // Get rating distribution
      const distributionQuery = `
        SELECT 
          qr.NumericValue as Rating,
          COUNT(*) as Count
        FROM Responses r
        INNER JOIN QuestionResponses qr ON r.ResponseId = qr.ResponseId
        WHERE ${whereClause}
        AND qr.NumericValue IS NOT NULL
        GROUP BY qr.NumericValue
        ORDER BY qr.NumericValue
      `;

      const distributionResult = await sqlRequest.query(distributionQuery);

      return {
        survey: {
          surveyId: survey.SurveyId,
          title: survey.Title,
          description: survey.Description,
          startDate: survey.StartDate,
          endDate: survey.EndDate,
          status: survey.Status
        },
        statistics: {
          totalResponses: statistics.TotalResponses || 0,
          uniqueRespondents: statistics.UniqueRespondents || 0,
          averageRating: statistics.AverageRating ? parseFloat(statistics.AverageRating.toFixed(2)) : null,
          minRating: statistics.MinRating || null,
          maxRating: statistics.MaxRating || null,
          takenOutCount: statistics.TakenOutCount || 0,
          activeCount: statistics.ActiveCount || 0,
          proposedCount: statistics.ProposedCount || 0
        },
        responses: detailsResult.recordset,
        ratingDistribution: distributionResult.recordset
      };

    } catch (error) {
      logger.error(`Error generating report: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Generate before takeout report (includes all responses)
   * @param {Object} request - Report request parameters
   * @returns {Promise<Object>} Report data
   */
  async generateBeforeTakeoutReport(request) {
    logger.info(`Generating before takeout report for surveyId: ${request.surveyId}`);
    return await this.generateReport({ ...request, includeTakenOut: true });
  }

  /**
   * Generate after takeout report (excludes taken out responses)
   * @param {Object} request - Report request parameters
   * @returns {Promise<Object>} Report data
   */
  async generateAfterTakeoutReport(request) {
    logger.info(`Generating after takeout report for surveyId: ${request.surveyId}`);
    return await this.generateReport({ ...request, includeTakenOut: false });
  }

  /**
   * Get report selection list (all surveys with metadata)
   * @returns {Promise<Array>} List of surveys with metadata
   */
  async getReportSelectionList() {
    try {
      logger.info('Getting report selection list');

      const query = `
        SELECT 
          s.SurveyId,
          s.Title,
          s.Description,
          s.StartDate,
          s.EndDate,
          s.Status,
          CONCAT(
            FORMAT(s.StartDate, 'dd MMM yyyy'), 
            ' - ', 
            FORMAT(s.EndDate, 'dd MMM yyyy')
          ) as Period,
          COUNT(DISTINCT r.ResponseId) as RespondentCount,
          CASE 
            WHEN COUNT(DISTINCT r.ResponseId) > 0 THEN 1
            ELSE 0
          END as HasGeneratedReport
        FROM Surveys s
        LEFT JOIN Responses r ON s.SurveyId = r.SurveyId
        GROUP BY 
          s.SurveyId, 
          s.Title, 
          s.Description, 
          s.StartDate, 
          s.EndDate, 
          s.Status
        ORDER BY s.StartDate DESC
      `;

      const result = await this.pool.request().query(query);

      return result.recordset.map(survey => ({
        surveyId: survey.SurveyId,
        title: survey.Title,
        description: survey.Description,
        period: survey.Period,
        status: survey.Status,
        respondentCount: survey.RespondentCount || 0,
        hasGeneratedReport: survey.HasGeneratedReport === 1
      }));

    } catch (error) {
      logger.error(`Error getting report selection list: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get takeout comparison table (before/after comparison by question)
   * @param {string} surveyId - Survey ID
   * @param {string} functionId - Optional function filter
   * @returns {Promise<Array>} Comparison data by question
   */
  async getTakeoutComparisonTable(surveyId, functionId = null) {
    try {
      logger.info(`Getting takeout comparison for surveyId: ${surveyId}`);

      const sqlRequest = this.pool.request();
      sqlRequest.input('surveyId', sql.UniqueIdentifier, surveyId);

      let functionFilter = '';
      if (functionId) {
        functionFilter = `
          AND EXISTS (
            SELECT 1 FROM FunctionApplicationMappings fam
            WHERE fam.ApplicationId = r.ApplicationId
            AND fam.FunctionId = @functionId
          )
        `;
        sqlRequest.input('functionId', sql.UniqueIdentifier, functionId);
      }

      const query = `
        SELECT 
          q.QuestionId,
          q.PromptText as QuestionText,
          q.Type as QuestionType,
          COUNT(qr.QuestionResponseId) as TotalResponses,
          COUNT(CASE WHEN qr.TakeoutStatus = 'TakenOut' THEN 1 END) as TakeoutCount,
          AVG(CASE WHEN qr.NumericValue IS NOT NULL THEN CAST(qr.NumericValue as FLOAT) END) as AvgScoreBefore,
          AVG(CASE 
            WHEN qr.NumericValue IS NOT NULL AND qr.TakeoutStatus != 'TakenOut' 
            THEN CAST(qr.NumericValue as FLOAT) 
          END) as AvgScoreAfter,
          STRING_AGG(
            CASE WHEN qr.TakeoutStatus = 'TakenOut' THEN qr.TakeoutReason END, 
            '; '
          ) as TakeoutReasons
        FROM Questions q
        LEFT JOIN QuestionResponses qr ON q.QuestionId = qr.QuestionId
        LEFT JOIN Responses r ON qr.ResponseId = r.ResponseId
        WHERE q.SurveyId = @surveyId
        ${functionFilter}
        GROUP BY q.QuestionId, q.PromptText, q.Type, q.DisplayOrder
        ORDER BY q.DisplayOrder
      `;

      const result = await sqlRequest.query(query);

      return result.recordset.map(row => ({
        questionId: row.QuestionId,
        questionText: row.QuestionText,
        questionType: row.QuestionType,
        totalResponses: row.TotalResponses || 0,
        takeoutCount: row.TakeoutCount || 0,
        avgScoreBefore: row.AvgScoreBefore ? parseFloat(row.AvgScoreBefore.toFixed(2)) : null,
        avgScoreAfter: row.AvgScoreAfter ? parseFloat(row.AvgScoreAfter.toFixed(2)) : null,
        takeoutReasons: row.TakeoutReasons || ''
      }));

    } catch (error) {
      logger.error(`Error getting takeout comparison: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get Department Head review data
   * @param {string} departmentId - Department ID
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Object>} Department Head review data
   */
  async getDepartmentHeadReview(departmentId, surveyId) {
    try {
      logger.info(`Getting Department Head review for departmentId: ${departmentId}, surveyId: ${surveyId}`);

      // Get scores by function
      const scoresByFunction = await this.getScoresByFunction(departmentId, surveyId);

      // Get approved takeouts
      const approvedTakeouts = await this.getApprovedTakeouts(departmentId, surveyId);

      // Get best comments with feedback
      const bestCommentsQuery = `
        SELECT 
          qr.QuestionResponseId,
          q.PromptText as QuestionText,
          qr.CommentValue,
          r.RespondentName,
          r.RespondentEmail,
          a.Name as ApplicationName,
          f.Name as FunctionName,
          s.Title as SurveyTitle,
          u.DisplayName as ITLeadName,
          bcf.FeedbackText,
          bcf.CreatedAt as FeedbackDate
        FROM QuestionResponses qr
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Surveys s ON q.SurveyId = s.SurveyId
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        LEFT JOIN FunctionApplicationMappings fam ON a.ApplicationId = fam.ApplicationId
        LEFT JOIN Functions f ON fam.FunctionId = f.FunctionId
        LEFT JOIN BestCommentFeedback bcf ON qr.QuestionResponseId = bcf.QuestionResponseId
        LEFT JOIN Users u ON bcf.ITLeadUserId = u.UserId
        WHERE qr.IsBestComment = 1
        AND r.DepartmentId = @departmentId
        AND s.SurveyId = @surveyId
        ORDER BY bcf.CreatedAt DESC
      `;

      const bestCommentsResult = await this.pool.request()
        .input('departmentId', sql.UniqueIdentifier, departmentId)
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(bestCommentsQuery);

      return {
        scoresByFunction,
        approvedTakeouts,
        bestComments: bestCommentsResult.recordset.map(row => ({
          questionResponseId: row.QuestionResponseId,
          questionText: row.QuestionText,
          comment: row.CommentValue,
          respondentName: row.RespondentName,
          applicationName: row.ApplicationName,
          functionName: row.FunctionName,
          surveyTitle: row.SurveyTitle,
          itLeadName: row.ITLeadName,
          feedback: row.FeedbackText,
          feedbackDate: row.FeedbackDate
        }))
      };

    } catch (error) {
      logger.error(`Error getting Department Head review: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get scores by function with target comparison
   * @param {string} departmentId - Department ID
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Array>} Scores by function
   */
  async getScoresByFunction(departmentId, surveyId) {
    try {
      logger.info(`Getting scores by function for departmentId: ${departmentId}, surveyId: ${surveyId}`);

      const query = `
        SELECT 
          f.FunctionId,
          f.Name as FunctionName,
          AVG(CAST(qr.NumericValue as FLOAT)) as AverageScore,
          s.TargetScore,
          CASE 
            WHEN AVG(CAST(qr.NumericValue as FLOAT)) >= s.TargetScore THEN 'On Track'
            ELSE 'Below Target'
          END as Status,
          COUNT(DISTINCT r.ResponseId) as ResponseCount
        FROM Responses r
        INNER JOIN QuestionResponses qr ON r.ResponseId = qr.ResponseId
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        INNER JOIN FunctionApplicationMappings fam ON a.ApplicationId = fam.ApplicationId
        INNER JOIN Functions f ON fam.FunctionId = f.FunctionId
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Surveys s ON q.SurveyId = s.SurveyId
        WHERE r.DepartmentId = @departmentId
        AND s.SurveyId = @surveyId
        AND qr.NumericValue IS NOT NULL
        AND qr.TakeoutStatus != 'TakenOut'
        GROUP BY f.FunctionId, f.Name, s.TargetScore
        ORDER BY f.Name
      `;

      const result = await this.pool.request()
        .input('departmentId', sql.UniqueIdentifier, departmentId)
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(query);

      return result.recordset.map(row => ({
        functionId: row.FunctionId,
        functionName: row.FunctionName,
        averageScore: row.AverageScore ? parseFloat(row.AverageScore.toFixed(2)) : 0,
        targetScore: row.TargetScore || 0,
        status: row.Status,
        responseCount: row.ResponseCount || 0
      }));

    } catch (error) {
      logger.error(`Error getting scores by function: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get approved takeouts filtered by department
   * @param {string} departmentId - Department ID
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Array>} Approved takeouts
   */
  async getApprovedTakeouts(departmentId, surveyId) {
    try {
      logger.info(`Getting approved takeouts for departmentId: ${departmentId}, surveyId: ${surveyId}`);

      const query = `
        SELECT 
          qr.QuestionResponseId,
          q.PromptText as QuestionText,
          qr.NumericValue as Score,
          qr.CommentValue,
          qr.TakeoutReason,
          r.RespondentEmail,
          a.Name as ApplicationName,
          f.Name as FunctionName,
          u.DisplayName as ReviewedBy,
          qr.ReviewedAt
        FROM QuestionResponses qr
        INNER JOIN Responses r ON qr.ResponseId = r.ResponseId
        INNER JOIN Questions q ON qr.QuestionId = q.QuestionId
        INNER JOIN Applications a ON r.ApplicationId = a.ApplicationId
        LEFT JOIN FunctionApplicationMappings fam ON a.ApplicationId = fam.ApplicationId
        LEFT JOIN Functions f ON fam.FunctionId = f.FunctionId
        LEFT JOIN Users u ON qr.ReviewedBy = u.UserId
        WHERE qr.TakeoutStatus = 'TakenOut'
        AND r.DepartmentId = @departmentId
        AND q.SurveyId = @surveyId
        ORDER BY qr.ReviewedAt DESC
      `;

      const result = await this.pool.request()
        .input('departmentId', sql.UniqueIdentifier, departmentId)
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(query);

      return result.recordset.map(row => ({
        questionResponseId: row.QuestionResponseId,
        questionText: row.QuestionText,
        score: row.Score,
        comment: row.CommentValue,
        takeoutReason: row.TakeoutReason,
        respondentEmail: row.RespondentEmail,
        applicationName: row.ApplicationName,
        functionName: row.FunctionName,
        reviewedBy: row.ReviewedBy,
        reviewedAt: row.ReviewedAt
      }));

    } catch (error) {
      logger.error(`Error getting approved takeouts: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get user's department ID (for Department Head role)
   * @param {string} userId - User ID
   * @returns {Promise<string|null>} Department ID or null
   */
  async getUserDepartmentId(userId) {
    try {
      const result = await this.pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
          SELECT DepartmentId
          FROM Users
          WHERE UserId = @userId
        `);

      if (result.recordset.length > 0 && result.recordset[0].DepartmentId) {
        return result.recordset[0].DepartmentId;
      }

      return null;
    } catch (error) {
      logger.error(`Error getting user department: ${error.message}`, { error });
      return null;
    }
  }

  /**
   * Validate Department Head access to department data
   * @param {string} userId - User ID
   * @param {string} departmentId - Department ID to access
   * @param {string} userRole - User role
   * @returns {Promise<boolean>} True if authorized
   */
  async validateDepartmentHeadAccess(userId, departmentId, userRole) {
    try {
      if (userRole !== 'DepartmentHead') {
        return true; // Other roles have broader access
      }

      const userDepartmentId = await this.getUserDepartmentId(userId);
      
      if (!userDepartmentId) {
        throw new UnauthorizedError('Department Head must be assigned to a department');
      }

      if (userDepartmentId !== departmentId) {
        throw new UnauthorizedError('Department Head can only access their own department data');
      }

      return true;
    } catch (error) {
      logger.error(`Error validating Department Head access: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Export report to Excel
   * @param {Object} request - Report request parameters
   * @returns {Promise<Buffer>} Excel file buffer
   */
  async exportToExcel(request) {
    try {
      logger.info(`Exporting report to Excel for surveyId: ${request.surveyId}`);

      // Generate report data
      const reportData = await this.generateReport(request);

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'CSI Portal';
      workbook.created = new Date();

      // Sheet 1: Summary
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value', key: 'value', width: 20 }
      ];

      // Add summary data with formula injection prevention
      summarySheet.addRows([
        { metric: 'Survey Title', value: this.sanitizeForExcel(reportData.survey.title) },
        { metric: 'Survey Period', value: `${new Date(reportData.survey.startDate).toLocaleDateString()} - ${new Date(reportData.survey.endDate).toLocaleDateString()}` },
        { metric: 'Total Responses', value: reportData.statistics.totalResponses },
        { metric: 'Unique Respondents', value: reportData.statistics.uniqueRespondents },
        { metric: 'Average Rating', value: reportData.statistics.averageRating || 'N/A' },
        { metric: 'Min Rating', value: reportData.statistics.minRating || 'N/A' },
        { metric: 'Max Rating', value: reportData.statistics.maxRating || 'N/A' },
        { metric: 'Active Responses', value: reportData.statistics.activeCount },
        { metric: 'Taken Out Responses', value: reportData.statistics.takenOutCount },
        { metric: 'Proposed Takeout', value: reportData.statistics.proposedCount }
      ]);

      // Style summary sheet
      summarySheet.getRow(1).font = { bold: true };
      summarySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Sheet 2: Details
      const detailsSheet = workbook.addWorksheet('Details');
      detailsSheet.columns = [
        { header: 'Response ID', key: 'responseId', width: 15 },
        { header: 'Respondent Email', key: 'email', width: 25 },
        { header: 'Respondent Name', key: 'name', width: 25 },
        { header: 'Business Unit', key: 'businessUnit', width: 20 },
        { header: 'Division', key: 'division', width: 20 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Application', key: 'application', width: 20 },
        { header: 'Question', key: 'question', width: 40 },
        { header: 'Question Type', key: 'questionType', width: 15 },
        { header: 'Response Value', key: 'responseValue', width: 30 },
        { header: 'Comment', key: 'comment', width: 40 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Takeout Reason', key: 'takeoutReason', width: 40 },
        { header: 'Submitted At', key: 'submittedAt', width: 20 }
      ];

      // Add detail rows with formula injection prevention
      reportData.responses.forEach(response => {
        let responseValue = '';
        if (response.TextValue) responseValue = this.sanitizeForExcel(response.TextValue);
        else if (response.NumericValue !== null) responseValue = response.NumericValue;
        else if (response.DateValue) responseValue = new Date(response.DateValue).toLocaleDateString();
        else if (response.MatrixValues) responseValue = this.sanitizeForExcel(response.MatrixValues);

        detailsSheet.addRow({
          responseId: response.ResponseId,
          email: this.sanitizeForExcel(response.RespondentEmail),
          name: this.sanitizeForExcel(response.RespondentName),
          businessUnit: this.sanitizeForExcel(response.BusinessUnitName),
          division: this.sanitizeForExcel(response.DivisionName),
          department: this.sanitizeForExcel(response.DepartmentName),
          application: this.sanitizeForExcel(response.ApplicationName),
          question: this.sanitizeForExcel(response.PromptText),
          questionType: response.QuestionType,
          responseValue: responseValue,
          comment: this.sanitizeForExcel(response.CommentValue || ''),
          status: response.TakeoutStatus,
          takeoutReason: this.sanitizeForExcel(response.TakeoutReason || ''),
          submittedAt: new Date(response.SubmittedAt).toLocaleString()
        });
      });

      // Style details sheet
      detailsSheet.getRow(1).font = { bold: true };
      detailsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Sheet 3: Rating Distribution
      if (reportData.ratingDistribution.length > 0) {
        const chartSheet = workbook.addWorksheet('Rating Distribution');
        chartSheet.columns = [
          { header: 'Rating', key: 'rating', width: 15 },
          { header: 'Count', key: 'count', width: 15 }
        ];

        reportData.ratingDistribution.forEach(item => {
          chartSheet.addRow({
            rating: item.Rating,
            count: item.Count
          });
        });

        // Style chart sheet
        chartSheet.getRow(1).font = { bold: true };
        chartSheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
      }

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;

    } catch (error) {
      logger.error(`Error exporting to Excel: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Sanitize cell value to prevent formula injection
   * @param {string} value - Cell value
   * @returns {string} Sanitized value
   */
  sanitizeForExcel(value) {
    if (!value) return '';
    
    const strValue = String(value);
    
    // Check if value starts with formula characters
    if (strValue.match(/^[=+\-@]/)) {
      return `'${strValue}`; // Prefix with single quote to treat as text
    }
    
    return strValue;
  }

  /**
   * Export report to PDF
   * @param {Object} request - Report request parameters
   * @returns {Promise<Buffer>} PDF file buffer
   */
  async exportToPdf(request) {
    try {
      logger.info(`Exporting report to PDF for surveyId: ${request.surveyId}`);

      // Generate report data
      const reportData = await this.generateReport(request);

      return new Promise((resolve, reject) => {
        try {
          // Create PDF document
          const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
          });

          // Collect chunks
          const chunks = [];
          doc.on('data', chunk => chunks.push(chunk));
          doc.on('end', () => resolve(Buffer.concat(chunks)));
          doc.on('error', reject);

          // Header
          doc.fontSize(20).font('Helvetica-Bold').text('CSI Survey Report', { align: 'center' });
          doc.moveDown();

          // Survey Information
          doc.fontSize(14).font('Helvetica-Bold').text('Survey Information');
          doc.moveDown(0.5);
          doc.fontSize(10).font('Helvetica');
          doc.text(`Title: ${reportData.survey.title}`);
          doc.text(`Period: ${new Date(reportData.survey.startDate).toLocaleDateString()} - ${new Date(reportData.survey.endDate).toLocaleDateString()}`);
          doc.text(`Status: ${reportData.survey.status}`);
          doc.moveDown();

          // Summary Statistics
          doc.fontSize(14).font('Helvetica-Bold').text('Summary Statistics');
          doc.moveDown(0.5);
          doc.fontSize(10).font('Helvetica');
          
          const stats = [
            ['Total Responses', reportData.statistics.totalResponses],
            ['Unique Respondents', reportData.statistics.uniqueRespondents],
            ['Average Rating', reportData.statistics.averageRating || 'N/A'],
            ['Min Rating', reportData.statistics.minRating || 'N/A'],
            ['Max Rating', reportData.statistics.maxRating || 'N/A'],
            ['Active Responses', reportData.statistics.activeCount],
            ['Taken Out Responses', reportData.statistics.takenOutCount],
            ['Proposed Takeout', reportData.statistics.proposedCount]
          ];

          stats.forEach(([label, value]) => {
            doc.text(`${label}: ${value}`);
          });
          doc.moveDown();

          // Rating Distribution
          if (reportData.ratingDistribution.length > 0) {
            doc.fontSize(14).font('Helvetica-Bold').text('Rating Distribution');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica');

            // Create simple bar chart representation
            const maxCount = Math.max(...reportData.ratingDistribution.map(d => d.Count));
            const barWidth = 400;

            reportData.ratingDistribution.forEach(item => {
              const barLength = (item.Count / maxCount) * barWidth;
              doc.text(`Rating ${item.Rating}: ${'█'.repeat(Math.floor(barLength / 10))} (${item.Count})`);
            });
            doc.moveDown();
          }

          // Response Details Table (first 20 responses)
          doc.addPage();
          doc.fontSize(14).font('Helvetica-Bold').text('Response Details (Sample)');
          doc.moveDown(0.5);
          doc.fontSize(8).font('Helvetica');

          const tableTop = doc.y;
          const colWidths = {
            email: 120,
            application: 100,
            question: 150,
            value: 80,
            status: 60
          };

          // Table header
          let x = 50;
          doc.font('Helvetica-Bold');
          doc.text('Email', x, tableTop, { width: colWidths.email, continued: false });
          x += colWidths.email;
          doc.text('Application', x, tableTop, { width: colWidths.application, continued: false });
          x += colWidths.application;
          doc.text('Question', x, tableTop, { width: colWidths.question, continued: false });
          x += colWidths.question;
          doc.text('Value', x, tableTop, { width: colWidths.value, continued: false });
          x += colWidths.value;
          doc.text('Status', x, tableTop, { width: colWidths.status, continued: false });

          doc.moveDown(0.5);
          doc.font('Helvetica');

          // Table rows (limit to first 20)
          const sampleResponses = reportData.responses.slice(0, 20);
          sampleResponses.forEach((response, index) => {
            if (doc.y > 700) {
              doc.addPage();
              doc.fontSize(8).font('Helvetica');
            }

            let responseValue = '';
            if (response.TextValue) responseValue = response.TextValue.substring(0, 30);
            else if (response.NumericValue !== null) responseValue = String(response.NumericValue);
            else if (response.DateValue) responseValue = new Date(response.DateValue).toLocaleDateString();

            x = 50;
            const y = doc.y;
            doc.text(response.RespondentEmail.substring(0, 25), x, y, { width: colWidths.email, continued: false });
            x += colWidths.email;
            doc.text(response.ApplicationName.substring(0, 20), x, y, { width: colWidths.application, continued: false });
            x += colWidths.application;
            doc.text(response.PromptText.substring(0, 30), x, y, { width: colWidths.question, continued: false });
            x += colWidths.question;
            doc.text(responseValue, x, y, { width: colWidths.value, continued: false });
            x += colWidths.value;
            doc.text(response.TakeoutStatus, x, y, { width: colWidths.status, continued: false });

            doc.moveDown(0.8);
          });

          if (reportData.responses.length > 20) {
            doc.moveDown();
            doc.fontSize(8).font('Helvetica-Oblique');
            doc.text(`... and ${reportData.responses.length - 20} more responses. Download Excel for complete data.`);
          }

          // Footer
          const pages = doc.bufferedPageRange();
          for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).font('Helvetica');
            doc.text(
              `Generated on ${new Date().toLocaleString()} | Page ${i + 1} of ${pages.count}`,
              50,
              doc.page.height - 50,
              { align: 'center' }
            );
          }

          // Finalize PDF
          doc.end();

        } catch (error) {
          reject(error);
        }
      });

    } catch (error) {
      logger.error(`Error exporting to PDF: ${error.message}`, { error });
      throw error;
    }
  }
}

module.exports = new ReportService();
