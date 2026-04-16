const sql = require('../../database/sql-client');
const db = require('../../database/connection');
const logger = require('../../config/logger');
const { NotFoundError } = require('./errors');

function generatePreviewStyles(config) {
  const styles = {
    backgroundColor: config.backgroundColor || '#ffffff',
    backgroundImage: config.backgroundImageUrl ? `url(${config.backgroundImageUrl})` : 'none',
    primaryColor: config.primaryColor || '#007bff',
    secondaryColor: config.secondaryColor || '#6c757d',
    fontFamily: config.fontFamily || 'Arial, sans-serif',
    buttonStyle: config.buttonStyle || 'rounded'
  };

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

async function generateSurveyPreview(surveyId, buildStyles = generatePreviewStyles) {
  const pool = await db.getPool();
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
    readOnly: true
  };

  const questionsResult = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query(`
      SELECT * FROM Questions
      WHERE SurveyId = @surveyId
      ORDER BY PageNumber, DisplayOrder
    `);

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
      } catch (error) {
        logger.warn(`Failed to parse options for question ${q.QuestionId}`, error);
        question.options = null;
      }
    }

    return question;
  });

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

  preview.styles = buildStyles(preview.configuration);
  logger.info('Survey preview generated', { surveyId });
  return preview;
}

module.exports = {
  generatePreviewStyles,
  generateSurveyPreview
};
