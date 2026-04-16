function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function resolveSurveyIdentifier(db, sql, NotFoundError, surveyIdentifier) {
  const normalizedIdentifier = String(surveyIdentifier || '').trim();
  if (!normalizedIdentifier) {
    throw new NotFoundError('Survey not found');
  }

  if (isUuid(normalizedIdentifier)) {
    return normalizedIdentifier;
  }

  const surveyNo = Number.parseInt(normalizedIdentifier, 10);
  if (!Number.isInteger(surveyNo) || surveyNo <= 0) {
    throw new NotFoundError('Survey not found');
  }

  const pool = await db.getPool();
  const result = await pool.request()
    .input('surveyNo', sql.Int, surveyNo)
    .query(`
      SELECT TOP 1 SurveyId
      FROM Surveys
      WHERE SurveyNo = @surveyNo
    `);

  if (result.recordset.length === 0) {
    throw new NotFoundError('Survey not found');
  }

  return result.recordset[0].SurveyId;
}

async function getSurveys(db, sql, filter = {}) {
  const pool = await db.getPool();
  const request = pool.request();

  let query = `
    SELECT 
      s.*,
      CASE
        WHEN s.Status = 'Active' AND s.EndDate IS NOT NULL AND s.EndDate < GETDATE() THEN 'Closed'
        ELSE s.Status
      END AS EffectiveStatus,
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
        SELECT ', ' + u2.Username
        FROM SurveyAdminAssignments saa2
        INNER JOIN Users u2 ON u2.UserId = saa2.AdminUserId
        WHERE saa2.SurveyId = s.SurveyId
        FOR XML PATH(''), TYPE
      ).value('.', 'NVARCHAR(MAX)'), 1, 2, ''), '') AS AssignedAdminUsernames,
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
      SELECT
        SurveyId,
        COUNT(DISTINCT CASE
          WHEN NULLIF(LTRIM(RTRIM(RespondentEmail)), '') IS NOT NULL
            THEN LOWER(LTRIM(RTRIM(RespondentEmail)))
          ELSE CONCAT(
            LOWER(COALESCE(LTRIM(RTRIM(RespondentName)), '')),
            '|', COALESCE(CONVERT(NVARCHAR(36), BusinessUnitId), ''),
            '|', COALESCE(CONVERT(NVARCHAR(36), DivisionId), ''),
            '|', COALESCE(CONVERT(NVARCHAR(36), DepartmentId), ''),
            '|', COALESCE(CONVERT(NVARCHAR(36), PublishCycleId), ''),
            '|', COALESCE(LTRIM(RTRIM(IpAddress)), '')
          )
        END) AS RespondentCount
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
        SELECT 1
        FROM SurveyAdminAssignments saaFilter
        INNER JOIN Users assignedFilterUser ON assignedFilterUser.UserId = saaFilter.AdminUserId
        WHERE saaFilter.SurveyId = s.SurveyId
          AND (
            saaFilter.AdminUserId = @assignedAdminUuid
            OR assignedFilterUser.Username = @assignedAdminUsername
          )
      )
      OR s.AssignedAdminId = @assignedAdminUuid
      OR admin.Username = @assignedAdminUsername
    )`;
    request.input(
      'assignedAdminId',
      sql.UniqueIdentifier,
      isUuid(filter.assignedAdminId) ? filter.assignedAdminId : null,
    );
    request.input(
      'assignedAdminUuid',
      sql.UniqueIdentifier,
      isUuid(filter.assignedAdminId) ? filter.assignedAdminId : null,
    );
    request.input('assignedAdminUsername', sql.NVarChar(50), String(filter.assignedAdminId || '').trim());
  }

  query += ' ORDER BY s.CreatedAt DESC';

  const result = await request.query(query);
  return result.recordset.map(mapSurveyListRow);
}

