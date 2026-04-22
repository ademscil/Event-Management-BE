function normalizeQuestionRef(value) {
  const raw = String(value || '').trim();
  if (raw.toLowerCase().startsWith('q-')) {
    return raw.slice(2);
  }
  return raw;
}

function isSourceMappedApplication(options) {
  const dataSource = String(options?.dataSource || '').toLowerCase();
  return dataSource === 'app_department' || dataSource === 'app_function';
}

function checkResponseHasValue(type, value) {
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

function extractNumericResponseValue(value) {
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

function validateApplicationSelections(ValidationError, selectedApplicationIds) {
  if (!selectedApplicationIds || selectedApplicationIds.length === 0) {
    throw new ValidationError('At least one application must be selected');
  }
}

function validateMandatoryQuestions(ValidationError, questions, responses) {
  const responseMap = new Map(
    responses.map((response) => [normalizeQuestionRef(response.questionId), response]),
  );

  const conditionallyMandatoryQuestionIds = new Set();

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
    ? checkResponseHasValue(mappedSelectorQuestion.type, mappedSelectorResponse?.value || null)
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
    const sourceNumericValue = extractNumericResponseValue(sourceResponse ? sourceResponse.value : null);
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

    const hasValue = checkResponseHasValue(question.type, response.value);
    if (!hasValue) {
      throw new ValidationError(`Question "${question.promptText}" is mandatory and must be answered`);
    }

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

module.exports = {
  checkResponseHasValue,
  extractNumericResponseValue,
  isSourceMappedApplication,
  normalizeQuestionRef,
  validateApplicationSelections,
  validateMandatoryQuestions
};
