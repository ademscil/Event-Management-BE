jest.mock('../../services/reportService', () => ({
  generateReport: jest.fn(),
  viewReport: jest.fn(),
  exportToExcel: jest.fn(),
  exportToPdf: jest.fn(),
}));

jest.mock('../../config/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
}));

const reportService = require('../../services/reportService');
const reportController = require('../reportController');

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    send: jest.fn(),
  };
}

describe('reportController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('viewReport', () => {
    it('should return generated report without mutating payload shape', async () => {
      const report = { survey: { title: 'Survey Test' }, statistics: { totalResponses: 10 } };
      reportService.viewReport.mockResolvedValue(report);

      const req = {
        body: { surveyId: 'survey-1' },
        user: { userId: 'user-1', role: 'AdminEvent' },
      };
      const res = createResponse();

      await reportController.viewReport(req, res);

      expect(reportService.viewReport).toHaveBeenCalledWith({
        surveyId: 'survey-1',
        userId: 'user-1',
        userRole: 'AdminEvent',
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        report,
      });
    });

    it('should map validation errors to 400 response', async () => {
      const error = new Error('Report belum digenerate untuk event ini.');
      error.name = 'ValidationError';
      reportService.viewReport.mockRejectedValue(error);

      const req = {
        body: { surveyId: 'survey-1' },
        user: { userId: 'user-1', role: 'DepartmentHead' },
      };
      const res = createResponse();

      await reportController.viewReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation error',
        message: 'Report belum digenerate untuk event ini.',
      });
    });
  });

  describe('exportToExcel', () => {
    it('should use a safe filename derived from survey title', async () => {
      const buffer = Buffer.from('excel');
      reportService.exportToExcel.mockResolvedValue(buffer);
      reportService.viewReport.mockResolvedValue({
        survey: { title: 'IT Satisfaction Survey 2025' },
      });

      const req = {
        body: { surveyId: 'survey-1' },
        user: { userId: 'user-1', role: 'AdminEvent' },
      };
      const res = createResponse();

      await reportController.exportToExcel(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="report-it-satisfaction-survey-2025.xlsx"'
      );
      expect(res.send).toHaveBeenCalledWith(buffer);
    });
  });

  describe('exportToPdf', () => {
    it('should use a safe filename derived from survey title', async () => {
      const buffer = Buffer.from('pdf');
      reportService.exportToPdf.mockResolvedValue(buffer);
      reportService.viewReport.mockResolvedValue({
        survey: { title: 'Survey / CSI Report' },
      });

      const req = {
        body: { surveyId: 'survey-1' },
        user: { userId: 'user-1', role: 'AdminEvent' },
      };
      const res = createResponse();

      await reportController.exportToPdf(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="report-survey-csi-report.pdf"'
      );
      expect(res.send).toHaveBeenCalledWith(buffer);
    });
  });
});
