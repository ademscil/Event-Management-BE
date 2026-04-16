async function exportToExcel(deps, request) {
  const {
    ExcelJS,
    buildWorkbookView,
    formatDateLabel,
    formatScore,
    logger,
    sanitizeForExcel,
    styleKeyValueCell,
    styleSectionNote,
    styleSheetHeader,
    styleTableHeader,
    viewReport
  } = deps;

  logger.info(`Exporting report to Excel for surveyId: ${request.surveyId}`);
  const reportData = await viewReport(request);
  const workbookView = buildWorkbookView(reportData);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CSI Portal';
  workbook.created = new Date();

  const reportSheet = workbook.addWorksheet('Report View');
  reportSheet.views = [{ state: 'frozen', ySplit: 2 }];
  reportSheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  reportSheet.columns = [{ width: 24 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  reportSheet.mergeCells('A1:F1');
  reportSheet.getCell('A1').value = `The final result ${sanitizeForExcel(reportData.survey.title)} represents.`;
  reportSheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  reportSheet.getCell('A1').alignment = { horizontal: 'center' };
  reportSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7A3B00' } };
  reportSheet.getCell('A3').value = 'Survey Period';
  reportSheet.getCell('B3').value = `${formatDateLabel(reportData.survey.startDate)} - ${formatDateLabel(reportData.survey.endDate)}`;
  reportSheet.getCell('D3').value = 'Generated Source';
  reportSheet.getCell('E3').value = 'Final Approved Response';
  reportSheet.getCell('A4').value = 'Target Score';
  reportSheet.getCell('B4').value = formatScore(workbookView.targetScore);
  reportSheet.getCell('D4').value = 'Unique Respondents';
  reportSheet.getCell('E4').value = reportData.statistics.uniqueRespondents;
  reportSheet.getCell('A5').value = 'Generated At';
  reportSheet.getCell('B5').value = formatDateLabel(reportData.survey.generatedAt);
  reportSheet.getCell('D5').value = 'Report Status';
  reportSheet.getCell('E5').value = 'Generated';
  ['A3', 'A4', 'A5', 'D3', 'D4', 'D5'].forEach((ref) => styleKeyValueCell(reportSheet.getCell(ref), true));
  ['B3', 'B4', 'B5', 'E3', 'E4', 'E5'].forEach((ref) => styleKeyValueCell(reportSheet.getCell(ref)));
  reportSheet.getCell('A6').value = 'Respondent';
  styleSheetHeader(reportSheet.getRow(6));
  reportSheet.getRow(7).values = ['No', 'BU', 'Respondent', 'Score'];
  styleTableHeader(reportSheet.getRow(7));
  workbookView.respondentByBu.forEach((row, index) => {
    reportSheet.getRow(8 + index).values = [index + 1, sanitizeForExcel(row.bu), row.respondentCount, formatScore(row.score)];
  });
  reportSheet.getCell(`A${8 + workbookView.respondentByBu.length}`).value =
    `The highest respondent came from ${sanitizeForExcel(workbookView.topScoreSummary.highestBu || '-')}` +
    ` BU (${workbookView.respondentByBu[0]?.respondentCount || 0}).`;
  reportSheet.mergeCells(`A${8 + workbookView.respondentByBu.length}:D${8 + workbookView.respondentByBu.length}`);
  styleSectionNote(reportSheet.getCell(`A${8 + workbookView.respondentByBu.length}`));

  reportSheet.getCell('E6').value = 'Score Summary';
  styleSheetHeader(reportSheet.getRow(6));
  reportSheet.getRow(7).getCell(5).value = 'Score';
  reportSheet.getRow(7).getCell(6).value = 'Value';
  styleTableHeader(reportSheet.getRow(7));
  reportSheet.getRow(8).getCell(5).value = '2023';
  reportSheet.getRow(8).getCell(6).value = formatScore(workbookView.yearlyScores.find((item) => item.year === 2023)?.score);
  reportSheet.getRow(9).getCell(5).value = '2024';
  reportSheet.getRow(9).getCell(6).value = formatScore(workbookView.yearlyScores.find((item) => item.year === 2024)?.score);
  reportSheet.getRow(10).getCell(5).value = '2025';
  reportSheet.getRow(10).getCell(6).value = formatScore(workbookView.yearlyScores.find((item) => item.year === 2025)?.score);
  reportSheet.getRow(11).getCell(5).value = '% Change';
  reportSheet.getRow(11).getCell(6).value = workbookView.percentChange;

  let cursor = Math.max(10 + workbookView.respondentByBu.length, 14);
  reportSheet.getCell(`A${cursor}`).value = 'Function Score';
  styleSheetHeader(reportSheet.getRow(cursor));
  reportSheet.getRow(cursor + 1).values = ['Function', 'Target', 'Score'];
  styleTableHeader(reportSheet.getRow(cursor + 1));
  workbookView.functionScores.forEach((row, index) => {
    reportSheet.getRow(cursor + 2 + index).values = [
      sanitizeForExcel(row.name),
      formatScore(workbookView.targetScore),
      formatScore(row.score),
    ];
  });

  const criteriaStart = cursor;
  reportSheet.getCell(`E${criteriaStart}`).value = 'Criteria';
  styleSheetHeader(reportSheet.getRow(criteriaStart));
  reportSheet.getRow(criteriaStart + 1).getCell(5).value = 'Criteria';
  reportSheet.getRow(criteriaStart + 1).getCell(6).value = 'Score';
  styleTableHeader(reportSheet.getRow(criteriaStart + 1));
  workbookView.criteriaScores.forEach((row, index) => {
    reportSheet.getRow(criteriaStart + 2 + index).getCell(5).value = row.criteria;
    reportSheet.getRow(criteriaStart + 2 + index).getCell(6).value = formatScore(row.score);
  });
  reportSheet.mergeCells(`E${criteriaStart + 5}:F${criteriaStart + 7}`);
  reportSheet.getCell(`E${criteriaStart + 5}`).value =
    `Pada hasil akhir CSI, ${sanitizeForExcel(workbookView.topScoreSummary.highestApp || '')}` +
    `${workbookView.topScoreSummary.highestScore !== null ? ` meraih skor tertinggi ${formatScore(workbookView.topScoreSummary.highestScore)}` : ''}` +
    `${workbookView.topScoreSummary.highestApp && workbookView.topScoreSummary.highestBu ? ', dan ' : ''}` +
    `${workbookView.topScoreSummary.highestBu ? `${sanitizeForExcel(workbookView.topScoreSummary.highestBu)} meraih skor tertinggi ${formatScore(workbookView.topScoreSummary.highestBuScore)}` : ''}`;
  styleSectionNote(reportSheet.getCell(`E${criteriaStart + 5}`));

  const appSnapshotStart = Math.max(cursor + 2 + workbookView.functionScores.length + 2, criteriaStart + 9);
  reportSheet.getCell(`A${appSnapshotStart}`).value = 'Applications Score Snapshot';
  styleSheetHeader(reportSheet.getRow(appSnapshotStart));
  reportSheet.getRow(appSnapshotStart + 1).values = ['Rank', 'Application', 'Score', 'Target', 'Status'];
  styleTableHeader(reportSheet.getRow(appSnapshotStart + 1));
  workbookView.appScores.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10).forEach((row, index) => {
    const isAboveTarget = typeof row.score === 'number' && typeof workbookView.targetScore === 'number'
      ? row.score >= workbookView.targetScore
      : false;
    reportSheet.getRow(appSnapshotStart + 2 + index).values = [
      index + 1,
      sanitizeForExcel(row.app),
      formatScore(row.score),
      formatScore(workbookView.targetScore),
      isAboveTarget ? 'Above Target' : 'Below Target',
    ];
  });

  const appSheet = workbook.addWorksheet('Applications Score');
  appSheet.views = [{ state: 'frozen', ySplit: 2 }];
  appSheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  appSheet.columns = [
    { header: 'Rank', key: 'rank', width: 10 },
    { header: 'Application', key: 'application', width: 36 },
    { header: 'Score', key: 'score', width: 14 },
    { header: 'Target', key: 'target', width: 14 },
    { header: 'Variance', key: 'variance', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
  ];
  appSheet.mergeCells('A1:F1');
  appSheet.getCell('A1').value = 'Applications Score';
  styleSheetHeader(appSheet.getRow(1));
  appSheet.getCell('A1').alignment = { horizontal: 'center' };
  appSheet.getRow(2).values = ['Rank', 'Application', 'Score', 'Target', 'Variance', 'Status'];
  styleTableHeader(appSheet.getRow(2));
  appSheet.autoFilter = 'A2:F2';
  workbookView.appScores.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).forEach((row, index) => {
    const variance = typeof row.score === 'number' && typeof workbookView.targetScore === 'number'
      ? row.score - workbookView.targetScore
      : null;
    appSheet.addRow({
      rank: index + 1,
      application: sanitizeForExcel(row.app),
      score: formatScore(row.score),
      target: formatScore(workbookView.targetScore),
      variance: variance === null ? '' : formatScore(variance),
      status: variance !== null && variance >= 0 ? 'Above Target' : 'Below Target',
    });
    const sheetRow = appSheet.getRow(appSheet.rowCount);
    if (variance !== null) {
      sheetRow.getCell(6).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: variance >= 0 ? 'FFDCFCE7' : 'FFFEF3C7' }
      };
    }
  });

  const functionDetailSheet = workbook.addWorksheet('Function Detail');
  functionDetailSheet.views = [{ state: 'frozen', ySplit: 2 }];
  functionDetailSheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  functionDetailSheet.columns = [
    { header: 'Function', key: 'functionName', width: 28 },
    { header: 'Detail', key: 'detail', width: 70 },
    { header: 'Score', key: 'score', width: 14 },
    { header: 'Average', key: 'average', width: 14 },
  ];
  functionDetailSheet.mergeCells('A1:D1');
  functionDetailSheet.getCell('A1').value = 'Function Detail & Score';
  styleSheetHeader(functionDetailSheet.getRow(1));
  functionDetailSheet.getCell('A1').alignment = { horizontal: 'center' };
  functionDetailSheet.getRow(2).values = ['Function', 'Detail', 'Score', 'Average'];
  styleTableHeader(functionDetailSheet.getRow(2));
  functionDetailSheet.autoFilter = 'A2:D2';
  workbookView.functionDetailRows.forEach((row) => {
    functionDetailSheet.addRow({
      functionName: sanitizeForExcel(row.functionName),
      detail: sanitizeForExcel(row.detail),
      score: formatScore(row.score),
      average: formatScore(row.average),
    });
  });
  let mergeStartRow = 3;
  while (mergeStartRow <= functionDetailSheet.rowCount) {
    const currentFunction = functionDetailSheet.getCell(`A${mergeStartRow}`).value;
    let mergeEndRow = mergeStartRow;
    while (mergeEndRow + 1 <= functionDetailSheet.rowCount && functionDetailSheet.getCell(`A${mergeEndRow + 1}`).value === currentFunction) {
      mergeEndRow += 1;
    }
    if (mergeEndRow > mergeStartRow) {
      functionDetailSheet.mergeCells(`A${mergeStartRow}:A${mergeEndRow}`);
      functionDetailSheet.mergeCells(`D${mergeStartRow}:D${mergeEndRow}`);
    }
    functionDetailSheet.getCell(`A${mergeStartRow}`).alignment = { vertical: 'middle' };
    functionDetailSheet.getCell(`D${mergeStartRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
    mergeStartRow = mergeEndRow + 1;
  }

  const detailsSheet = workbook.addWorksheet('Response Details');
  detailsSheet.views = [{ state: 'frozen', ySplit: 1 }];
  detailsSheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  detailsSheet.columns = [
    { header: 'Response ID', key: 'responseId', width: 15 },
    { header: 'Respondent Email', key: 'email', width: 25 },
    { header: 'Respondent Name', key: 'name', width: 25 },
    { header: 'Business Unit', key: 'businessUnit', width: 20 },
    { header: 'Division', key: 'division', width: 20 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Function', key: 'functionName', width: 24 },
    { header: 'Application', key: 'application', width: 20 },
    { header: 'Question', key: 'question', width: 40 },
    { header: 'Question Type', key: 'questionType', width: 15 },
    { header: 'Response Value', key: 'responseValue', width: 30 },
    { header: 'Comment', key: 'comment', width: 40 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Takeout Reason', key: 'takeoutReason', width: 40 },
    { header: 'Submitted At', key: 'submittedAt', width: 20 }
  ];
  reportData.responses.forEach((response) => {
    let responseValue = '';
    if (response.TextValue) responseValue = sanitizeForExcel(response.TextValue);
    else if (response.NumericValue !== null) responseValue = response.NumericValue;
    else if (response.DateValue) responseValue = new Date(response.DateValue).toLocaleDateString();
    else if (response.MatrixValues) responseValue = sanitizeForExcel(response.MatrixValues);
    detailsSheet.addRow({
      responseId: response.ResponseId,
      email: sanitizeForExcel(response.RespondentEmail),
      name: sanitizeForExcel(response.RespondentName),
      businessUnit: sanitizeForExcel(response.BusinessUnitName),
      division: sanitizeForExcel(response.DivisionName),
      department: sanitizeForExcel(response.DepartmentName),
      functionName: sanitizeForExcel(response.FunctionName || ''),
      application: sanitizeForExcel(response.ApplicationName),
      question: sanitizeForExcel(response.PromptText),
      questionType: response.QuestionType,
      responseValue,
      comment: sanitizeForExcel(response.CommentValue || ''),
      status: response.TakeoutStatus,
      takeoutReason: sanitizeForExcel(response.TakeoutReason || ''),
      submittedAt: new Date(response.SubmittedAt).toLocaleString()
    });
  });
  styleTableHeader(detailsSheet.getRow(1));
  detailsSheet.autoFilter = 'A1:O1';

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  exportToExcel
};
