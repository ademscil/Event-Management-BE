async function uploadSurveyImage(context, surveyId, file, options) {
  const { logger, uploadSurveyConfigurationImage } = context;
  try {
    return await uploadSurveyConfigurationImage({
      surveyId,
      file,
      ...options
    });
  } catch (error) {
    logger.error(`Error uploading ${options.logLabel.toLowerCase()}:`, error);
    throw error;
  }
}

async function uploadQuestionImageAction(context, questionId, file) {
  const { logger, uploadQuestionImageHelper, shared } = context;
  try {
    return await uploadQuestionImageHelper({
      questionId,
      file,
      ...shared
    });
  } catch (error) {
    logger.error('Error uploading question image:', error);
    throw error;
  }
}

async function uploadOptionImageAction(context, questionId, optionIndex, file) {
  const { logger, uploadOptionImageHelper, shared } = context;
  try {
    return await uploadOptionImageHelper({
      questionId,
      optionIndex,
      file,
      ...shared
    });
  } catch (error) {
    logger.error('Error uploading option image:', error);
    throw error;
  }
}

module.exports = {
  uploadOptionImageAction,
  uploadQuestionImageAction,
  uploadSurveyImage
};
