async function generateSurveyLink(db, sql, config, NotFoundError, logger, surveyId, shortenUrl = false) {
  const pool = await db.getPool();

  const surveyResult = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT SurveyId, Title FROM Surveys WHERE SurveyId = @surveyId');

  if (surveyResult.recordset.length === 0) {
    throw new NotFoundError('Survey not found');
  }

  const surveyLink = `${config.publicSurveyBaseUrl}/survey/${encodeURIComponent(surveyId)}`;
  let shortenedLink = null;

  if (shortenUrl) {
    const shortCode = surveyId.substring(0, 8);
    shortenedLink = `${config.baseUrl}/s/${shortCode}`;
  }

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
}

async function generateQRCode(db, sql, NotFoundError, logger, generateSurveyLinkFn, surveyId) {
  const pool = await db.getPool();

  const surveyResult = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT SurveyId, SurveyLink, ShortenedLink FROM Surveys WHERE SurveyId = @surveyId');

  if (surveyResult.recordset.length === 0) {
    throw new NotFoundError('Survey not found');
  }

  const survey = surveyResult.recordset[0];
  let linkToEncode = survey.ShortenedLink || survey.SurveyLink;

  if (!linkToEncode) {
    const linkResult = await generateSurveyLinkFn(surveyId, false);
    linkToEncode = linkResult.surveyLink;
  }

  const QRCode = require('qrcode');
  const qrCodeDataUrl = await QRCode.toDataURL(linkToEncode, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    width: 300,
    margin: 2
  });

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
}

async function generateEmbedCode(db, sql, NotFoundError, logger, generateSurveyLinkFn, surveyId) {
  const pool = await db.getPool();

  const surveyResult = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT SurveyId, SurveyLink, Title FROM Surveys WHERE SurveyId = @surveyId');

  if (surveyResult.recordset.length === 0) {
    throw new NotFoundError('Survey not found');
  }

  const survey = surveyResult.recordset[0];
  let surveyLink = survey.SurveyLink;

  if (!surveyLink) {
    const linkResult = await generateSurveyLinkFn(surveyId, false);
    surveyLink = linkResult.surveyLink;
  }

  const embedCode = `<iframe src="${surveyLink}" width="100%" height="600px" frameborder="0" title="${survey.Title || 'Survey'}"></iframe>`;

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
}

module.exports = {
  generateEmbedCode,
  generateQRCode,
  generateSurveyLink
};
