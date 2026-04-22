const path = require('path');

async function ensureUploadDirectory(directory, { fs, logger }) {
  try {
    await fs.access(directory);
  } catch (error) {
    await fs.mkdir(directory, { recursive: true });
    logger.info(`Created upload directory: ${directory}`);
  }
}

async function saveFile(buffer, filename, subdirectory, { config, fs, logger }) {
  const uploadDir = config.upload.directory || 'uploads';
  const fullPath = path.join(uploadDir, subdirectory);

  await ensureUploadDirectory(fullPath, { fs, logger });

  const filePath = path.join(fullPath, filename);
  await fs.writeFile(filePath, buffer);

  const base = (config.baseUrl || '').replace(/\/$/, '');
  return `${base}/uploads/${subdirectory}/${filename}`;
}

async function deleteFile(fileUrl, { config, fs, logger }) {
  try {
    if (!fileUrl) return;

    const urlParts = fileUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    const subdirectory = urlParts[urlParts.length - 2];

    const uploadDir = config.upload.directory || 'uploads';
    const filePath = path.join(uploadDir, subdirectory, filename);

    await fs.unlink(filePath);
    logger.info(`Deleted file: ${filePath}`);
  } catch (error) {
    logger.warn(`Failed to delete file: ${fileUrl}`, error);
  }
}

async function uploadSurveyConfigurationImage({
  surveyId,
  file,
  columnName,
  configKey,
  logLabel,
  validateImageFile,
  getSurveyById,
  generateUniqueFilename,
  saveFile,
  deleteFile,
  db,
  sql,
  crypto,
  NotFoundError,
  logger
}) {
  const pool = await db.getPool();

  validateImageFile(file);

  const survey = await getSurveyById(surveyId);
  if (!survey) {
    throw new NotFoundError(`Survey with ID ${surveyId} not found`);
  }

  const filename = generateUniqueFilename(file);
  const imageUrl = await saveFile(file.buffer, filename, 'surveys');

  const configResult = await pool.request()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('SELECT * FROM EventConfiguration WHERE SurveyId = @surveyId');

  let updatedConfig;

  if (configResult.recordset.length > 0) {
    const existingConfig = configResult.recordset[0];
    const oldImageUrl = existingConfig[columnName];

    await pool.request()
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .input(configKey, sql.NVarChar(500), imageUrl)
      .query(`UPDATE EventConfiguration SET ${columnName} = @${configKey} WHERE SurveyId = @surveyId`);

    if (oldImageUrl) {
      await deleteFile(oldImageUrl);
    }

    updatedConfig = {
      ...existingConfig,
      [columnName]: imageUrl
    };
  } else {
    const configId = crypto.randomUUID();

    await pool.request()
      .input('configId', sql.UniqueIdentifier, configId)
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .input(configKey, sql.NVarChar(500), imageUrl)
      .query(`
        INSERT INTO EventConfiguration (ConfigId, SurveyId, ${columnName})
        VALUES (@configId, @surveyId, @${configKey})
      `);

    updatedConfig = {
      ConfigId: configId,
      SurveyId: surveyId,
      [columnName]: imageUrl
    };
  }

  logger.info(`${logLabel} uploaded for survey ${surveyId}: ${imageUrl}`);
  return updatedConfig;
}

async function uploadQuestionImage({
  questionId,
  file,
  validateImageFile,
  generateUniqueFilename,
  saveFile,
  deleteFile,
  db,
  sql,
  NotFoundError,
  logger
}) {
  const pool = await db.getPool();

  validateImageFile(file);

  const questionResult = await pool.request()
    .input('questionId', sql.UniqueIdentifier, questionId)
    .query('SELECT * FROM Questions WHERE QuestionId = @questionId');

  if (questionResult.recordset.length === 0) {
    throw new NotFoundError(`Question with ID ${questionId} not found`);
  }

  const question = questionResult.recordset[0];
  const filename = generateUniqueFilename(file);
  const imageUrl = await saveFile(file.buffer, filename, 'questions');

  if (question.ImageUrl) {
    await deleteFile(question.ImageUrl);
  }

  await pool.request()
    .input('questionId', sql.UniqueIdentifier, questionId)
    .input('imageUrl', sql.NVarChar(500), imageUrl)
    .query('UPDATE Questions SET ImageUrl = @imageUrl WHERE QuestionId = @questionId');

  logger.info(`Question image uploaded for question ${questionId}: ${imageUrl}`);

  return {
    ...question,
    ImageUrl: imageUrl
  };
}

async function uploadOptionImage({
  questionId,
  optionIndex,
  file,
  validateImageFile,
  generateUniqueFilename,
  saveFile,
  deleteFile,
  db,
  sql,
  ValidationError,
  NotFoundError,
  logger
}) {
  const pool = await db.getPool();

  validateImageFile(file);

  if (typeof optionIndex !== 'number' || optionIndex < 0) {
    throw new ValidationError('Invalid option index');
  }

  const questionResult = await pool.request()
    .input('questionId', sql.UniqueIdentifier, questionId)
    .query('SELECT * FROM Questions WHERE QuestionId = @questionId');

  if (questionResult.recordset.length === 0) {
    throw new NotFoundError(`Question with ID ${questionId} not found`);
  }

  const question = questionResult.recordset[0];

  if (question.Type !== 'MultipleChoice' && question.Type !== 'Checkbox') {
    throw new ValidationError('Option images are only supported for MultipleChoice and Checkbox question types');
  }

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

  if (!options.options || !Array.isArray(options.options)) {
    throw new ValidationError('Question does not have valid options array');
  }

  if (optionIndex >= options.options.length) {
    throw new ValidationError(`Option index ${optionIndex} is out of bounds (max: ${options.options.length - 1})`);
  }

  const filename = generateUniqueFilename(file);
  const imageUrl = await saveFile(file.buffer, filename, 'options');

  const option = options.options[optionIndex];
  let oldImageUrl = null;

  if (typeof option === 'string') {
    options.options[optionIndex] = {
      text: option,
      imageUrl: imageUrl
    };
  } else if (typeof option === 'object') {
    oldImageUrl = option.imageUrl;
    options.options[optionIndex] = {
      ...option,
      imageUrl: imageUrl
    };
  }

  if (oldImageUrl) {
    await deleteFile(oldImageUrl);
  }

  await pool.request()
    .input('questionId', sql.UniqueIdentifier, questionId)
    .input('options', sql.NVarChar(sql.MAX), JSON.stringify(options))
    .query('UPDATE Questions SET Options = @options WHERE QuestionId = @questionId');

  logger.info(`Option image uploaded for question ${questionId}, option ${optionIndex}: ${imageUrl}`);

  return {
    ...question,
    Options: options
  };
}

module.exports = {
  deleteFile,
  ensureUploadDirectory,
  saveFile,
  uploadOptionImage,
  uploadQuestionImage,
  uploadSurveyConfigurationImage
};
