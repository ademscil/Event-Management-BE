function sanitizeForExcel(value) {
  if (!value) return '';

  const strValue = String(value);
  if (strValue.match(/^[=+\-@]/)) {
    return `'${strValue}`;
  }

  return strValue;
}

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return Number(value).toFixed(2);
}

module.exports = {
  formatScore,
  sanitizeForExcel
};
