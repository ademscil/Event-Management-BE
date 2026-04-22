async function exportToPdf(PDFDocument, logger, request, viewReport) {
  logger.info(`Exporting report to PDF for surveyId: ${request.surveyId}`);
  const reportData = await viewReport(request);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).font('Helvetica-Bold').text('CSI Survey Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(14).font('Helvetica-Bold').text('Survey Information');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Title: ${reportData.survey.title}`);
      doc.text(`Period: ${new Date(reportData.survey.startDate).toLocaleDateString()} - ${new Date(reportData.survey.endDate).toLocaleDateString()}`);
      doc.text(`Status: ${reportData.survey.status}`);
      doc.moveDown();

      doc.fontSize(14).font('Helvetica-Bold').text('Summary Statistics');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      const stats = [
        ['Total Responses', reportData.statistics.totalResponses],
        ['Unique Respondents', reportData.statistics.uniqueRespondents],
        ['Average Rating', reportData.statistics.averageRating || 'N/A'],
        ['Min Rating', reportData.statistics.minRating || 'N/A'],
        ['Max Rating', reportData.statistics.maxRating || 'N/A'],
        ['Active Responses', reportData.statistics.activeCount],
        ['Taken Out Responses', reportData.statistics.takenOutCount],
        ['Proposed Takeout', reportData.statistics.proposedCount]
      ];
      stats.forEach(([label, value]) => doc.text(`${label}: ${value}`));
      doc.moveDown();

      if (reportData.ratingDistribution.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Rating Distribution');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        const maxCount = Math.max(...reportData.ratingDistribution.map((item) => item.Count));
        const barWidth = 400;
        reportData.ratingDistribution.forEach((item) => {
          const barLength = (item.Count / maxCount) * barWidth;
          doc.text(`Rating ${item.Rating}: ${'#'.repeat(Math.floor(barLength / 10))} (${item.Count})`);
        });
        doc.moveDown();
      }

      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').text('Response Details (Sample)');
      doc.moveDown(0.5);
      doc.fontSize(8).font('Helvetica');
      const tableTop = doc.y;
      const colWidths = { email: 120, application: 100, question: 150, value: 80, status: 60 };

      let x = 50;
      doc.font('Helvetica-Bold');
      doc.text('Email', x, tableTop, { width: colWidths.email, continued: false });
      x += colWidths.email;
      doc.text('Application', x, tableTop, { width: colWidths.application, continued: false });
      x += colWidths.application;
      doc.text('Question', x, tableTop, { width: colWidths.question, continued: false });
      x += colWidths.question;
      doc.text('Value', x, tableTop, { width: colWidths.value, continued: false });
      x += colWidths.value;
      doc.text('Status', x, tableTop, { width: colWidths.status, continued: false });
      doc.moveDown(0.5);
      doc.font('Helvetica');

      reportData.responses.slice(0, 20).forEach((response) => {
        if (doc.y > 700) {
          doc.addPage();
          doc.fontSize(8).font('Helvetica');
        }

        let responseValue = '';
        if (response.TextValue) responseValue = response.TextValue.substring(0, 30);
        else if (response.NumericValue !== null) responseValue = String(response.NumericValue);
        else if (response.DateValue) responseValue = new Date(response.DateValue).toLocaleDateString();

        x = 50;
        const y = doc.y;
        doc.text(response.RespondentEmail.substring(0, 25), x, y, { width: colWidths.email, continued: false });
        x += colWidths.email;
        doc.text(response.ApplicationName.substring(0, 20), x, y, { width: colWidths.application, continued: false });
        x += colWidths.application;
        doc.text(response.PromptText.substring(0, 30), x, y, { width: colWidths.question, continued: false });
        x += colWidths.question;
        doc.text(responseValue, x, y, { width: colWidths.value, continued: false });
        x += colWidths.value;
        doc.text(response.TakeoutStatus, x, y, { width: colWidths.status, continued: false });
        doc.moveDown(0.8);
      });

      if (reportData.responses.length > 20) {
        doc.moveDown();
        doc.fontSize(8).font('Helvetica-Oblique');
        doc.text(`... and ${reportData.responses.length - 20} more responses. Download Excel for complete data.`);
      }

      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i += 1) {
        doc.switchToPage(i);
        doc.fontSize(8).font('Helvetica');
        doc.text(
          `Generated on ${new Date().toLocaleString()} | Page ${i + 1} of ${pages.count}`,
          50,
          doc.page.height - 50,
          { align: 'center' }
        );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  exportToPdf
};
