const { ValidationError } = require('./errors');

function formatLocalDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function parseComparableDate(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ValidationError(`Invalid ${fieldName}`);
    }
    return value;
  }

  const normalized = String(value).trim().replace(' ', 'T').replace(/Z$/i, '');
  const explicitMatch = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::(\d{2}))?(?::(\d{2}))?(?:\.(\d+))?$/,
  );
  if (explicitMatch) {
    const [, year, month, day, hour, minute = '0', second = '0', fraction = '0'] = explicitMatch;
    const milliseconds = Number(String(fraction).slice(0, 3).padEnd(3, '0'));
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      milliseconds,
    );
    if (Number.isNaN(parsed.getTime())) {
      throw new ValidationError(`Invalid ${fieldName}`);
    }
    return parsed;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`Invalid ${fieldName}`);
  }
  return parsed;
}

function validateDates(startDate, endDate) {
  const start = parseComparableDate(startDate, 'start date');
  const end = parseComparableDate(endDate, 'end date');

  if (end <= start) {
    throw new ValidationError('End date must be after start date');
  }
}

function validateStatus(status) {
  const validStatuses = ['Draft', 'Active', 'Closed', 'Archived'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Status must be one of: ${validStatuses.join(', ')}`);
  }
}

function normalizeDateValue(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const parsed = parseComparableDate(value, fieldName);
  return parsed ? formatLocalDateTime(parsed) : null;
}

function validatePublishWindow(status, startDate, endDate) {
  if (status !== 'Active') {
    return;
  }

  if (!startDate || !endDate) {
    throw new ValidationError('Start date and end date are required before publish');
  }

  const comparableEndDate = parseComparableDate(endDate, 'end date');
  const now = new Date();
  if (!comparableEndDate || comparableEndDate <= now) {
    throw new ValidationError('Survey tidak bisa dipublish karena periode sudah berakhir');
  }
}

function resolveUpdatedSchedule(existingSurvey, data) {
  const nextStartDate = data.startDate !== undefined
    ? normalizeDateValue(data.startDate, 'start date')
    : (existingSurvey.StartDate ? new Date(existingSurvey.StartDate) : null);
  const nextEndDate = data.endDate !== undefined
    ? normalizeDateValue(data.endDate, 'end date')
    : (existingSurvey.EndDate ? new Date(existingSurvey.EndDate) : null);
  const nextStatus = data.status !== undefined ? data.status : existingSurvey.Status;

  if (nextStartDate && nextEndDate) {
    validateDates(nextStartDate, nextEndDate);
  }

  validatePublishWindow(nextStatus, nextStartDate, nextEndDate);

  return { nextStartDate, nextEndDate, nextStatus };
}

function normalizeScheduledTime(scheduledTime) {
  if (scheduledTime === null || scheduledTime === undefined || scheduledTime === '') {
    return null;
  }

  const [hoursText, minutesText, secondsText = '00'] = String(scheduledTime).split(':');
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  const seconds = Number.parseInt(secondsText, 10);

  if (
    Number.isNaN(hours)
    || Number.isNaN(minutes)
    || Number.isNaN(seconds)
    || hours < 0
    || hours > 23
    || minutes < 0
    || minutes > 59
    || seconds < 0
    || seconds > 59
  ) {
    throw new ValidationError('Scheduled time must use HH:mm or HH:mm:ss format');
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toSqlTimeValue(scheduledTime) {
  const normalizedTime = normalizeScheduledTime(scheduledTime);
  if (!normalizedTime) {
    return null;
  }

  const [hoursText, minutesText, secondsText] = normalizedTime.split(':');
  const sqlTimeValue = new Date('1970-01-01T00:00:00');
  sqlTimeValue.setHours(
    Number.parseInt(hoursText, 10),
    Number.parseInt(minutesText, 10),
    Number.parseInt(secondsText, 10),
    0
  );

  return sqlTimeValue;
}

function calculateNextExecution(scheduledDate, frequency, scheduledTime, dayOfWeek) {
  if (frequency === 'once') {
    return new Date(scheduledDate);
  }
  const nextExecution = new Date(scheduledDate);

  let hours = 0;
  let minutes = 0;
  if (scheduledTime) {
    const timeParts = scheduledTime.split(':');
    hours = parseInt(timeParts[0], 10);
    minutes = parseInt(timeParts[1], 10);
  }

  switch (frequency) {
    case 'daily':
      nextExecution.setDate(nextExecution.getDate() + 1);
      nextExecution.setHours(hours, minutes, 0, 0);
      break;
    case 'weekly':
      nextExecution.setDate(nextExecution.getDate() + 7);
      nextExecution.setHours(hours, minutes, 0, 0);
      break;
    case 'monthly':
      nextExecution.setMonth(nextExecution.getMonth() + 1);
      nextExecution.setHours(hours, minutes, 0, 0);
      break;
    default:
      return null;
  }

  return nextExecution;
}

function resolveInitialExecution(scheduledDate, frequency, scheduledTime, dayOfWeek) {
  const initialExecution = new Date(scheduledDate);
  if (Number.isNaN(initialExecution.getTime())) {
    throw new ValidationError('Invalid scheduled date');
  }

  if (frequency === 'once') {
    return initialExecution;
  }

  if (scheduledTime) {
    const [hoursText, minutesText] = String(scheduledTime).split(':');
    const hours = Number.parseInt(hoursText, 10);
    const minutes = Number.parseInt(minutesText, 10);
    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
      initialExecution.setHours(hours, minutes, 0, 0);
    }
  }

  if (frequency === 'weekly' && dayOfWeek !== null && dayOfWeek !== undefined) {
    const normalizedTargetDay = Number(dayOfWeek);
    const currentDay = initialExecution.getDay();
    const daysToAdd = (normalizedTargetDay - currentDay + 7) % 7;
    initialExecution.setDate(initialExecution.getDate() + daysToAdd);
  }

  return initialExecution;
}

module.exports = {
  calculateNextExecution,
  formatLocalDateTime,
  normalizeDateValue,
  normalizeScheduledTime,
  parseComparableDate,
  resolveInitialExecution,
  resolveUpdatedSchedule,
  toSqlTimeValue,
  validateDates,
  validatePublishWindow,
  validateStatus
};