function mapSurveyConfiguration(row) {
  return {
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

function mapSurveyListRow(row) {
  const survey = {
    SurveyId: row.SurveyId,
    SurveyNo: row.SurveyNo || null,
    Title: row.Title,
    Description: row.Description,
    StartDate: row.StartDate,
    EndDate: row.EndDate,
    Status: row.EffectiveStatus || row.Status,
    AssignedAdminId: row.AssignedAdminId,
    AssignedAdminName: row.AssignedAdminName || null,
    AssignedAdminNames: row.AssignedAdminNames
      ? row.AssignedAdminNames.split(',').map((name) => name.trim()).filter(Boolean)
      : (row.AssignedAdminName ? [row.AssignedAdminName] : []),
    AssignedAdminUsernames: row.AssignedAdminUsernames
      ? row.AssignedAdminUsernames.split(',').map((name) => name.trim()).filter(Boolean)
      : [],
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
    survey.configuration = mapSurveyConfiguration(row);
  }

  return survey;
}

async function getSurveyById(db, sql, NotFoundError, surveyIdentifier) {
  const surveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyIdentifier);
  const pool = await db.getPool();
  const result = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query(`
      SELECT 
        s.*,
        CASE
          WHEN s.Status = 'Active' AND s.EndDate IS NOT NULL AND s.EndDate < GETDATE() THEN 'Closed'
          ELSE s.Status
        END AS EffectiveStatus,
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
          SELECT ', ' + u2.Username
          FROM SurveyAdminAssignments saa2
          INNER JOIN Users u2 ON u2.UserId = saa2.AdminUserId
          WHERE saa2.SurveyId = s.SurveyId
          FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, ''), '') AS AssignedAdminUsernames,
        NULLIF(STUFF((
          SELECT ',' + CAST(saa2.AdminUserId AS NVARCHAR(36))
          FROM SurveyAdminAssignments saa2
          WHERE saa2.SurveyId = s.SurveyId
          FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 1, ''), '') AS AssignedAdminIdsCsv,
        sc.ConfigId, sc.HeroTitle, sc.HeroSubtitle, sc.HeroImageUrl,
        sc.LogoUrl, sc.BackgroundColor, sc.BackgroundImageUrl,
        sc.PrimaryColor, sc.SecondaryColor, sc.FontFamily, sc.ButtonStyle,
        sc.ShowProgressBar, sc.ShowPageNumbers, sc.MultiPage
      FROM Surveys s
      LEFT JOIN Users admin ON admin.UserId = s.AssignedAdminId
      LEFT JOIN SurveyConfiguration sc ON s.SurveyId = sc.SurveyId
      WHERE s.SurveyId = @surveyId
    `);

  if (result.recordset.length === 0) {
    throw new NotFoundError('Survey not found');
  }

  const row = result.recordset[0];
  const survey = {
    SurveyId: row.SurveyId,
    SurveyNo: row.SurveyNo || null,
    Title: row.Title,
    Description: row.Description,
    StartDate: row.StartDate,
    EndDate: row.EndDate,
    Status: row.EffectiveStatus || row.Status,
    AssignedAdminId: row.AssignedAdminId,
    AssignedAdminName: row.AssignedAdminName || null,
    AssignedAdminNames: row.AssignedAdminNames
      ? row.AssignedAdminNames.split(',').map((name) => name.trim()).filter(Boolean)
      : (row.AssignedAdminName ? [row.AssignedAdminName] : []),
    AssignedAdminUsernames: row.AssignedAdminUsernames
      ? row.AssignedAdminUsernames.split(',').map((name) => name.trim()).filter(Boolean)
      : [],
    AssignedAdminIds: row.AssignedAdminIdsCsv
      ? row.AssignedAdminIdsCsv.split(',').map((id) => id.trim()).filter(Boolean)
      : (row.AssignedAdminId ? [String(row.AssignedAdminId)] : []),
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
    survey.configuration = mapSurveyConfiguration(row);
  }

  const questionsResult = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query(`
      SELECT * FROM Questions
      WHERE SurveyId = @surveyId
      ORDER BY PageNumber, DisplayOrder
    `);

  const questions = questionsResult.recordset.map((question) => {
    if (question.Options) {
      question.Options = JSON.parse(question.Options);
    }
    return question;
  });

  if (survey.configuration && survey.configuration.MultiPage) {
    const pages = {};
    questions.forEach((question) => {
      const pageNum = question.PageNumber || 1;
      if (!pages[pageNum]) {
        pages[pageNum] = [];
      }
      pages[pageNum].push(question);
    });
    survey.pages = pages;
  }

  survey.questions = questions;
  return survey;
}

async function updateSurveyConfig(db, sql, errors, surveyIdentifier, config) {
  const { NotFoundError, ValidationError } = errors;
  const surveyId = await resolveSurveyIdentifier(db, sql, NotFoundError, surveyIdentifier);
  const pool = await db.getPool();

  const surveyCheck = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT SurveyId FROM Surveys WHERE SurveyId = @surveyId');
  if (surveyCheck.recordset.length === 0) {
    throw new NotFoundError('Survey not found');
  }

  const configCheck = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT ConfigId FROM SurveyConfiguration WHERE SurveyId = @surveyId');
  if (configCheck.recordset.length === 0) {
    throw new NotFoundError('Survey configuration not found');
  }

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

  return result.recordset[0];
}

module.exports = {
  getSurveyById,
  getSurveys,
  resolveSurveyIdentifier,
  updateSurveyConfig
};
