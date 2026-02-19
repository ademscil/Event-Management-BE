const sql = require('mssql');
const BaseRepository = require('./baseRepository');
const db = require('../database/connection');
const logger = require('../config/logger');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 422;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

/**
 * Survey Service
 * Handles survey event management and configuration
 */
class SurveyService {
  constructor() {
    this.surveyRepository = new BaseRepository('Surveys', 'SurveyId');
    this.configRepository = new BaseRepository('SurveyConfiguration', 'ConfigId');
  }

  /**
   * Validate survey dates
   * @param {Date} startDate - Survey start date
   * @param {Date} endDate - Survey end date
   * @throws {ValidationError} If dates are invalid
   */
  validateDates(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
      throw new ValidationError('Invalid start date');
    }

    if (isNaN(end.getTime())) {
      throw new ValidationError('Invalid end date');
    }

    if (end <= start) {
      throw new ValidationError('End date must be after start date');
    }
  }

  /**
   * Validate survey status
   * @param {string} status - Survey status
   * @throws {ValidationError} If status is invalid
   */
  validateStatus(status) {
    const validStatuses = ['Draft', 'Active', 'Closed', 'Archived'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Status must be one of: ${validStatuses.join(', ')}`);
    }
  }

  /**
   * Normalize assigned admin IDs from legacy and new payload fields.
   * @param {Object} data - Request payload
   * @returns {string[]} Deduplicated admin user IDs
   */
  normalizeAssignedAdminIds(data) {
    const listFromArray = Array.isArray(data.assignedAdminIds) ? data.assignedAdminIds : [];
    const listFromLegacy = data.assignedAdminId ? [data.assignedAdminId] : [];
    const merged = [...listFromArray, ...listFromLegacy].filter(Boolean).map((item) => String(item).trim());
    return [...new Set(merged)];
  }

  /**
   * Validate all assigned admins are active AdminEvent users.
   * @param {import('mssql').ConnectionPool} pool - DB pool
   * @param {string[]} assignedAdminIds - Admin user IDs
   * @returns {Promise<void>}
   */
  async validateAssignedAdmins(pool, assignedAdminIds) {
    for (const adminId of assignedAdminIds) {
      const adminCheck = await pool
        .request()
        .input('userId', sql.UniqueIdentifier, adminId)
        .query("SELECT UserId FROM Users WHERE UserId = @userId AND IsActive = 1 AND Role = 'AdminEvent'");

      if (adminCheck.recordset.length === 0) {
        throw new ValidationError('Assigned admin user not found, inactive, or not Admin Event');
      }
    }
  }

  /**
   * Replace all admin assignments for a survey.
   * @param {import('mssql').ConnectionPool|import('mssql').Transaction} connection - DB connection
   * @param {string} surveyId - Survey ID
   * @param {string[]} assignedAdminIds - Admin user IDs
   * @returns {Promise<void>}
   */
  async syncSurveyAdminAssignments(connection, surveyId, assignedAdminIds) {
    const makeRequest = () =>
      connection instanceof sql.Transaction ? new sql.Request(connection) : connection.request();

    await makeRequest()
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .query('DELETE FROM SurveyAdminAssignments WHERE SurveyId = @surveyId');

    for (const adminId of assignedAdminIds) {
      await makeRequest()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .input('adminUserId', sql.UniqueIdentifier, adminId)
        .query(`
          INSERT INTO SurveyAdminAssignments (SurveyId, AdminUserId, CreatedAt)
          VALUES (@surveyId, @adminUserId, GETDATE())
        `);
    }
  }

  /**
   * Create a new survey
   * @param {Object} data - Survey data
   * @param {string} data.title - Survey title (required, max 500 chars)
   * @param {string} [data.description] - Survey description
   * @param {Date} data.startDate - Survey start date
   * @param {Date} data.endDate - Survey end date
   * @param {string} [data.assignedAdminId] - Assigned admin user ID
   * @param {number} [data.targetRespondents] - Target number of respondents
   * @param {number} [data.targetScore] - Target score
   * @param {boolean} [data.duplicatePreventionEnabled=true] - Enable duplicate prevention
   * @param {string} data.createdBy - User ID creating the survey
   * @param {Object} [data.configuration] - Survey configuration
   * @returns {Promise<Object>} Created survey with configuration
   */
  async createSurvey(data) {
    const pool = await db.getPool();
    const transaction = new sql.Transaction(pool);

    try {
      // Validate required fields
      if (!data.title || data.title.trim().length === 0) {
        throw new ValidationError('Title is required');
      }

      if (data.title.length > 500) {
        throw new ValidationError('Title must not exceed 500 characters');
      }

      if (!data.startDate || !data.endDate) {
        throw new ValidationError('Start date and end date are required');
      }

      if (!data.createdBy) {
        throw new ValidationError('CreatedBy is required');
      }

      // Validate dates
      this.validateDates(data.startDate, data.endDate);
      const assignedAdminIds =
        data.assignedAdminIds !== undefined || data.assignedAdminId !== undefined
          ? this.normalizeAssignedAdminIds(data)
          : [];
      if (assignedAdminIds.length > 0) {
        await this.validateAssignedAdmins(pool, assignedAdminIds);
      }

      // Validate target score if provided
      if (data.targetScore !== undefined && data.targetScore !== null) {
        if (data.targetScore < 0 || data.targetScore > 10) {
          throw new ValidationError('Target score must be between 0 and 10');
        }
      }

      // Start transaction
      await transaction.begin();

      // Create survey
      const surveyResult = await new sql.Request(transaction)
        .input('title', sql.NVarChar(500), data.title)
        .input('description', sql.NVarChar(sql.MAX), data.description || null)
        .input('startDate', sql.DateTime2, new Date(data.startDate))
        .input('endDate', sql.DateTime2, new Date(data.endDate))
        .input('status', sql.NVarChar(50), 'Draft')
        .input('assignedAdminId', sql.UniqueIdentifier, data.assignedAdminId || null)
        .input('targetRespondents', sql.Int, data.targetRespondents || null)
        .input('targetScore', sql.Decimal(5, 2), data.targetScore || null)
        .input('duplicatePreventionEnabled', sql.Bit, data.duplicatePreventionEnabled !== false)
        .input('createdBy', sql.UniqueIdentifier, data.createdBy)
        .query(`
          INSERT INTO Surveys (
            Title, Description, StartDate, EndDate, Status,
            AssignedAdminId, TargetRespondents, TargetScore,
            DuplicatePreventionEnabled, CreatedBy, CreatedAt
          )
          OUTPUT INSERTED.*
          VALUES (
            @title, @description, @startDate, @endDate, @status,
            @assignedAdminId, @targetRespondents, @targetScore,
            @duplicatePreventionEnabled, @createdBy, GETDATE()
          )
        `);

      const survey = surveyResult.recordset[0];

      await this.syncSurveyAdminAssignments(transaction, survey.SurveyId, assignedAdminIds);

      // Create default configuration
      const config = data.configuration || {};
      const configResult = await new sql.Request(transaction)
        .input('surveyId', sql.UniqueIdentifier, survey.SurveyId)
        .input('heroTitle', sql.NVarChar(500), config.heroTitle || null)
        .input('heroSubtitle', sql.NVarChar(500), config.heroSubtitle || null)
        .input('heroImageUrl', sql.NVarChar(500), config.heroImageUrl || null)
        .input('logoUrl', sql.NVarChar(500), config.logoUrl || null)
        .input('backgroundColor', sql.NVarChar(50), config.backgroundColor || null)
        .input('backgroundImageUrl', sql.NVarChar(500), config.backgroundImageUrl || null)
        .input('primaryColor', sql.NVarChar(50), config.primaryColor || null)
        .input('secondaryColor', sql.NVarChar(50), config.secondaryColor || null)
        .input('fontFamily', sql.NVarChar(100), config.fontFamily || null)
        .input('buttonStyle', sql.NVarChar(50), config.buttonStyle || null)
        .input('showProgressBar', sql.Bit, config.showProgressBar !== false)
        .input('showPageNumbers', sql.Bit, config.showPageNumbers !== false)
        .input('multiPage', sql.Bit, config.multiPage === true)
        .query(`
          INSERT INTO SurveyConfiguration (
            SurveyId, HeroTitle, HeroSubtitle, HeroImageUrl, LogoUrl,
            BackgroundColor, BackgroundImageUrl, PrimaryColor, SecondaryColor,
            FontFamily, ButtonStyle, ShowProgressBar, ShowPageNumbers, MultiPage,
            CreatedAt
          )
          OUTPUT INSERTED.*
          VALUES (
            @surveyId, @heroTitle, @heroSubtitle, @heroImageUrl, @logoUrl,
            @backgroundColor, @backgroundImageUrl, @primaryColor, @secondaryColor,
            @fontFamily, @buttonStyle, @showProgressBar, @showPageNumbers, @multiPage,
            GETDATE()
          )
        `);

      await transaction.commit();

      logger.info('Survey created', { surveyId: survey.SurveyId, title: data.title });

      return {
        ...survey,
        configuration: configResult.recordset[0]
      };
    } catch (error) {
      await transaction.rollback();
      if (error.name === 'ValidationError') {
        throw error;
      }
      logger.error('Error creating survey:', error);
      throw error;
    }
  }

  /**
   * Update survey
   * @param {string} surveyId - Survey ID
   * @param {Object} data - Updated data
   * @param {string} data.updatedBy - User ID updating the survey
   * @returns {Promise<Object>} Updated survey
   */
  async updateSurvey(surveyId, data) {
    try {
      const pool = await db.getPool();

      // Check if survey exists
      const surveyCheck = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT SurveyId, Status FROM Surveys WHERE SurveyId = @surveyId');

      if (surveyCheck.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      // Validate dates if both are provided
      if (data.startDate && data.endDate) {
        this.validateDates(data.startDate, data.endDate);
      }

      // Validate status if provided
      if (data.status) {
        this.validateStatus(data.status);
      }
      const assignedAdminIds =
        data.assignedAdminIds !== undefined || data.assignedAdminId !== undefined
          ? this.normalizeAssignedAdminIds(data)
          : [];
      if (assignedAdminIds.length > 0) {
        await this.validateAssignedAdmins(pool, assignedAdminIds);
      }

      // Validate target score if provided
      if (data.targetScore !== undefined && data.targetScore !== null) {
        if (data.targetScore < 0 || data.targetScore > 10) {
          throw new ValidationError('Target score must be between 0 and 10');
        }
      }

      // Build update query
      const updateFields = [];
      const request = pool.request();
      request.input('surveyId', sql.UniqueIdentifier, surveyId);

      if (data.title !== undefined) {
        if (!data.title || data.title.trim().length === 0) {
          throw new ValidationError('Title cannot be empty');
        }
        if (data.title.length > 500) {
          throw new ValidationError('Title must not exceed 500 characters');
        }
        updateFields.push('Title = @title');
        request.input('title', sql.NVarChar(500), data.title);
      }

      if (data.description !== undefined) {
        updateFields.push('Description = @description');
        request.input('description', sql.NVarChar(sql.MAX), data.description);
      }

      if (data.startDate !== undefined) {
        updateFields.push('StartDate = @startDate');
        request.input('startDate', sql.DateTime2, new Date(data.startDate));
      }

      if (data.endDate !== undefined) {
        updateFields.push('EndDate = @endDate');
        request.input('endDate', sql.DateTime2, new Date(data.endDate));
      }

      if (data.status !== undefined) {
        updateFields.push('Status = @status');
        request.input('status', sql.NVarChar(50), data.status);
      }
        if (data.assignedAdminId !== undefined) {
          updateFields.push('AssignedAdminId = @assignedAdminId');
          request.input('assignedAdminId', sql.UniqueIdentifier, data.assignedAdminId);
        }

      if (data.targetRespondents !== undefined) {
        updateFields.push('TargetRespondents = @targetRespondents');
        request.input('targetRespondents', sql.Int, data.targetRespondents);
      }

      if (data.targetScore !== undefined) {
        updateFields.push('TargetScore = @targetScore');
        request.input('targetScore', sql.Decimal(5, 2), data.targetScore);
      }

      if (data.duplicatePreventionEnabled !== undefined) {
        updateFields.push('DuplicatePreventionEnabled = @duplicatePreventionEnabled');
        request.input('duplicatePreventionEnabled', sql.Bit, data.duplicatePreventionEnabled);
      }

      if (updateFields.length === 0) {
        throw new ValidationError('No fields to update');
      }

      if (data.updatedBy) {
        updateFields.push('UpdatedBy = @updatedBy');
        updateFields.push('UpdatedAt = GETDATE()');
        request.input('updatedBy', sql.UniqueIdentifier, data.updatedBy);
      } else {
        updateFields.push('UpdatedAt = GETDATE()');
      }

      const result = await request.query(`
        UPDATE Surveys
        SET ${updateFields.join(', ')}
        OUTPUT INSERTED.*
        WHERE SurveyId = @surveyId
      `);

      if (assignedAdminIds !== null) {
        await this.syncSurveyAdminAssignments(pool, surveyId, assignedAdminIds);
      }

      logger.info('Survey updated', { surveyId });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating survey:', error);
      throw error;
    }
  }

  /**
   * Delete survey
   * @param {string} surveyId - Survey ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteSurvey(surveyId) {
    try {
      const pool = await db.getPool();

      // Check if survey exists
      const surveyCheck = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT SurveyId FROM Surveys WHERE SurveyId = @surveyId');

      if (surveyCheck.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      // Check for responses
      const responseCheck = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT COUNT(*) as count FROM Responses WHERE SurveyId = @surveyId');

      if (responseCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot delete survey: responses exist');
      }

      await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('DELETE FROM SurveyAdminAssignments WHERE SurveyId = @surveyId');

      // Delete survey (cascade will delete configuration and questions)
      const result = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('DELETE FROM Surveys WHERE SurveyId = @surveyId');

      logger.info('Survey deleted', { surveyId });
      return result.rowsAffected[0] > 0;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error deleting survey:', error);
      throw error;
    }
  }

  /**
   * Get surveys with optional filtering
   * @param {Object} [filter] - Filter options
   * @param {string} [filter.status] - Filter by status
   * @param {string} [filter.assignedAdminId] - Filter by assigned admin
   * @returns {Promise<Array>} Array of surveys with configurations
   */
  async getSurveys(filter = {}) {
    try {
      const pool = await db.getPool();
      const request = pool.request();

      let query = `
        SELECT 
          s.*,
          COALESCE(NULLIF(STUFF((
            SELECT ', ' + u2.DisplayName
            FROM SurveyAdminAssignments saa2
            INNER JOIN Users u2 ON u2.UserId = saa2.AdminUserId
            WHERE saa2.SurveyId = s.SurveyId
            FOR XML PATH(''), TYPE
          ).value('.', 'NVARCHAR(MAX)'), 1, 2, ''), ''), admin.DisplayName) AS AssignedAdminName,
          NULLIF(STUFF((
            SELECT ', ' + u2.DisplayName
            FROM SurveyAdminAssignments saa2
            INNER JOIN Users u2 ON u2.UserId = saa2.AdminUserId
            WHERE saa2.SurveyId = s.SurveyId
            FOR XML PATH(''), TYPE
          ).value('.', 'NVARCHAR(MAX)'), 1, 2, ''), '') AS AssignedAdminNames,
          NULLIF(STUFF((
            SELECT ',' + CAST(saa2.AdminUserId AS NVARCHAR(36))
            FROM SurveyAdminAssignments saa2
            WHERE saa2.SurveyId = s.SurveyId
            FOR XML PATH(''), TYPE
          ).value('.', 'NVARCHAR(MAX)'), 1, 1, ''), '') AS AssignedAdminIdsCsv,
          ISNULL(resp.RespondentCount, 0) AS RespondentCount,
          sc.ConfigId, sc.HeroTitle, sc.HeroSubtitle, sc.HeroImageUrl,
          sc.LogoUrl, sc.BackgroundColor, sc.BackgroundImageUrl,
          sc.PrimaryColor, sc.SecondaryColor, sc.FontFamily, sc.ButtonStyle,
          sc.ShowProgressBar, sc.ShowPageNumbers, sc.MultiPage
        FROM Surveys s
        LEFT JOIN (
          SELECT SurveyId, COUNT(1) AS RespondentCount
          FROM Responses
          GROUP BY SurveyId
        ) resp ON resp.SurveyId = s.SurveyId
        LEFT JOIN Users admin ON admin.UserId = s.AssignedAdminId
        LEFT JOIN SurveyConfiguration sc ON s.SurveyId = sc.SurveyId
        WHERE 1=1
      `;

      if (filter.status) {
        query += ' AND s.Status = @status';
        request.input('status', sql.NVarChar(50), filter.status);
      }

      if (filter.assignedAdminId) {
        query += ` AND (
          EXISTS (
            SELECT 1 FROM SurveyAdminAssignments saaFilter
            WHERE saaFilter.SurveyId = s.SurveyId
              AND saaFilter.AdminUserId = @assignedAdminId
          )
          OR s.AssignedAdminId = @assignedAdminId
        )`;
        request.input('assignedAdminId', sql.UniqueIdentifier, filter.assignedAdminId);
      }

      query += ' ORDER BY s.CreatedAt DESC';

      const result = await request.query(query);

      // Transform results to include configuration as nested object
      return result.recordset.map(row => {
        const survey = {
          SurveyId: row.SurveyId,
          Title: row.Title,
          Description: row.Description,
          StartDate: row.StartDate,
          EndDate: row.EndDate,
          Status: row.Status,
          AssignedAdminId: row.AssignedAdminId,
          AssignedAdminName: row.AssignedAdminName || null,
          AssignedAdminNames: row.AssignedAdminNames
            ? row.AssignedAdminNames.split(',').map((name) => name.trim()).filter(Boolean)
            : (row.AssignedAdminName ? [row.AssignedAdminName] : []),
          AssignedAdminIds: row.AssignedAdminIdsCsv
            ? row.AssignedAdminIdsCsv.split(',').map((id) => id.trim()).filter(Boolean)
            : (row.AssignedAdminId ? [String(row.AssignedAdminId)] : []),
          TargetRespondents: row.TargetRespondents,
          TargetScore: row.TargetScore,
          CurrentScore: row.CurrentScore,
          RespondentCount: row.RespondentCount || 0,
          SurveyLink: row.SurveyLink,
          ShortenedLink: row.ShortenedLink,
          QRCodeDataUrl: row.QRCodeDataUrl,
          EmbedCode: row.EmbedCode,
          DuplicatePreventionEnabled: row.DuplicatePreventionEnabled,
          CreatedAt: row.CreatedAt,
          CreatedBy: row.CreatedBy,
          UpdatedAt: row.UpdatedAt,
          UpdatedBy: row.UpdatedBy
        };

        if (row.ConfigId) {
          survey.configuration = {
            ConfigId: row.ConfigId,
            HeroTitle: row.HeroTitle,
            HeroSubtitle: row.HeroSubtitle,
            HeroImageUrl: row.HeroImageUrl,
            LogoUrl: row.LogoUrl,
            BackgroundColor: row.BackgroundColor,
            BackgroundImageUrl: row.BackgroundImageUrl,
            PrimaryColor: row.PrimaryColor,
            SecondaryColor: row.SecondaryColor,
            FontFamily: row.FontFamily,
            ButtonStyle: row.ButtonStyle,
            ShowProgressBar: row.ShowProgressBar,
            ShowPageNumbers: row.ShowPageNumbers,
            MultiPage: row.MultiPage
          };
        }

        return survey;
      });
    } catch (error) {
      logger.error('Error getting surveys:', error);
      throw error;
    }
  }

  /**
   * Get survey by ID with complete data including questions
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Object>} Survey with configuration and questions
   */
  async getSurveyById(surveyId) {
    try {
      const pool = await db.getPool();
      const result = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT 
            s.*,
            sc.ConfigId, sc.HeroTitle, sc.HeroSubtitle, sc.HeroImageUrl,
            sc.LogoUrl, sc.BackgroundColor, sc.BackgroundImageUrl,
            sc.PrimaryColor, sc.SecondaryColor, sc.FontFamily, sc.ButtonStyle,
            sc.ShowProgressBar, sc.ShowPageNumbers, sc.MultiPage
          FROM Surveys s
          LEFT JOIN SurveyConfiguration sc ON s.SurveyId = sc.SurveyId
          WHERE s.SurveyId = @surveyId
        `);

      if (result.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      const row = result.recordset[0];
      const survey = {
        SurveyId: row.SurveyId,
        Title: row.Title,
        Description: row.Description,
        StartDate: row.StartDate,
        EndDate: row.EndDate,
        Status: row.Status,
        AssignedAdminId: row.AssignedAdminId,
        TargetRespondents: row.TargetRespondents,
        TargetScore: row.TargetScore,
        CurrentScore: row.CurrentScore,
        SurveyLink: row.SurveyLink,
        ShortenedLink: row.ShortenedLink,
        QRCodeDataUrl: row.QRCodeDataUrl,
        EmbedCode: row.EmbedCode,
        DuplicatePreventionEnabled: row.DuplicatePreventionEnabled,
        CreatedAt: row.CreatedAt,
        CreatedBy: row.CreatedBy,
        UpdatedAt: row.UpdatedAt,
        UpdatedBy: row.UpdatedBy
      };

      if (row.ConfigId) {
        survey.configuration = {
          ConfigId: row.ConfigId,
          HeroTitle: row.HeroTitle,
          HeroSubtitle: row.HeroSubtitle,
          HeroImageUrl: row.HeroImageUrl,
          LogoUrl: row.LogoUrl,
          BackgroundColor: row.BackgroundColor,
          BackgroundImageUrl: row.BackgroundImageUrl,
          PrimaryColor: row.PrimaryColor,
          SecondaryColor: row.SecondaryColor,
          FontFamily: row.FontFamily,
          ButtonStyle: row.ButtonStyle,
          ShowProgressBar: row.ShowProgressBar,
          ShowPageNumbers: row.ShowPageNumbers,
          MultiPage: row.MultiPage
        };
      }

      // Fetch questions for the survey
      const questionsResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT * FROM Questions
          WHERE SurveyId = @surveyId
          ORDER BY PageNumber, DisplayOrder
        `);

      // Parse options for each question and organize by pages
      const questions = questionsResult.recordset.map(q => {
        if (q.Options) {
          q.Options = JSON.parse(q.Options);
        }
        return q;
      });

      // Organize questions by pages if multi-page
      if (survey.configuration && survey.configuration.MultiPage) {
        const pages = {};
        questions.forEach(q => {
          const pageNum = q.PageNumber || 1;
          if (!pages[pageNum]) {
            pages[pageNum] = [];
          }
          pages[pageNum].push(q);
        });
        survey.pages = pages;
      }

      survey.questions = questions;

      return survey;
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error getting survey:', error);
      throw error;
    }
  }

  /**
   * Update survey configuration
   * @param {string} surveyId - Survey ID
   * @param {Object} config - Configuration data
   * @returns {Promise<Object>} Updated configuration
   */
  async updateSurveyConfig(surveyId, config) {
    try {
      const pool = await db.getPool();

      // Check if survey exists
      const surveyCheck = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT SurveyId FROM Surveys WHERE SurveyId = @surveyId');

      if (surveyCheck.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      // Check if configuration exists
      const configCheck = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT ConfigId FROM SurveyConfiguration WHERE SurveyId = @surveyId');

      if (configCheck.recordset.length === 0) {
        throw new NotFoundError('Survey configuration not found');
      }

      // Build update query
      const updateFields = [];
      const request = pool.request();
      request.input('surveyId', sql.UniqueIdentifier, surveyId);

      if (config.heroTitle !== undefined) {
        updateFields.push('HeroTitle = @heroTitle');
        request.input('heroTitle', sql.NVarChar(500), config.heroTitle);
      }

      if (config.heroSubtitle !== undefined) {
        updateFields.push('HeroSubtitle = @heroSubtitle');
        request.input('heroSubtitle', sql.NVarChar(500), config.heroSubtitle);
      }

      if (config.heroImageUrl !== undefined) {
        updateFields.push('HeroImageUrl = @heroImageUrl');
        request.input('heroImageUrl', sql.NVarChar(500), config.heroImageUrl);
      }

      if (config.logoUrl !== undefined) {
        updateFields.push('LogoUrl = @logoUrl');
        request.input('logoUrl', sql.NVarChar(500), config.logoUrl);
      }

      if (config.backgroundColor !== undefined) {
        updateFields.push('BackgroundColor = @backgroundColor');
        request.input('backgroundColor', sql.NVarChar(50), config.backgroundColor);
      }

      if (config.backgroundImageUrl !== undefined) {
        updateFields.push('BackgroundImageUrl = @backgroundImageUrl');
        request.input('backgroundImageUrl', sql.NVarChar(500), config.backgroundImageUrl);
      }

      if (config.primaryColor !== undefined) {
        updateFields.push('PrimaryColor = @primaryColor');
        request.input('primaryColor', sql.NVarChar(50), config.primaryColor);
      }

      if (config.secondaryColor !== undefined) {
        updateFields.push('SecondaryColor = @secondaryColor');
        request.input('secondaryColor', sql.NVarChar(50), config.secondaryColor);
      }

      if (config.fontFamily !== undefined) {
        updateFields.push('FontFamily = @fontFamily');
        request.input('fontFamily', sql.NVarChar(100), config.fontFamily);
      }

      if (config.buttonStyle !== undefined) {
        updateFields.push('ButtonStyle = @buttonStyle');
        request.input('buttonStyle', sql.NVarChar(50), config.buttonStyle);
      }

      if (config.showProgressBar !== undefined) {
        updateFields.push('ShowProgressBar = @showProgressBar');
        request.input('showProgressBar', sql.Bit, config.showProgressBar);
      }

      if (config.showPageNumbers !== undefined) {
        updateFields.push('ShowPageNumbers = @showPageNumbers');
        request.input('showPageNumbers', sql.Bit, config.showPageNumbers);
      }

      if (config.multiPage !== undefined) {
        updateFields.push('MultiPage = @multiPage');
        request.input('multiPage', sql.Bit, config.multiPage);
      }

      if (updateFields.length === 0) {
        throw new ValidationError('No fields to update');
      }

      updateFields.push('UpdatedAt = GETDATE()');

      const result = await request.query(`
        UPDATE SurveyConfiguration
        SET ${updateFields.join(', ')}
        OUTPUT INSERTED.*
        WHERE SurveyId = @surveyId
      `);

      logger.info('Survey configuration updated', { surveyId });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating survey configuration:', error);
      throw error;
    }
  }
  /**
   * Update survey configuration
   * @param {string} surveyId - Survey ID
   * @param {Object} config - Configuration data
   * @returns {Promise<Object>} Updated configuration
   */
  async updateSurveyConfig(surveyId, config) {
    try {
      const pool = await db.getPool();

      // Check if survey exists
      const surveyCheck = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT SurveyId FROM Surveys WHERE SurveyId = @surveyId');

      if (surveyCheck.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      // Check if configuration exists
      const configCheck = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT ConfigId FROM SurveyConfiguration WHERE SurveyId = @surveyId');

      if (configCheck.recordset.length === 0) {
        throw new NotFoundError('Survey configuration not found');
      }

      // Build update query
      const updateFields = [];
      const request = pool.request();
      request.input('surveyId', sql.UniqueIdentifier, surveyId);

      if (config.heroTitle !== undefined) {
        updateFields.push('HeroTitle = @heroTitle');
        request.input('heroTitle', sql.NVarChar(500), config.heroTitle);
      }

      if (config.heroSubtitle !== undefined) {
        updateFields.push('HeroSubtitle = @heroSubtitle');
        request.input('heroSubtitle', sql.NVarChar(500), config.heroSubtitle);
      }

      if (config.heroImageUrl !== undefined) {
        updateFields.push('HeroImageUrl = @heroImageUrl');
        request.input('heroImageUrl', sql.NVarChar(500), config.heroImageUrl);
      }

      if (config.logoUrl !== undefined) {
        updateFields.push('LogoUrl = @logoUrl');
        request.input('logoUrl', sql.NVarChar(500), config.logoUrl);
      }

      if (config.backgroundColor !== undefined) {
        updateFields.push('BackgroundColor = @backgroundColor');
        request.input('backgroundColor', sql.NVarChar(50), config.backgroundColor);
      }

      if (config.backgroundImageUrl !== undefined) {
        updateFields.push('BackgroundImageUrl = @backgroundImageUrl');
        request.input('backgroundImageUrl', sql.NVarChar(500), config.backgroundImageUrl);
      }

      if (config.primaryColor !== undefined) {
        updateFields.push('PrimaryColor = @primaryColor');
        request.input('primaryColor', sql.NVarChar(50), config.primaryColor);
      }

      if (config.secondaryColor !== undefined) {
        updateFields.push('SecondaryColor = @secondaryColor');
        request.input('secondaryColor', sql.NVarChar(50), config.secondaryColor);
      }

      if (config.fontFamily !== undefined) {
        updateFields.push('FontFamily = @fontFamily');
        request.input('fontFamily', sql.NVarChar(100), config.fontFamily);
      }

      if (config.buttonStyle !== undefined) {
        updateFields.push('ButtonStyle = @buttonStyle');
        request.input('buttonStyle', sql.NVarChar(50), config.buttonStyle);
      }

      if (config.showProgressBar !== undefined) {
        updateFields.push('ShowProgressBar = @showProgressBar');
        request.input('showProgressBar', sql.Bit, config.showProgressBar);
      }

      if (config.showPageNumbers !== undefined) {
        updateFields.push('ShowPageNumbers = @showPageNumbers');
        request.input('showPageNumbers', sql.Bit, config.showPageNumbers);
      }

      if (config.multiPage !== undefined) {
        updateFields.push('MultiPage = @multiPage');
        request.input('multiPage', sql.Bit, config.multiPage);
      }

      if (updateFields.length === 0) {
        throw new ValidationError('No fields to update');
      }

      updateFields.push('UpdatedAt = GETDATE()');

      const result = await request.query(`
        UPDATE SurveyConfiguration
        SET ${updateFields.join(', ')}
        OUTPUT INSERTED.*
        WHERE SurveyId = @surveyId
      `);

      logger.info('Survey configuration updated', { surveyId });
      return result.recordset[0];
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating survey configuration:', error);
      throw error;
    }
  }

  /**
   * Generate preview of survey with applied styles
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Object>} Survey preview data with configuration and questions
   */
  async generatePreview(surveyId) {
    try {
      const pool = await db.getPool();

      // Get complete survey data with configuration
      const surveyResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT
            s.*,
            sc.ConfigId, sc.HeroTitle, sc.HeroSubtitle, sc.HeroImageUrl,
            sc.LogoUrl, sc.BackgroundColor, sc.BackgroundImageUrl,
            sc.PrimaryColor, sc.SecondaryColor, sc.FontFamily, sc.ButtonStyle,
            sc.ShowProgressBar, sc.ShowPageNumbers, sc.MultiPage
          FROM Surveys s
          LEFT JOIN SurveyConfiguration sc ON s.SurveyId = sc.SurveyId
          WHERE s.SurveyId = @surveyId
        `);

      if (surveyResult.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      const row = surveyResult.recordset[0];

      // Build survey preview object
      const preview = {
        surveyId: row.SurveyId,
        title: row.Title,
        description: row.Description,
        startDate: row.StartDate,
        endDate: row.EndDate,
        status: row.Status,
        targetRespondents: row.TargetRespondents,
        targetScore: row.TargetScore,
        configuration: {
          heroTitle: row.HeroTitle,
          heroSubtitle: row.HeroSubtitle,
          heroImageUrl: row.HeroImageUrl,
          logoUrl: row.LogoUrl,
          backgroundColor: row.BackgroundColor,
          backgroundImageUrl: row.BackgroundImageUrl,
          primaryColor: row.PrimaryColor,
          secondaryColor: row.SecondaryColor,
          fontFamily: row.FontFamily,
          buttonStyle: row.ButtonStyle,
          showProgressBar: row.ShowProgressBar,
          showPageNumbers: row.ShowPageNumbers,
          multiPage: row.MultiPage
        },
        readOnly: true // Indicate this is a preview
      };

      // Get questions for the survey
      const questionsResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT * FROM Questions
          WHERE SurveyId = @surveyId
          ORDER BY PageNumber, DisplayOrder
        `);

      // Parse options for each question
      const questions = questionsResult.recordset.map(q => {
        const question = {
          questionId: q.QuestionId,
          type: q.Type,
          promptText: q.PromptText,
          subtitle: q.Subtitle,
          imageUrl: q.ImageUrl,
          isMandatory: q.IsMandatory,
          displayOrder: q.DisplayOrder,
          pageNumber: q.PageNumber,
          layoutOrientation: q.LayoutOrientation,
          commentRequiredBelowRating: q.CommentRequiredBelowRating
        };

        if (q.Options) {
          try {
            question.options = JSON.parse(q.Options);
          } catch (e) {
            logger.warn(`Failed to parse options for question ${q.QuestionId}`, e);
            question.options = null;
          }
        }

        return question;
      });

      // Organize questions by pages if multi-page
      if (preview.configuration.multiPage) {
        const pages = {};
        questions.forEach(q => {
          const pageNum = q.pageNumber || 1;
          if (!pages[pageNum]) {
            pages[pageNum] = [];
          }
          pages[pageNum].push(q);
        });
        preview.pages = pages;
        preview.totalPages = Object.keys(pages).length;
      } else {
        preview.questions = questions;
      }

      // Generate CSS styles based on configuration
      preview.styles = this.generatePreviewStyles(preview.configuration);

      logger.info('Survey preview generated', { surveyId });
      return preview;
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error generating survey preview:', error);
      throw error;
    }
  }

  /**
   * Generate CSS styles from survey configuration
   * @param {Object} config - Survey configuration
   * @returns {Object} CSS style object
   * @private
   */
  generatePreviewStyles(config) {
    const styles = {
      backgroundColor: config.backgroundColor || '#ffffff',
      backgroundImage: config.backgroundImageUrl ? `url(${config.backgroundImageUrl})` : 'none',
      primaryColor: config.primaryColor || '#007bff',
      secondaryColor: config.secondaryColor || '#6c757d',
      fontFamily: config.fontFamily || 'Arial, sans-serif',
      buttonStyle: config.buttonStyle || 'rounded'
    };

    // Generate CSS string for easy application
    styles.cssText = `
      body {
        background-color: ${styles.backgroundColor};
        ${styles.backgroundImage !== 'none' ? `background-image: ${styles.backgroundImage};` : ''}
        background-size: cover;
        background-position: center;
        font-family: ${styles.fontFamily};
      }
      .btn-primary {
        background-color: ${styles.primaryColor};
        border-color: ${styles.primaryColor};
        ${styles.buttonStyle === 'rounded' ? 'border-radius: 0.25rem;' : ''}
        ${styles.buttonStyle === 'pill' ? 'border-radius: 50rem;' : ''}
        ${styles.buttonStyle === 'square' ? 'border-radius: 0;' : ''}
      }
      .btn-secondary {
        background-color: ${styles.secondaryColor};
        border-color: ${styles.secondaryColor};
      }
      .progress-bar {
        background-color: ${styles.primaryColor};
      }
    `.trim();

    return styles;
  }

  /**
   * Save survey (create or update) with complete data
   * @param {Object} data - Complete survey data
   * @param {string} [data.surveyId] - Survey ID (for update, omit for create)
   * @param {string} data.title - Survey title
   * @param {string} [data.description] - Survey description
   * @param {Date} data.startDate - Survey start date
   * @param {Date} data.endDate - Survey end date
   * @param {string} [data.status='Draft'] - Survey status
   * @param {string} [data.assignedAdminId] - Assigned admin user ID
   * @param {number} [data.targetRespondents] - Target number of respondents
   * @param {number} [data.targetScore] - Target score
   * @param {boolean} [data.duplicatePreventionEnabled=true] - Enable duplicate prevention
   * @param {Object} [data.configuration] - Survey configuration (theme)
   * @param {Array} [data.questions] - Array of questions
   * @param {string} data.userId - User ID performing the operation (createdBy or updatedBy)
   * @returns {Promise<Object>} Saved survey with complete data
   */
  async saveSurvey(data) {
    // Validate before starting transaction
    if (!data.userId) {
      throw new ValidationError('userId is required');
    }

    const pool = await db.getPool();
    const transaction = new sql.Transaction(pool);

    try {
      // Start transaction
      await transaction.begin();

      let survey;
      let isUpdate = false;

      // Check if this is an update or create
      if (data.surveyId) {
        // Update existing survey
        const surveyCheck = await new sql.Request(transaction)
          .input('surveyId', sql.UniqueIdentifier, data.surveyId)
          .query('SELECT SurveyId, Status FROM Surveys WHERE SurveyId = @surveyId');

        if (surveyCheck.recordset.length === 0) {
          throw new NotFoundError('Survey not found');
        }

        isUpdate = true;

        // Update survey basic info
        const updateFields = [];
        const request = new sql.Request(transaction);
        request.input('surveyId', sql.UniqueIdentifier, data.surveyId);

        if (data.title !== undefined) {
          if (!data.title || data.title.trim().length === 0) {
            throw new ValidationError('Title cannot be empty');
          }
          if (data.title.length > 500) {
            throw new ValidationError('Title must not exceed 500 characters');
          }
          updateFields.push('Title = @title');
          request.input('title', sql.NVarChar(500), data.title);
        }

        if (data.description !== undefined) {
          updateFields.push('Description = @description');
          request.input('description', sql.NVarChar(sql.MAX), data.description);
        }

        if (data.startDate !== undefined) {
          updateFields.push('StartDate = @startDate');
          request.input('startDate', sql.DateTime2, new Date(data.startDate));
        }

        if (data.endDate !== undefined) {
          updateFields.push('EndDate = @endDate');
          request.input('endDate', sql.DateTime2, new Date(data.endDate));
        }

        if (data.status !== undefined) {
          this.validateStatus(data.status);
          updateFields.push('Status = @status');
          request.input('status', sql.NVarChar(50), data.status);
        }
        if (data.assignedAdminId !== undefined) {
          updateFields.push('AssignedAdminId = @assignedAdminId');
          request.input('assignedAdminId', sql.UniqueIdentifier, data.assignedAdminId);
        }

        if (data.targetRespondents !== undefined) {
          updateFields.push('TargetRespondents = @targetRespondents');
          request.input('targetRespondents', sql.Int, data.targetRespondents);
        }

        if (data.targetScore !== undefined) {
          if (data.targetScore !== null && (data.targetScore < 0 || data.targetScore > 10)) {
            throw new ValidationError('Target score must be between 0 and 10');
          }
          updateFields.push('TargetScore = @targetScore');
          request.input('targetScore', sql.Decimal(5, 2), data.targetScore);
        }

        if (data.duplicatePreventionEnabled !== undefined) {
          updateFields.push('DuplicatePreventionEnabled = @duplicatePreventionEnabled');
          request.input('duplicatePreventionEnabled', sql.Bit, data.duplicatePreventionEnabled);
        }

        if (updateFields.length > 0) {
          updateFields.push('UpdatedBy = @updatedBy');
          updateFields.push('UpdatedAt = GETDATE()');
          request.input('updatedBy', sql.UniqueIdentifier, data.userId);

          const surveyResult = await request.query(`
            UPDATE Surveys
            SET ${updateFields.join(', ')}
            OUTPUT INSERTED.*
            WHERE SurveyId = @surveyId
          `);

          survey = surveyResult.recordset[0];
        } else {
          // No survey fields to update, just fetch existing
          const surveyResult = await new sql.Request(transaction)
            .input('surveyId', sql.UniqueIdentifier, data.surveyId)
            .query('SELECT * FROM Surveys WHERE SurveyId = @surveyId');
          survey = surveyResult.recordset[0];
        }
      } else {
        // Create new survey
        if (!data.title || data.title.trim().length === 0) {
          throw new ValidationError('Title is required');
        }

        if (data.title.length > 500) {
          throw new ValidationError('Title must not exceed 500 characters');
        }

        if (!data.startDate || !data.endDate) {
          throw new ValidationError('Start date and end date are required');
        }

        this.validateDates(data.startDate, data.endDate);

        if (data.targetScore !== undefined && data.targetScore !== null) {
          if (data.targetScore < 0 || data.targetScore > 10) {
            throw new ValidationError('Target score must be between 0 and 10');
          }
        }

        const surveyResult = await new sql.Request(transaction)
          .input('title', sql.NVarChar(500), data.title)
          .input('description', sql.NVarChar(sql.MAX), data.description || null)
          .input('startDate', sql.DateTime2, new Date(data.startDate))
          .input('endDate', sql.DateTime2, new Date(data.endDate))
          .input('status', sql.NVarChar(50), data.status || 'Draft')
          .input('assignedAdminId', sql.UniqueIdentifier, data.assignedAdminId || null)
          .input('targetRespondents', sql.Int, data.targetRespondents || null)
          .input('targetScore', sql.Decimal(5, 2), data.targetScore || null)
          .input('duplicatePreventionEnabled', sql.Bit, data.duplicatePreventionEnabled !== false)
          .input('createdBy', sql.UniqueIdentifier, data.userId)
          .query(`
            INSERT INTO Surveys (
              Title, Description, StartDate, EndDate, Status,
              AssignedAdminId, TargetRespondents, TargetScore,
              DuplicatePreventionEnabled, CreatedBy, CreatedAt
            )
            OUTPUT INSERTED.*
            VALUES (
              @title, @description, @startDate, @endDate, @status,
              @assignedAdminId, @targetRespondents, @targetScore,
              @duplicatePreventionEnabled, @createdBy, GETDATE()
            )
          `);

        survey = surveyResult.recordset[0];
      }

      // Handle configuration (theme)
      // Always ensure configuration exists for the survey
      const configCheck = await new sql.Request(transaction)
        .input('surveyId', sql.UniqueIdentifier, survey.SurveyId)
        .query('SELECT ConfigId FROM SurveyConfiguration WHERE SurveyId = @surveyId');

      if (data.configuration) {
        const config = data.configuration;

        if (configCheck.recordset.length > 0) {
          // Update existing configuration
          const updateFields = [];
          const request = new sql.Request(transaction);
          request.input('surveyId', sql.UniqueIdentifier, survey.SurveyId);

          if (config.heroTitle !== undefined) {
            updateFields.push('HeroTitle = @heroTitle');
            request.input('heroTitle', sql.NVarChar(500), config.heroTitle);
          }

          if (config.heroSubtitle !== undefined) {
            updateFields.push('HeroSubtitle = @heroSubtitle');
            request.input('heroSubtitle', sql.NVarChar(500), config.heroSubtitle);
          }

          if (config.heroImageUrl !== undefined) {
            updateFields.push('HeroImageUrl = @heroImageUrl');
            request.input('heroImageUrl', sql.NVarChar(500), config.heroImageUrl);
          }

          if (config.logoUrl !== undefined) {
            updateFields.push('LogoUrl = @logoUrl');
            request.input('logoUrl', sql.NVarChar(500), config.logoUrl);
          }

          if (config.backgroundColor !== undefined) {
            updateFields.push('BackgroundColor = @backgroundColor');
            request.input('backgroundColor', sql.NVarChar(50), config.backgroundColor);
          }

          if (config.backgroundImageUrl !== undefined) {
            updateFields.push('BackgroundImageUrl = @backgroundImageUrl');
            request.input('backgroundImageUrl', sql.NVarChar(500), config.backgroundImageUrl);
          }

          if (config.primaryColor !== undefined) {
            updateFields.push('PrimaryColor = @primaryColor');
            request.input('primaryColor', sql.NVarChar(50), config.primaryColor);
          }

          if (config.secondaryColor !== undefined) {
            updateFields.push('SecondaryColor = @secondaryColor');
            request.input('secondaryColor', sql.NVarChar(50), config.secondaryColor);
          }

          if (config.fontFamily !== undefined) {
            updateFields.push('FontFamily = @fontFamily');
            request.input('fontFamily', sql.NVarChar(100), config.fontFamily);
          }

          if (config.buttonStyle !== undefined) {
            updateFields.push('ButtonStyle = @buttonStyle');
            request.input('buttonStyle', sql.NVarChar(50), config.buttonStyle);
          }

          if (config.showProgressBar !== undefined) {
            updateFields.push('ShowProgressBar = @showProgressBar');
            request.input('showProgressBar', sql.Bit, config.showProgressBar);
          }

          if (config.showPageNumbers !== undefined) {
            updateFields.push('ShowPageNumbers = @showPageNumbers');
            request.input('showPageNumbers', sql.Bit, config.showPageNumbers);
          }

          if (config.multiPage !== undefined) {
            updateFields.push('MultiPage = @multiPage');
            request.input('multiPage', sql.Bit, config.multiPage);
          }

          if (updateFields.length > 0) {
            updateFields.push('UpdatedAt = GETDATE()');
            await request.query(`
              UPDATE SurveyConfiguration
              SET ${updateFields.join(', ')}
              WHERE SurveyId = @surveyId
            `);
          }
        } else {
          // Create new configuration
          await new sql.Request(transaction)
            .input('surveyId', sql.UniqueIdentifier, survey.SurveyId)
            .input('heroTitle', sql.NVarChar(500), config.heroTitle || null)
            .input('heroSubtitle', sql.NVarChar(500), config.heroSubtitle || null)
            .input('heroImageUrl', sql.NVarChar(500), config.heroImageUrl || null)
            .input('logoUrl', sql.NVarChar(500), config.logoUrl || null)
            .input('backgroundColor', sql.NVarChar(50), config.backgroundColor || null)
            .input('backgroundImageUrl', sql.NVarChar(500), config.backgroundImageUrl || null)
            .input('primaryColor', sql.NVarChar(50), config.primaryColor || null)
            .input('secondaryColor', sql.NVarChar(50), config.secondaryColor || null)
            .input('fontFamily', sql.NVarChar(100), config.fontFamily || null)
            .input('buttonStyle', sql.NVarChar(50), config.buttonStyle || null)
            .input('showProgressBar', sql.Bit, config.showProgressBar !== false)
            .input('showPageNumbers', sql.Bit, config.showPageNumbers !== false)
            .input('multiPage', sql.Bit, config.multiPage === true)
            .query(`
              INSERT INTO SurveyConfiguration (
                SurveyId, HeroTitle, HeroSubtitle, HeroImageUrl, LogoUrl,
                BackgroundColor, BackgroundImageUrl, PrimaryColor, SecondaryColor,
                FontFamily, ButtonStyle, ShowProgressBar, ShowPageNumbers, MultiPage,
                CreatedAt
              )
              VALUES (
                @surveyId, @heroTitle, @heroSubtitle, @heroImageUrl, @logoUrl,
                @backgroundColor, @backgroundImageUrl, @primaryColor, @secondaryColor,
                @fontFamily, @buttonStyle, @showProgressBar, @showPageNumbers, @multiPage,
                GETDATE()
              )
            `);
        }
      } else if (configCheck.recordset.length === 0) {
        // Create default configuration if none exists and none provided
        await new sql.Request(transaction)
          .input('surveyId', sql.UniqueIdentifier, survey.SurveyId)
          .input('showProgressBar', sql.Bit, true)
          .input('showPageNumbers', sql.Bit, true)
          .input('multiPage', sql.Bit, false)
          .query(`
            INSERT INTO SurveyConfiguration (
              SurveyId, ShowProgressBar, ShowPageNumbers, MultiPage, CreatedAt
            )
            VALUES (
              @surveyId, @showProgressBar, @showPageNumbers, @multiPage, GETDATE()
            )
          `);
      }

      // Handle questions
      if (data.questions && Array.isArray(data.questions)) {
        // For updates, we need to handle existing questions
        if (isUpdate) {
          // Get existing questions
          const existingQuestionsResult = await new sql.Request(transaction)
            .input('surveyId', sql.UniqueIdentifier, survey.SurveyId)
            .query('SELECT QuestionId FROM Questions WHERE SurveyId = @surveyId');

          const existingQuestionIds = existingQuestionsResult.recordset.map(q => q.QuestionId);
          const providedQuestionIds = data.questions
            .filter(q => q.QuestionId)
            .map(q => q.QuestionId);

          // Delete questions that are no longer in the list
          for (const existingId of existingQuestionIds) {
            if (!providedQuestionIds.includes(existingId)) {
              await new sql.Request(transaction)
                .input('questionId', sql.UniqueIdentifier, existingId)
                .query('DELETE FROM Questions WHERE QuestionId = @questionId');
            }
          }
        }

        // Insert or update questions
        for (const question of data.questions) {
          this.validateQuestionType(question.type);

          if (question.layoutOrientation) {
            this.validateLayoutOrientation(question.layoutOrientation);
          }

          const optionsJson = question.options ? JSON.stringify(question.options) : null;

          if (question.QuestionId) {
            // Update existing question
            await new sql.Request(transaction)
              .input('questionId', sql.UniqueIdentifier, question.QuestionId)
              .input('type', sql.NVarChar(50), question.type)
              .input('promptText', sql.NVarChar(sql.MAX), question.promptText)
              .input('subtitle', sql.NVarChar(500), question.subtitle || null)
              .input('imageUrl', sql.NVarChar(500), question.imageUrl || null)
              .input('isMandatory', sql.Bit, question.isMandatory || false)
              .input('displayOrder', sql.Int, question.displayOrder)
              .input('pageNumber', sql.Int, question.pageNumber || 1)
              .input('layoutOrientation', sql.NVarChar(20), question.layoutOrientation || null)
              .input('options', sql.NVarChar(sql.MAX), optionsJson)
              .input('commentRequiredBelowRating', sql.Int, question.commentRequiredBelowRating || null)
              .input('updatedBy', sql.UniqueIdentifier, data.userId)
              .query(`
                UPDATE Questions
                SET Type = @type, PromptText = @promptText, Subtitle = @subtitle,
                    ImageUrl = @imageUrl, IsMandatory = @isMandatory,
                    DisplayOrder = @displayOrder, PageNumber = @pageNumber,
                    LayoutOrientation = @layoutOrientation, Options = @options,
                    CommentRequiredBelowRating = @commentRequiredBelowRating,
                    UpdatedBy = @updatedBy, UpdatedAt = GETDATE()
                WHERE QuestionId = @questionId
              `);
          } else {
            // Insert new question
            await new sql.Request(transaction)
              .input('surveyId', sql.UniqueIdentifier, survey.SurveyId)
              .input('type', sql.NVarChar(50), question.type)
              .input('promptText', sql.NVarChar(sql.MAX), question.promptText)
              .input('subtitle', sql.NVarChar(500), question.subtitle || null)
              .input('imageUrl', sql.NVarChar(500), question.imageUrl || null)
              .input('isMandatory', sql.Bit, question.isMandatory || false)
              .input('displayOrder', sql.Int, question.displayOrder)
              .input('pageNumber', sql.Int, question.pageNumber || 1)
              .input('layoutOrientation', sql.NVarChar(20), question.layoutOrientation || null)
              .input('options', sql.NVarChar(sql.MAX), optionsJson)
              .input('commentRequiredBelowRating', sql.Int, question.commentRequiredBelowRating || null)
              .input('createdBy', sql.UniqueIdentifier, data.userId)
              .query(`
                INSERT INTO Questions (
                  SurveyId, Type, PromptText, Subtitle, ImageUrl,
                  IsMandatory, DisplayOrder, PageNumber, LayoutOrientation,
                  Options, CommentRequiredBelowRating, CreatedBy, CreatedAt
                )
                VALUES (
                  @surveyId, @type, @promptText, @subtitle, @imageUrl,
                  @isMandatory, @displayOrder, @pageNumber, @layoutOrientation,
                  @options, @commentRequiredBelowRating, @createdBy, GETDATE()
                )
              `);
          }
        }
      }

      await transaction.commit();

      logger.info(`Survey ${isUpdate ? 'updated' : 'created'}`, { 
        surveyId: survey.SurveyId, 
        title: data.title 
      });

      // Fetch and return complete survey data
      const completeSurvey = await this.getSurveyById(survey.SurveyId);
      return completeSurvey;
    } catch (error) {
      await transaction.rollback();
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error saving survey:', error);
      throw error;
    }
  }

  /**
   * Validate question type
   * @param {string} type - Question type
   * @throws {ValidationError} If type is invalid
   */
  validateQuestionType(type) {
    const validTypes = ['HeroCover', 'Text', 'MultipleChoice', 'Checkbox', 'Dropdown', 'MatrixLikert', 'Rating', 'Date', 'Signature'];
    if (!validTypes.includes(type)) {
      throw new ValidationError(`Question type must be one of: ${validTypes.join(', ')}`);
    }
  }

  /**
   * Validate layout orientation
   * @param {string} orientation - Layout orientation
   * @throws {ValidationError} If orientation is invalid
   */
  validateLayoutOrientation(orientation) {
    if (orientation && !['vertical', 'horizontal'].includes(orientation)) {
      throw new ValidationError('Layout orientation must be either "vertical" or "horizontal"');
    }
  }

  /**
   * Add question to survey
   * @param {string} surveyId - Survey ID
   * @param {Object} data - Question data
   * @param {string} data.type - Question type (HeroCover, Text, MultipleChoice, Checkbox, Dropdown, MatrixLikert, Rating, Date, Signature)
   * @param {string} data.promptText - Question prompt text
   * @param {string} [data.subtitle] - Question subtitle
   * @param {string} [data.imageUrl] - Question image URL
   * @param {boolean} [data.isMandatory=false] - Is question mandatory
   * @param {number} [data.displayOrder] - Display order (auto-assigned if not provided)
   * @param {number} [data.pageNumber=1] - Page number for multi-page surveys
   * @param {string} [data.layoutOrientation] - Layout orientation (vertical/horizontal) for choice questions
   * @param {Object} [data.options] - Question options (JSON)
   * @param {number} [data.commentRequiredBelowRating] - Rating threshold for required comment
   * @param {string} data.createdBy - User ID creating the question
   * @returns {Promise<Object>} Created question
   */
  async addQuestion(surveyId, data) {
    try {
      const pool = await db.getPool();

      // Validate required fields
      if (!data.type) {
        throw new ValidationError('Question type is required');
      }

      if (!data.promptText || data.promptText.trim().length === 0) {
        throw new ValidationError('Prompt text is required');
      }

      if (!data.createdBy) {
        throw new ValidationError('CreatedBy is required');
      }

      // Validate question type
      this.validateQuestionType(data.type);

      // Validate layout orientation if provided
      if (data.layoutOrientation) {
        this.validateLayoutOrientation(data.layoutOrientation);
      }

      // Check if survey exists
      const surveyCheck = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT SurveyId, Status FROM Surveys WHERE SurveyId = @surveyId');

      if (surveyCheck.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      // Get next display order if not provided
      let displayOrder = data.displayOrder;
      if (displayOrder === undefined || displayOrder === null) {
        const orderResult = await pool.request()
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .query('SELECT ISNULL(MAX(DisplayOrder), 0) + 1 as NextOrder FROM Questions WHERE SurveyId = @surveyId');
        displayOrder = orderResult.recordset[0].NextOrder;
      }

      // Validate page number
      const pageNumber = data.pageNumber || 1;
      if (pageNumber < 1) {
        throw new ValidationError('Page number must be at least 1');
      }

      // Serialize options to JSON if provided
      let optionsJson = null;
      if (data.options) {
        optionsJson = JSON.stringify(data.options);
      }

      // Insert question
      const result = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .input('type', sql.NVarChar(50), data.type)
        .input('promptText', sql.NVarChar(sql.MAX), data.promptText)
        .input('subtitle', sql.NVarChar(500), data.subtitle || null)
        .input('imageUrl', sql.NVarChar(500), data.imageUrl || null)
        .input('isMandatory', sql.Bit, data.isMandatory || false)
        .input('displayOrder', sql.Int, displayOrder)
        .input('pageNumber', sql.Int, pageNumber)
        .input('layoutOrientation', sql.NVarChar(20), data.layoutOrientation || null)
        .input('options', sql.NVarChar(sql.MAX), optionsJson)
        .input('commentRequiredBelowRating', sql.Int, data.commentRequiredBelowRating || null)
        .input('createdBy', sql.UniqueIdentifier, data.createdBy)
        .query(`
          INSERT INTO Questions (
            SurveyId, Type, PromptText, Subtitle, ImageUrl,
            IsMandatory, DisplayOrder, PageNumber, LayoutOrientation,
            Options, CommentRequiredBelowRating, CreatedBy, CreatedAt
          )
          OUTPUT INSERTED.*
          VALUES (
            @surveyId, @type, @promptText, @subtitle, @imageUrl,
            @isMandatory, @displayOrder, @pageNumber, @layoutOrientation,
            @options, @commentRequiredBelowRating, @createdBy, GETDATE()
          )
        `);

      const question = result.recordset[0];

      // Parse options back to object
      if (question.Options) {
        question.Options = JSON.parse(question.Options);
      }

      logger.info('Question added', { questionId: question.QuestionId, surveyId });
      return question;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error adding question:', error);
      throw error;
    }
  }

  /**
   * Update question
   * @param {string} questionId - Question ID
   * @param {Object} data - Updated question data
   * @param {string} data.updatedBy - User ID updating the question
   * @returns {Promise<Object>} Updated question
   */
  async updateQuestion(questionId, data) {
    try {
      const pool = await db.getPool();

      // Check if question exists
      const questionCheck = await pool.request()
        .input('questionId', sql.UniqueIdentifier, questionId)
        .query('SELECT QuestionId, SurveyId FROM Questions WHERE QuestionId = @questionId');

      if (questionCheck.recordset.length === 0) {
        throw new NotFoundError('Question not found');
      }

      const surveyId = questionCheck.recordset[0].SurveyId;

      // Check if survey has responses (question immutability)
      const responseCheck = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT COUNT(*) as count FROM Responses WHERE SurveyId = @surveyId');

      if (responseCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot modify question: survey has responses');
      }

      // Validate question type if provided
      if (data.type) {
        this.validateQuestionType(data.type);
      }

      // Validate layout orientation if provided
      if (data.layoutOrientation) {
        this.validateLayoutOrientation(data.layoutOrientation);
      }

      // Build update query
      const updateFields = [];
      const request = pool.request();
      request.input('questionId', sql.UniqueIdentifier, questionId);

      if (data.type !== undefined) {
        updateFields.push('Type = @type');
        request.input('type', sql.NVarChar(50), data.type);
      }

      if (data.promptText !== undefined) {
        if (!data.promptText || data.promptText.trim().length === 0) {
          throw new ValidationError('Prompt text cannot be empty');
        }
        updateFields.push('PromptText = @promptText');
        request.input('promptText', sql.NVarChar(sql.MAX), data.promptText);
      }

      if (data.subtitle !== undefined) {
        updateFields.push('Subtitle = @subtitle');
        request.input('subtitle', sql.NVarChar(500), data.subtitle);
      }

      if (data.imageUrl !== undefined) {
        updateFields.push('ImageUrl = @imageUrl');
        request.input('imageUrl', sql.NVarChar(500), data.imageUrl);
      }

      if (data.isMandatory !== undefined) {
        updateFields.push('IsMandatory = @isMandatory');
        request.input('isMandatory', sql.Bit, data.isMandatory);
      }

      if (data.displayOrder !== undefined) {
        updateFields.push('DisplayOrder = @displayOrder');
        request.input('displayOrder', sql.Int, data.displayOrder);
      }

      if (data.pageNumber !== undefined) {
        if (data.pageNumber < 1) {
          throw new ValidationError('Page number must be at least 1');
        }
        updateFields.push('PageNumber = @pageNumber');
        request.input('pageNumber', sql.Int, data.pageNumber);
      }

      if (data.layoutOrientation !== undefined) {
        updateFields.push('LayoutOrientation = @layoutOrientation');
        request.input('layoutOrientation', sql.NVarChar(20), data.layoutOrientation);
      }

      if (data.options !== undefined) {
        const optionsJson = data.options ? JSON.stringify(data.options) : null;
        updateFields.push('Options = @options');
        request.input('options', sql.NVarChar(sql.MAX), optionsJson);
      }

      if (data.commentRequiredBelowRating !== undefined) {
        updateFields.push('CommentRequiredBelowRating = @commentRequiredBelowRating');
        request.input('commentRequiredBelowRating', sql.Int, data.commentRequiredBelowRating);
      }

      if (updateFields.length === 0) {
        throw new ValidationError('No fields to update');
      }

      if (data.updatedBy) {
        updateFields.push('UpdatedBy = @updatedBy');
        updateFields.push('UpdatedAt = GETDATE()');
        request.input('updatedBy', sql.UniqueIdentifier, data.updatedBy);
      } else {
        updateFields.push('UpdatedAt = GETDATE()');
      }

      const result = await request.query(`
        UPDATE Questions
        SET ${updateFields.join(', ')}
        OUTPUT INSERTED.*
        WHERE QuestionId = @questionId
      `);

      const question = result.recordset[0];

      // Parse options back to object
      if (question.Options) {
        question.Options = JSON.parse(question.Options);
      }

      logger.info('Question updated', { questionId });
      return question;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating question:', error);
      throw error;
    }
  }

  /**
   * Delete question
   * @param {string} questionId - Question ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteQuestion(questionId) {
    try {
      const pool = await db.getPool();

      // Check if question exists
      const questionCheck = await pool.request()
        .input('questionId', sql.UniqueIdentifier, questionId)
        .query('SELECT QuestionId, SurveyId FROM Questions WHERE QuestionId = @questionId');

      if (questionCheck.recordset.length === 0) {
        throw new NotFoundError('Question not found');
      }

      const surveyId = questionCheck.recordset[0].SurveyId;

      // Check if survey has responses (question immutability)
      const responseCheck = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT COUNT(*) as count FROM Responses WHERE SurveyId = @surveyId');

      if (responseCheck.recordset[0].count > 0) {
        throw new ValidationError('Cannot delete question: survey has responses');
      }

      // Delete question
      const result = await pool.request()
        .input('questionId', sql.UniqueIdentifier, questionId)
        .query('DELETE FROM Questions WHERE QuestionId = @questionId');

      logger.info('Question deleted', { questionId });
      return result.rowsAffected[0] > 0;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error deleting question:', error);
      throw error;
    }
  }

  /**
   * Reorder questions
   * @param {string} surveyId - Survey ID
   * @param {Array<{questionId: string, displayOrder: number}>} questionOrders - Array of question IDs with new display orders
   * @returns {Promise<Array>} Updated questions
   */
  async reorderQuestions(surveyId, questionOrders) {
    const pool = await db.getPool();
    const transaction = new sql.Transaction(pool);

    try {
      // Validate input
      if (!Array.isArray(questionOrders) || questionOrders.length === 0) {
        throw new ValidationError('Question orders array is required');
      }

      // Check if survey exists
      const surveyCheck = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT SurveyId FROM Surveys WHERE SurveyId = @surveyId');

      if (surveyCheck.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      // Start transaction
      await transaction.begin();

      // Update each question's display order
      for (const item of questionOrders) {
        if (!item.questionId || item.displayOrder === undefined) {
          throw new ValidationError('Each item must have questionId and displayOrder');
        }

        await new sql.Request(transaction)
          .input('questionId', sql.UniqueIdentifier, item.questionId)
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .input('displayOrder', sql.Int, item.displayOrder)
          .query(`
            UPDATE Questions
            SET DisplayOrder = @displayOrder, UpdatedAt = GETDATE()
            WHERE QuestionId = @questionId AND SurveyId = @surveyId
          `);
      }

      await transaction.commit();

      // Fetch updated questions
      const result = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT * FROM Questions
          WHERE SurveyId = @surveyId
          ORDER BY DisplayOrder
        `);

      // Parse options for each question
      const questions = result.recordset.map(q => {
        if (q.Options) {
          q.Options = JSON.parse(q.Options);
        }
        return q;
      });

      logger.info('Questions reordered', { surveyId, count: questionOrders.length });
      return questions;
    } catch (error) {
      await transaction.rollback();
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error reordering questions:', error);
      throw error;
    }
  }

  /**
   * Get questions by survey
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Array>} Array of questions
   */
  async getQuestionsBySurvey(surveyId) {
    try {
      const pool = await db.getPool();

      const result = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT * FROM Questions
          WHERE SurveyId = @surveyId
          ORDER BY PageNumber, DisplayOrder
        `);

      // Parse options for each question
      const questions = result.recordset.map(q => {
        if (q.Options) {
          q.Options = JSON.parse(q.Options);
        }
        return q;
      });

      return questions;
    } catch (error) {
      logger.error('Error getting questions:', error);
      throw error;
    }
  }

  /**
   * Generate survey link with optional URL shortening
   * @param {string} surveyId - Survey ID
   * @param {boolean} shortenUrl - Whether to generate shortened URL
   * @returns {Promise<Object>} Object with surveyLink and shortenedLink
   */
  async generateSurveyLink(surveyId, shortenUrl = false) {
    try {
      const pool = await db.getPool();

      // Verify survey exists
      const surveyResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT SurveyId, Title FROM Surveys WHERE SurveyId = @surveyId');

      if (surveyResult.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      // Generate survey link
      const surveyLink = `${config.baseUrl}/survey/${surveyId}`;
      let shortenedLink = null;

      // Generate shortened link if requested
      if (shortenUrl) {
        // Simple shortening: use first 8 characters of surveyId
        const shortCode = surveyId.substring(0, 8);
        shortenedLink = `${config.baseUrl}/s/${shortCode}`;
      }

      // Update survey with generated links
      await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .input('surveyLink', sql.NVarChar(500), surveyLink)
        .input('shortenedLink', sql.NVarChar(500), shortenedLink)
        .query(`
          UPDATE Surveys
          SET SurveyLink = @surveyLink,
              ShortenedLink = @shortenedLink,
              UpdatedAt = GETDATE()
          WHERE SurveyId = @surveyId
        `);

      logger.info(`Survey link generated for survey ${surveyId}`);

      return {
        surveyLink,
        shortenedLink
      };
    } catch (error) {
      logger.error('Error generating survey link:', error);
      throw error;
    }
  }

  /**
   * Generate QR code for survey
   * @param {string} surveyId - Survey ID
   * @returns {Promise<string>} QR code data URL
   */
  async generateQRCode(surveyId) {
    try {
      const pool = await db.getPool();

      // Verify survey exists and get link
      const surveyResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT SurveyId, SurveyLink, ShortenedLink FROM Surveys WHERE SurveyId = @surveyId');

      if (surveyResult.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      const survey = surveyResult.recordset[0];


      // Use shortened link if available, otherwise use full link
      let linkToEncode = survey.ShortenedLink || survey.SurveyLink;

      // If no link exists, generate one first
      if (!linkToEncode) {
        const linkResult = await this.generateSurveyLink(surveyId, false);
        linkToEncode = linkResult.surveyLink;
      }

      // Generate QR code as data URL
      const QRCode = require('qrcode');
      const qrCodeDataUrl = await QRCode.toDataURL(linkToEncode, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 300,
        margin: 2
      });

      // Update survey with QR code data URL
      await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .input('qrCodeDataUrl', sql.NVarChar(sql.MAX), qrCodeDataUrl)
        .query(`
          UPDATE Surveys
          SET QRCodeDataUrl = @qrCodeDataUrl,
              UpdatedAt = GETDATE()
          WHERE SurveyId = @surveyId
        `);

      logger.info(`QR code generated for survey ${surveyId}`);

      return qrCodeDataUrl;
    } catch (error) {
      logger.error('Error generating QR code:', error);
      throw error;
    }
  }

  /**
   * Generate embed code for survey
   * @param {string} surveyId - Survey ID
   * @returns {Promise<string>} Embed code (iframe snippet)
   */
  async generateEmbedCode(surveyId) {
    try {
      const pool = await db.getPool();

      // Verify survey exists and get link
      const surveyResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT SurveyId, SurveyLink, Title FROM Surveys WHERE SurveyId = @surveyId');

      if (surveyResult.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      const survey = surveyResult.recordset[0];


      // If no link exists, generate one first
      let surveyLink = survey.SurveyLink;
      if (!surveyLink) {
        const linkResult = await this.generateSurveyLink(surveyId, false);
        surveyLink = linkResult.surveyLink;
      }

      // Generate iframe embed code
      const embedCode = `<iframe src="${surveyLink}" width="100%" height="600px" frameborder="0" title="${survey.Title || 'Survey'}"></iframe>`;

      // Update survey with embed code
      await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .input('embedCode', sql.NVarChar(sql.MAX), embedCode)
        .query(`
          UPDATE Surveys
          SET EmbedCode = @embedCode,
              UpdatedAt = GETDATE()
          WHERE SurveyId = @surveyId
        `);

      logger.info(`Embed code generated for survey ${surveyId}`);

      return embedCode;
    } catch (error) {
      logger.error('Error generating embed code:', error);
      throw error;
    }
  }

  /**
   * Calculate next execution time based on frequency
   * @param {Date} scheduledDate - Initial scheduled date
   * @param {string} frequency - 'once', 'daily', 'weekly', 'monthly'
   * @param {string} scheduledTime - Time in HH:mm format (for recurring)
   * @param {number} dayOfWeek - Day of week (0=Sunday, 6=Saturday) for weekly
   * @returns {Date|null} Next execution date/time or null for 'once'
   */
  calculateNextExecution(scheduledDate, frequency, scheduledTime, dayOfWeek) {
    if (frequency === 'once') {
      return null;
    }

    const now = new Date();
    let nextExecution = new Date(scheduledDate);

    // Parse scheduled time if provided
    let hours = 0;
    let minutes = 0;
    if (scheduledTime) {
      const timeParts = scheduledTime.split(':');
      hours = parseInt(timeParts[0], 10);
      minutes = parseInt(timeParts[1], 10);
    }

    switch (frequency) {
      case 'daily':
        // Set to next day at scheduled time
        nextExecution.setDate(nextExecution.getDate() + 1);
        nextExecution.setHours(hours, minutes, 0, 0);
        break;

      case 'weekly':
        // Set to next week same day at scheduled time
        nextExecution.setDate(nextExecution.getDate() + 7);
        nextExecution.setHours(hours, minutes, 0, 0);
        break;

      case 'monthly':
        // Set to next month same date at scheduled time
        nextExecution.setMonth(nextExecution.getMonth() + 1);
        nextExecution.setHours(hours, minutes, 0, 0);
        break;

      default:
        return null;
    }

    return nextExecution;
  }

  /**
   * Schedule a survey blast email
   * @param {Object} request - Schedule blast request
   * @param {string} request.surveyId - Survey ID
   * @param {Date} request.scheduledDate - When to send the blast
   * @param {string} request.frequency - 'once', 'daily', 'weekly', 'monthly'
   * @param {string} request.scheduledTime - Time in HH:mm format (for recurring)
   * @param {number} request.dayOfWeek - Day of week (0-6) for weekly scheduling
   * @param {string} request.emailTemplate - Email template content
   * @param {boolean} request.embedCover - Whether to embed cover image in email
   * @param {Object} request.targetCriteria - Target criteria (BU, Division, Department, Function)
   * @param {string} request.createdBy - User ID who created the schedule
   * @returns {Promise<Object>} Created scheduled operation
   */
  async scheduleBlast(request) {
    try {
      const {
        surveyId,
        scheduledDate,
        frequency = 'once',
        scheduledTime = null,
        dayOfWeek = null,
        emailTemplate,
        embedCover = false,
        targetCriteria = null,
        createdBy
      } = request;

      // Validate required fields
      if (!surveyId || !scheduledDate || !emailTemplate) {
        throw new ValidationError('Survey ID, scheduled date, and email template are required');
      }

      // Validate frequency
      const validFrequencies = ['once', 'daily', 'weekly', 'monthly'];
      if (!validFrequencies.includes(frequency)) {
        throw new ValidationError(`Frequency must be one of: ${validFrequencies.join(', ')}`);
      }

      // Validate weekly scheduling has dayOfWeek
      if (frequency === 'weekly' && (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6)) {
        throw new ValidationError('Weekly scheduling requires dayOfWeek (0-6)');
      }

      // Validate recurring schedules have scheduledTime
      if (frequency !== 'once' && !scheduledTime) {
        throw new ValidationError('Recurring schedules require scheduledTime in HH:mm format');
      }

      const pool = await db.getPool();

      // Verify survey exists
      const surveyResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT SurveyId, Title FROM Surveys WHERE SurveyId = @surveyId');

      if (surveyResult.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      // Calculate next execution time
      const nextExecutionAt = this.calculateNextExecution(
        new Date(scheduledDate),
        frequency,
        scheduledTime,
        dayOfWeek
      );

      // Insert scheduled operation
      const result = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .input('operationType', sql.NVarChar(50), 'Blast')
        .input('frequency', sql.NVarChar(50), frequency)
        .input('scheduledDate', sql.DateTime2, new Date(scheduledDate))
        .input('scheduledTime', sql.Time, scheduledTime)
        .input('dayOfWeek', sql.Int, dayOfWeek)
        .input('emailTemplate', sql.NVarChar(sql.MAX), emailTemplate)
        .input('embedCover', sql.Bit, embedCover)
        .input('targetCriteria', sql.NVarChar(sql.MAX), targetCriteria ? JSON.stringify(targetCriteria) : null)
        .input('nextExecutionAt', sql.DateTime2, nextExecutionAt)
        .input('createdBy', sql.UniqueIdentifier, createdBy || null)
        .query(`
          INSERT INTO ScheduledOperations (
            SurveyId,
            OperationType,
            Frequency,
            ScheduledDate,
            ScheduledTime,
            DayOfWeek,
            EmailTemplate,
            EmbedCover,
            TargetCriteria,
            Status,
            NextExecutionAt,
            CreatedBy
          )
          OUTPUT INSERTED.*
          VALUES (
            @surveyId,
            @operationType,
            @frequency,
            @scheduledDate,
            @scheduledTime,
            @dayOfWeek,
            @emailTemplate,
            @embedCover,
            @targetCriteria,
            'Pending',
            @nextExecutionAt,
            @createdBy
          )
        `);

      const operation = result.recordset[0];

      logger.info(`Blast scheduled for survey ${surveyId}, operation ${operation.OperationId}`);

      return {
        operationId: operation.OperationId,
        surveyId: operation.SurveyId,
        operationType: operation.OperationType,
        frequency: operation.Frequency,
        scheduledDate: operation.ScheduledDate,
        scheduledTime: operation.ScheduledTime,
        dayOfWeek: operation.DayOfWeek,
        embedCover: operation.EmbedCover,
        targetCriteria: operation.TargetCriteria ? JSON.parse(operation.TargetCriteria) : null,
        status: operation.Status,
        nextExecutionAt: operation.NextExecutionAt,
        createdAt: operation.CreatedAt
      };
    } catch (error) {
      logger.error('Error scheduling blast:', error);
      throw error;
    }
  }

  /**
   * Schedule a survey reminder email
   * @param {Object} request - Schedule reminder request
   * @param {string} request.surveyId - Survey ID
   * @param {Date} request.scheduledDate - When to send the reminder
   * @param {string} request.frequency - 'once', 'daily', 'weekly', 'monthly'
   * @param {string} request.scheduledTime - Time in HH:mm format (for recurring)
   * @param {number} request.dayOfWeek - Day of week (0-6) for weekly scheduling
   * @param {string} request.emailTemplate - Email template content
   * @param {boolean} request.embedCover - Whether to embed cover image in email
   * @param {string} request.createdBy - User ID who created the schedule
   * @returns {Promise<Object>} Created scheduled operation
   */
  async scheduleReminder(request) {
    try {
      const {
        surveyId,
        scheduledDate,
        frequency = 'once',
        scheduledTime = null,
        dayOfWeek = null,
        emailTemplate,
        embedCover = false,
        createdBy
      } = request;

      // Validate required fields
      if (!surveyId || !scheduledDate || !emailTemplate) {
        throw new ValidationError('Survey ID, scheduled date, and email template are required');
      }

      // Validate frequency
      const validFrequencies = ['once', 'daily', 'weekly', 'monthly'];
      if (!validFrequencies.includes(frequency)) {
        throw new ValidationError(`Frequency must be one of: ${validFrequencies.join(', ')}`);
      }

      // Validate weekly scheduling has dayOfWeek
      if (frequency === 'weekly' && (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6)) {
        throw new ValidationError('Weekly scheduling requires dayOfWeek (0-6)');
      }

      // Validate recurring schedules have scheduledTime
      if (frequency !== 'once' && !scheduledTime) {
        throw new ValidationError('Recurring schedules require scheduledTime in HH:mm format');
      }

      const pool = await db.getPool();

      // Verify survey exists
      const surveyResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT SurveyId, Title FROM Surveys WHERE SurveyId = @surveyId');

      if (surveyResult.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      // Calculate next execution time
      const nextExecutionAt = this.calculateNextExecution(
        new Date(scheduledDate),
        frequency,
        scheduledTime,
        dayOfWeek
      );

      // Insert scheduled operation
      const result = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .input('operationType', sql.NVarChar(50), 'Reminder')
        .input('frequency', sql.NVarChar(50), frequency)
        .input('scheduledDate', sql.DateTime2, new Date(scheduledDate))
        .input('scheduledTime', sql.Time, scheduledTime)
        .input('dayOfWeek', sql.Int, dayOfWeek)
        .input('emailTemplate', sql.NVarChar(sql.MAX), emailTemplate)
        .input('embedCover', sql.Bit, embedCover)
        .input('nextExecutionAt', sql.DateTime2, nextExecutionAt)
        .input('createdBy', sql.UniqueIdentifier, createdBy || null)
        .query(`
          INSERT INTO ScheduledOperations (
            SurveyId,
            OperationType,
            Frequency,
            ScheduledDate,
            ScheduledTime,
            DayOfWeek,
            EmailTemplate,
            EmbedCover,
            TargetCriteria,
            Status,
            NextExecutionAt,
            CreatedBy
          )
          OUTPUT INSERTED.*
          VALUES (
            @surveyId,
            @operationType,
            @frequency,
            @scheduledDate,
            @scheduledTime,
            @dayOfWeek,
            @emailTemplate,
            @embedCover,
            NULL,
            'Pending',
            @nextExecutionAt,
            @createdBy
          )
        `);

      const operation = result.recordset[0];

      logger.info(`Reminder scheduled for survey ${surveyId}, operation ${operation.OperationId}`);

      return {
        operationId: operation.OperationId,
        surveyId: operation.SurveyId,
        operationType: operation.OperationType,
        frequency: operation.Frequency,
        scheduledDate: operation.ScheduledDate,
        scheduledTime: operation.ScheduledTime,
        dayOfWeek: operation.DayOfWeek,
        embedCover: operation.EmbedCover,
        status: operation.Status,
        nextExecutionAt: operation.NextExecutionAt,
        createdAt: operation.CreatedAt
      };
    } catch (error) {
      logger.error('Error scheduling reminder:', error);
      throw error;
    }
  }

  /**
   * Get scheduled operations for a survey
   * @param {string} surveyId - Survey ID
   * @param {Object} filter - Optional filters
   * @param {string} filter.operationType - Filter by operation type ('Blast' or 'Reminder')
   * @param {string} filter.status - Filter by status
   * @returns {Promise<Array>} List of scheduled operations
   */
  async getScheduledOperations(surveyId, filter = {}) {
    try {
      const pool = await db.getPool();

      let query = `
        SELECT 
          so.OperationId,
          so.SurveyId,
          so.OperationType,
          so.Frequency,
          so.ScheduledDate,
          so.ScheduledTime,
          so.DayOfWeek,
          so.EmailTemplate,
          so.EmbedCover,
          so.TargetCriteria,
          so.Status,
          so.NextExecutionAt,
          so.LastExecutedAt,
          so.ExecutionCount,
          so.ErrorMessage,
          so.CreatedAt,
          so.CreatedBy,
          u.DisplayName as CreatedByName
        FROM ScheduledOperations so
        LEFT JOIN Users u ON so.CreatedBy = u.UserId
        WHERE so.SurveyId = @surveyId
      `;

      const request = pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId);

      // Add optional filters
      if (filter.operationType) {
        query += ' AND so.OperationType = @operationType';
        request.input('operationType', sql.NVarChar(50), filter.operationType);
      }

      if (filter.status) {
        query += ' AND so.Status = @status';
        request.input('status', sql.NVarChar(50), filter.status);
      }

      query += ' ORDER BY so.ScheduledDate DESC, so.CreatedAt DESC';

      const result = await request.query(query);

      const operations = result.recordset.map(op => ({
        operationId: op.OperationId,
        surveyId: op.SurveyId,
        operationType: op.OperationType,
        frequency: op.Frequency,
        scheduledDate: op.ScheduledDate,
        scheduledTime: op.ScheduledTime,
        dayOfWeek: op.DayOfWeek,
        emailTemplate: op.EmailTemplate,
        embedCover: op.EmbedCover,
        targetCriteria: op.TargetCriteria ? JSON.parse(op.TargetCriteria) : null,
        status: op.Status,
        nextExecutionAt: op.NextExecutionAt,
        lastExecutedAt: op.LastExecutedAt,
        executionCount: op.ExecutionCount,
        errorMessage: op.ErrorMessage,
        createdAt: op.CreatedAt,
        createdBy: op.CreatedBy,
        createdByName: op.CreatedByName
      }));

      logger.info(`Retrieved ${operations.length} scheduled operations for survey ${surveyId}`);

      return operations;
    } catch (error) {
      logger.error('Error getting scheduled operations:', error);
      throw error;
    }
  }

  /**
   * Cancel a scheduled operation
   * @param {string} operationId - Operation ID to cancel
   * @returns {Promise<Object>} Updated operation
   */
  async cancelScheduledOperation(operationId) {
    try {
      const pool = await db.getPool();

      // Check if operation exists and is cancellable
      const checkResult = await pool.request()
        .input('operationId', sql.UniqueIdentifier, operationId)
        .query(`
          SELECT OperationId, Status, OperationType, SurveyId
          FROM ScheduledOperations
          WHERE OperationId = @operationId
        `);

      if (checkResult.recordset.length === 0) {
        throw new NotFoundError('Scheduled operation not found');
      }

      const operation = checkResult.recordset[0];

      // Can only cancel Pending or Failed operations
      if (operation.Status === 'Completed') {
        throw new ConflictError('Cannot cancel completed operation');
      }

      if (operation.Status === 'Cancelled') {
        throw new ConflictError('Operation is already cancelled');
      }

      if (operation.Status === 'Running') {
        throw new ConflictError('Cannot cancel operation that is currently running');
      }

      // Update status to Cancelled
      const result = await pool.request()
        .input('operationId', sql.UniqueIdentifier, operationId)
        .query(`
          UPDATE ScheduledOperations
          SET Status = 'Cancelled',
              NextExecutionAt = NULL
          OUTPUT INSERTED.*
          WHERE OperationId = @operationId
        `);

      const updatedOperation = result.recordset[0];

      logger.info(`Cancelled scheduled operation ${operationId} for survey ${operation.SurveyId}`);

      return {
        operationId: updatedOperation.OperationId,
        surveyId: updatedOperation.SurveyId,
        operationType: updatedOperation.OperationType,
        status: updatedOperation.Status,
        frequency: updatedOperation.Frequency,
        scheduledDate: updatedOperation.ScheduledDate,
        nextExecutionAt: updatedOperation.NextExecutionAt
      };
    } catch (error) {
      logger.error('Error cancelling scheduled operation:', error);
      throw error;
    }
  }

  /**
   * Validate image file
   * @param {Object} file - File object with buffer, mimetype, size
   * @throws {ValidationError} If file is invalid
   */
  validateImageFile(file) {
    if (!file || !file.buffer) {
      throw new ValidationError('No file provided');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new ValidationError('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed');
    }

    // Validate file size (max from config or default 10MB)
    const maxSizeMB = config.upload.maxFileSizeMB || 10;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new ValidationError(`File size exceeds maximum allowed size of ${maxSizeMB}MB`);
    }
  }

  /**
   * Generate unique filename
   * @param {string} originalName - Original filename
   * @returns {string} Unique filename
   */
  generateUniqueFilename(originalName) {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalName);
    return `${timestamp}-${randomString}${ext}`;
  }

  /**
   * Ensure upload directory exists
   * @param {string} directory - Directory path
   */
  async ensureUploadDirectory(directory) {
    try {
      await fs.access(directory);
    } catch (error) {
      // Directory doesn't exist, create it
      await fs.mkdir(directory, { recursive: true });
      logger.info(`Created upload directory: ${directory}`);
    }
  }

  /**
   * Save file to disk
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Filename
   * @param {string} subdirectory - Subdirectory (e.g., 'surveys', 'questions')
   * @returns {Promise<string>} File URL
   */
  async saveFile(buffer, filename, subdirectory) {
    const uploadDir = config.upload.directory || 'uploads';
    const fullPath = path.join(uploadDir, subdirectory);
    
    await this.ensureUploadDirectory(fullPath);
    
    const filePath = path.join(fullPath, filename);
    await fs.writeFile(filePath, buffer);
    
    // Return URL path (relative to server root)
    const baseUrl = config.baseUrl || 'http://localhost:3000';
    return `${baseUrl}/${subdirectory}/${filename}`;
  }

  /**
   * Delete file from disk
   * @param {string} fileUrl - File URL
   */
  async deleteFile(fileUrl) {
    try {
      if (!fileUrl) return;
      
      // Extract filename from URL
      const urlParts = fileUrl.split('/');
      const filename = urlParts[urlParts.length - 1];
      const subdirectory = urlParts[urlParts.length - 2];
      
      const uploadDir = config.upload.directory || 'uploads';
      const filePath = path.join(uploadDir, subdirectory, filename);
      
      await fs.unlink(filePath);
      logger.info(`Deleted file: ${filePath}`);
    } catch (error) {
      logger.warn(`Failed to delete file: ${fileUrl}`, error);
      // Don't throw error - file deletion is not critical
    }
  }

  /**
   * Upload hero image for survey
   * @param {string} surveyId - Survey ID
   * @param {Object} file - File object with buffer, mimetype, originalname, size
   * @returns {Promise<Object>} Updated survey configuration with hero image URL
   */
  async uploadHeroImage(surveyId, file) {
    const pool = await db.getPool();

    try {
      // Validate file
      this.validateImageFile(file);

      // Check if survey exists
      const survey = await this.getSurveyById(surveyId);
      if (!survey) {
        throw new NotFoundError(`Survey with ID ${surveyId} not found`);
      }

      // Generate unique filename and save file
      const filename = this.generateUniqueFilename(file.originalname);
      const imageUrl = await this.saveFile(file.buffer, filename, 'surveys');

      // Get existing configuration
      const configResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT * FROM SurveyConfiguration WHERE SurveyId = @surveyId');

      let config;
      if (configResult.recordset.length > 0) {
        // Update existing configuration
        const oldImageUrl = configResult.recordset[0].HeroImageUrl;
        
        await pool.request()
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .input('heroImageUrl', sql.NVarChar(500), imageUrl)
          .query('UPDATE SurveyConfiguration SET HeroImageUrl = @heroImageUrl WHERE SurveyId = @surveyId');

        // Delete old image if exists
        if (oldImageUrl) {
          await this.deleteFile(oldImageUrl);
        }

        config = { ...configResult.recordset[0], HeroImageUrl: imageUrl };
      } else {
        // Create new configuration
        const configId = crypto.randomUUID();
        await pool.request()
          .input('configId', sql.UniqueIdentifier, configId)
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .input('heroImageUrl', sql.NVarChar(500), imageUrl)
          .query(`
            INSERT INTO SurveyConfiguration (ConfigId, SurveyId, HeroImageUrl)
            VALUES (@configId, @surveyId, @heroImageUrl)
          `);

        config = { ConfigId: configId, SurveyId: surveyId, HeroImageUrl: imageUrl };
      }

      logger.info(`Hero image uploaded for survey ${surveyId}: ${imageUrl}`);
      return config;
    } catch (error) {
      logger.error('Error uploading hero image:', error);
      throw error;
    }
  }

  /**
   * Upload logo for survey
   * @param {string} surveyId - Survey ID
   * @param {Object} file - File object with buffer, mimetype, originalname, size
   * @returns {Promise<Object>} Updated survey configuration with logo URL
   */
  async uploadLogo(surveyId, file) {
    const pool = await db.getPool();

    try {
      // Validate file
      this.validateImageFile(file);

      // Check if survey exists
      const survey = await this.getSurveyById(surveyId);
      if (!survey) {
        throw new NotFoundError(`Survey with ID ${surveyId} not found`);
      }

      // Generate unique filename and save file
      const filename = this.generateUniqueFilename(file.originalname);
      const imageUrl = await this.saveFile(file.buffer, filename, 'surveys');

      // Get existing configuration
      const configResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT * FROM SurveyConfiguration WHERE SurveyId = @surveyId');

      let config;
      if (configResult.recordset.length > 0) {
        // Update existing configuration
        const oldImageUrl = configResult.recordset[0].LogoUrl;
        
        await pool.request()
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .input('logoUrl', sql.NVarChar(500), imageUrl)
          .query('UPDATE SurveyConfiguration SET LogoUrl = @logoUrl WHERE SurveyId = @surveyId');

        // Delete old image if exists
        if (oldImageUrl) {
          await this.deleteFile(oldImageUrl);
        }

        config = { ...configResult.recordset[0], LogoUrl: imageUrl };
      } else {
        // Create new configuration
        const configId = crypto.randomUUID();
        await pool.request()
          .input('configId', sql.UniqueIdentifier, configId)
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .input('logoUrl', sql.NVarChar(500), imageUrl)
          .query(`
            INSERT INTO SurveyConfiguration (ConfigId, SurveyId, LogoUrl)
            VALUES (@configId, @surveyId, @logoUrl)
          `);

        config = { ConfigId: configId, SurveyId: surveyId, LogoUrl: imageUrl };
      }

      logger.info(`Logo uploaded for survey ${surveyId}: ${imageUrl}`);
      return config;
    } catch (error) {
      logger.error('Error uploading logo:', error);
      throw error;
    }
  }

  /**
   * Upload background image for survey
   * @param {string} surveyId - Survey ID
   * @param {Object} file - File object with buffer, mimetype, originalname, size
   * @returns {Promise<Object>} Updated survey configuration with background image URL
   */
  async uploadBackgroundImage(surveyId, file) {
    const pool = await db.getPool();

    try {
      // Validate file
      this.validateImageFile(file);

      // Check if survey exists
      const survey = await this.getSurveyById(surveyId);
      if (!survey) {
        throw new NotFoundError(`Survey with ID ${surveyId} not found`);
      }

      // Generate unique filename and save file
      const filename = this.generateUniqueFilename(file.originalname);
      const imageUrl = await this.saveFile(file.buffer, filename, 'surveys');

      // Get existing configuration
      const configResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query('SELECT * FROM SurveyConfiguration WHERE SurveyId = @surveyId');

      let config;
      if (configResult.recordset.length > 0) {
        // Update existing configuration
        const oldImageUrl = configResult.recordset[0].BackgroundImageUrl;
        
        await pool.request()
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .input('backgroundImageUrl', sql.NVarChar(500), imageUrl)
          .query('UPDATE SurveyConfiguration SET BackgroundImageUrl = @backgroundImageUrl WHERE SurveyId = @surveyId');

        // Delete old image if exists
        if (oldImageUrl) {
          await this.deleteFile(oldImageUrl);
        }

        config = { ...configResult.recordset[0], BackgroundImageUrl: imageUrl };
      } else {
        // Create new configuration
        const configId = crypto.randomUUID();
        await pool.request()
          .input('configId', sql.UniqueIdentifier, configId)
          .input('surveyId', sql.UniqueIdentifier, surveyId)
          .input('backgroundImageUrl', sql.NVarChar(500), imageUrl)
          .query(`
            INSERT INTO SurveyConfiguration (ConfigId, SurveyId, BackgroundImageUrl)
            VALUES (@configId, @surveyId, @backgroundImageUrl)
          `);

        config = { ConfigId: configId, SurveyId: surveyId, BackgroundImageUrl: imageUrl };
      }

      logger.info(`Background image uploaded for survey ${surveyId}: ${imageUrl}`);
      return config;
    } catch (error) {
      logger.error('Error uploading background image:', error);
      throw error;
    }
  }

  /**
   * Upload image for question
   * @param {string} questionId - Question ID
   * @param {Object} file - File object with buffer, mimetype, originalname, size
   * @returns {Promise<Object>} Updated question with image URL
   */
  async uploadQuestionImage(questionId, file) {
    const pool = await db.getPool();

    try {
      // Validate file
      this.validateImageFile(file);

      // Check if question exists
      const questionResult = await pool.request()
        .input('questionId', sql.UniqueIdentifier, questionId)
        .query('SELECT * FROM Questions WHERE QuestionId = @questionId');

      if (questionResult.recordset.length === 0) {
        throw new NotFoundError(`Question with ID ${questionId} not found`);
      }

      const question = questionResult.recordset[0];

      // Generate unique filename and save file
      const filename = this.generateUniqueFilename(file.originalname);
      const imageUrl = await this.saveFile(file.buffer, filename, 'questions');

      // Delete old image if exists
      if (question.ImageUrl) {
        await this.deleteFile(question.ImageUrl);
      }

      // Update question with image URL
      await pool.request()
        .input('questionId', sql.UniqueIdentifier, questionId)
        .input('imageUrl', sql.NVarChar(500), imageUrl)
        .query('UPDATE Questions SET ImageUrl = @imageUrl WHERE QuestionId = @questionId');

      logger.info(`Question image uploaded for question ${questionId}: ${imageUrl}`);
      
      return {
        ...question,
        ImageUrl: imageUrl
      };
    } catch (error) {
      logger.error('Error uploading question image:', error);
      throw error;
    }
  }

  /**
   * Upload image for question option
   * @param {string} questionId - Question ID
   * @param {number} optionIndex - Option index (0-based)
   * @param {Object} file - File object with buffer, mimetype, originalname, size
   * @returns {Promise<Object>} Updated question with option image URL
   */
  async uploadOptionImage(questionId, optionIndex, file) {
    const pool = await db.getPool();

    try {
      // Validate file
      this.validateImageFile(file);

      // Validate option index
      if (typeof optionIndex !== 'number' || optionIndex < 0) {
        throw new ValidationError('Invalid option index');
      }

      // Check if question exists
      const questionResult = await pool.request()
        .input('questionId', sql.UniqueIdentifier, questionId)
        .query('SELECT * FROM Questions WHERE QuestionId = @questionId');

      if (questionResult.recordset.length === 0) {
        throw new NotFoundError(`Question with ID ${questionId} not found`);
      }

      const question = questionResult.recordset[0];

      // Validate question type (only MultipleChoice and Checkbox support option images)
      if (question.Type !== 'MultipleChoice' && question.Type !== 'Checkbox') {
        throw new ValidationError('Option images are only supported for MultipleChoice and Checkbox question types');
      }

      // Parse existing options
      let options = {};
      if (question.Options) {
        try {
          options = typeof question.Options === 'string' 
            ? JSON.parse(question.Options) 
            : question.Options;
        } catch (error) {
          logger.warn(`Failed to parse options for question ${questionId}:`, error);
          options = {};
        }
      }

      // Ensure options array exists
      if (!options.options || !Array.isArray(options.options)) {
        throw new ValidationError('Question does not have valid options array');
      }

      // Validate option index is within bounds
      if (optionIndex >= options.options.length) {
        throw new ValidationError(`Option index ${optionIndex} is out of bounds (max: ${options.options.length - 1})`);
      }

      // Generate unique filename and save file
      const filename = this.generateUniqueFilename(file.originalname);
      const imageUrl = await this.saveFile(file.buffer, filename, 'options');

      // Get the option (could be string or object)
      const option = options.options[optionIndex];
      let oldImageUrl = null;

      // Update option with image URL
      if (typeof option === 'string') {
        // Convert string option to object with image
        options.options[optionIndex] = {
          text: option,
          imageUrl: imageUrl
        };
      } else if (typeof option === 'object') {
        // Update existing object
        oldImageUrl = option.imageUrl;
        options.options[optionIndex] = {
          ...option,
          imageUrl: imageUrl
        };
      }

      // Delete old image if exists
      if (oldImageUrl) {
        await this.deleteFile(oldImageUrl);
      }

      // Update question with new options
      await pool.request()
        .input('questionId', sql.UniqueIdentifier, questionId)
        .input('options', sql.NVarChar(sql.MAX), JSON.stringify(options))
        .query('UPDATE Questions SET Options = @options WHERE QuestionId = @questionId');

      logger.info(`Option image uploaded for question ${questionId}, option ${optionIndex}: ${imageUrl}`);
      
      return {
        ...question,
        Options: options
      };
    } catch (error) {
      logger.error('Error uploading option image:', error);
      throw error;
    }
  }

  /**
   * Generate preview of survey with applied styles
   * @param {string} surveyId - Survey ID
   * @returns {Promise<Object>} Survey preview data with configuration and questions
   */
  async generatePreview(surveyId) {
    try {
      const pool = await db.getPool();

      // Get complete survey data with configuration
      const surveyResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT 
            s.*,
            sc.ConfigId, sc.HeroTitle, sc.HeroSubtitle, sc.HeroImageUrl,
            sc.LogoUrl, sc.BackgroundColor, sc.BackgroundImageUrl,
            sc.PrimaryColor, sc.SecondaryColor, sc.FontFamily, sc.ButtonStyle,
            sc.ShowProgressBar, sc.ShowPageNumbers, sc.MultiPage
          FROM Surveys s
          LEFT JOIN SurveyConfiguration sc ON s.SurveyId = sc.SurveyId
          WHERE s.SurveyId = @surveyId
        `);

      if (surveyResult.recordset.length === 0) {
        throw new NotFoundError('Survey not found');
      }

      const row = surveyResult.recordset[0];

      // Build survey preview object
      const preview = {
        surveyId: row.SurveyId,
        title: row.Title,
        description: row.Description,
        startDate: row.StartDate,
        endDate: row.EndDate,
        status: row.Status,
        targetRespondents: row.TargetRespondents,
        targetScore: row.TargetScore,
        configuration: {
          heroTitle: row.HeroTitle,
          heroSubtitle: row.HeroSubtitle,
          heroImageUrl: row.HeroImageUrl,
          logoUrl: row.LogoUrl,
          backgroundColor: row.BackgroundColor,
          backgroundImageUrl: row.BackgroundImageUrl,
          primaryColor: row.PrimaryColor,
          secondaryColor: row.SecondaryColor,
          fontFamily: row.FontFamily,
          buttonStyle: row.ButtonStyle,
          showProgressBar: row.ShowProgressBar,
          showPageNumbers: row.ShowPageNumbers,
          multiPage: row.MultiPage
        },
        readOnly: true // Indicate this is a preview
      };

      // Get questions for the survey
      const questionsResult = await pool.request()
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          SELECT * FROM Questions
          WHERE SurveyId = @surveyId
          ORDER BY PageNumber, DisplayOrder
        `);

      // Parse options for each question
      const questions = questionsResult.recordset.map(q => {
        const question = {
          questionId: q.QuestionId,
          type: q.Type,
          promptText: q.PromptText,
          subtitle: q.Subtitle,
          imageUrl: q.ImageUrl,
          isMandatory: q.IsMandatory,
          displayOrder: q.DisplayOrder,
          pageNumber: q.PageNumber,
          layoutOrientation: q.LayoutOrientation,
          commentRequiredBelowRating: q.CommentRequiredBelowRating
        };

        if (q.Options) {
          try {
            question.options = JSON.parse(q.Options);
          } catch (e) {
            logger.warn(`Failed to parse options for question ${q.QuestionId}`, e);
            question.options = null;
          }
        }

        return question;
      });

      // Organize questions by pages if multi-page
      if (preview.configuration.multiPage) {
        const pages = {};
        questions.forEach(q => {
          const pageNum = q.pageNumber || 1;
          if (!pages[pageNum]) {
            pages[pageNum] = [];
          }
          pages[pageNum].push(q);
        });
        preview.pages = pages;
        preview.totalPages = Object.keys(pages).length;
      } else {
        preview.questions = questions;
      }

      // Generate CSS styles based on configuration
      preview.styles = this.generatePreviewStyles(preview.configuration);

      logger.info('Survey preview generated', { surveyId });
      return preview;
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error generating survey preview:', error);
      throw error;
    }
  }

  /**
   * Generate CSS styles from survey configuration
   * @param {Object} config - Survey configuration
   * @returns {Object} CSS style object
   * @private
   */
  generatePreviewStyles(config) {
    const styles = {
      backgroundColor: config.backgroundColor || '#ffffff',
      backgroundImage: config.backgroundImageUrl ? `url(${config.backgroundImageUrl})` : 'none',
      primaryColor: config.primaryColor || '#007bff',
      secondaryColor: config.secondaryColor || '#6c757d',
      fontFamily: config.fontFamily || 'Arial, sans-serif',
      buttonStyle: config.buttonStyle || 'rounded'
    };

    // Generate CSS string for easy application
    styles.cssText = `
      body {
        background-color: ${styles.backgroundColor};
        ${styles.backgroundImage !== 'none' ? `background-image: ${styles.backgroundImage};` : ''}
        background-size: cover;
        background-position: center;
        font-family: ${styles.fontFamily};
      }
      .btn-primary {
        background-color: ${styles.primaryColor};
        border-color: ${styles.primaryColor};
        ${styles.buttonStyle === 'rounded' ? 'border-radius: 0.25rem;' : ''}
        ${styles.buttonStyle === 'pill' ? 'border-radius: 50rem;' : ''}
        ${styles.buttonStyle === 'square' ? 'border-radius: 0;' : ''}
      }
      .btn-secondary {
        background-color: ${styles.secondaryColor};
        border-color: ${styles.secondaryColor};
      }
      .progress-bar {
        background-color: ${styles.primaryColor};
      }
    `.trim();

    return styles;
  }
}

const surveyService = new SurveyService();

module.exports = surveyService;
module.exports.SurveyService = SurveyService;
module.exports.ValidationError = ValidationError;
module.exports.ConflictError = ConflictError;
module.exports.NotFoundError = NotFoundError;


















