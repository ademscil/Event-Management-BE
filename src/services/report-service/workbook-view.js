function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(String(value).replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function avg(values) {
  const list = values.filter((value) => typeof value === 'number' && !Number.isNaN(value));
  if (list.length === 0) return null;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function buildWorkbookView(reportData) {
  const numericRows = reportData.responses
    .map((row) => {
      const score = toNumber(row.NumericValue);
      return score === null ? null : { ...row, score };
    })
    .filter(Boolean);

  const respondentByBuMap = new Map();
  numericRows.forEach((row) => {
    const key = String(row.BusinessUnitName || '-').trim() || '-';
    if (!respondentByBuMap.has(key)) respondentByBuMap.set(key, { respondents: new Set(), scores: [] });
    const current = respondentByBuMap.get(key);
    current.respondents.add(row.ResponseId);
    current.scores.push(row.score);
  });
  const respondentByBu = [...respondentByBuMap.entries()]
    .map(([bu, value]) => ({
      bu,
      respondentCount: value.respondents.size,
      score: avg(value.scores),
    }))
    .sort((a, b) => b.respondentCount - a.respondentCount);

  const targetScore = typeof reportData.statistics.averageRating === 'number'
    ? reportData.statistics.averageRating
    : avg(numericRows.map((row) => row.score));

  const years = [2023, 2024, 2025];
  const yearlyScores = years.map((year) => {
    const values = numericRows
      .filter((row) => {
        const date = new Date(row.SubmittedAt || '');
        return !Number.isNaN(date.getTime()) && date.getFullYear() === year;
      })
      .map((row) => row.score);
    return { year, score: avg(values) };
  });

  const functionScoreMap = new Map();
  numericRows.forEach((row) => {
    const key = String(row.FunctionName || row.ApplicationName || 'General').trim() || 'General';
    if (!functionScoreMap.has(key)) functionScoreMap.set(key, []);
    functionScoreMap.get(key).push(row.score);
  });
  const functionScores = [...functionScoreMap.entries()]
    .map(([name, values]) => ({ name, score: avg(values) }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 12);

  const criteriaBuckets = { Responses: [], Resolution: [] };
  numericRows.forEach((row) => {
    const prompt = String(row.PromptText || '').toLowerCase();
    if (prompt.includes('response')) criteriaBuckets.Responses.push(row.score);
    if (prompt.includes('resolution')) criteriaBuckets.Resolution.push(row.score);
  });
  const criteriaScores = [
    { criteria: 'Responses', score: avg(criteriaBuckets.Responses) },
    { criteria: 'Resolution', score: avg(criteriaBuckets.Resolution) },
  ];

  const appScoreMap = new Map();
  numericRows.forEach((row) => {
    const key = String(row.ApplicationName || 'General').trim() || 'General';
    if (!appScoreMap.has(key)) appScoreMap.set(key, []);
    appScoreMap.get(key).push(row.score);
  });
  const appScores = [...appScoreMap.entries()]
    .map(([app, values]) => ({ app, score: avg(values) }))
    .sort((a, b) => String(a.app).localeCompare(String(b.app)));

  const functionDetailMap = new Map();
  numericRows.forEach((row) => {
    const functionName = String(row.FunctionName || row.ApplicationName || 'General').trim() || 'General';
    const detail = String(row.PromptText || 'Question').trim() || 'Question';
    if (!functionDetailMap.has(functionName)) functionDetailMap.set(functionName, []);
    functionDetailMap.get(functionName).push({ detail, score: row.score });
  });
  const functionDetailRows = [...functionDetailMap.entries()]
    .sort((a, b) => (avg(b[1].map((item) => item.score)) || 0) - (avg(a[1].map((item) => item.score)) || 0))
    .flatMap(([functionName, entries]) => {
      const average = avg(entries.map((item) => item.score));
      return entries.map((entry) => ({
        functionName,
        detail: entry.detail,
        score: entry.score,
        average,
      }));
    });

  const topApp = [...appScores].sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
  const topBu = [...respondentByBu].sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
  const yearly2023 = yearlyScores.find((item) => item.year === 2023)?.score;
  const yearly2025 = yearlyScores.find((item) => item.year === 2025)?.score;
  const percentChange = yearly2023 && yearly2025
    ? `${(((yearly2025 - yearly2023) / yearly2023) * 100).toFixed(2)}%`
    : '';

  return {
    respondentByBu,
    targetScore,
    yearlyScores,
    functionScores,
    criteriaScores,
    appScores,
    functionDetailRows,
    topApp,
    topBu,
    percentChange,
    topScoreSummary: {
      highestApp: topApp?.app || '',
      highestScore: topApp?.score ?? null,
      highestBu: topBu?.bu || '',
      highestBuScore: topBu?.score ?? null,
    },
  };
}

module.exports = {
  avg,
  buildWorkbookView,
  toNumber
};
