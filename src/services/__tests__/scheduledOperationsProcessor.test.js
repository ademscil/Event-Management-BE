jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../database/connection');
jest.mock('../emailService', () => ({
  sendSurveyBlast: jest.fn(),
  sendReminders: jest.fn(),
}));

const processor = require('../scheduledOperationsProcessor');
const emailService = require('../emailService');

describe('ScheduledOperationsProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeBlast', () => {
    it('should pass parsed target criteria and custom options to email service', async () => {
      emailService.sendSurveyBlast.mockResolvedValue({ sent: 2, failed: 0 });

      const operation = {
        SurveyId: 'survey-1',
        EmailTemplate: 'survey-invitation',
        EmbedCover: true,
        TargetCriteria: JSON.stringify({
          recipientEmails: ['qa1@example.com', 'qa2@example.com'],
          customSubject: 'Blast Subject',
          customMessage: 'Blast body',
          includeQrCode: true,
        }),
      };

      const result = await processor.executeBlast(operation);

      expect(result).toEqual({ sent: 2, failed: 0 });
      expect(emailService.sendSurveyBlast).toHaveBeenCalledWith({
        surveyId: 'survey-1',
        targetCriteria: {
          recipientEmails: ['qa1@example.com', 'qa2@example.com'],
          customSubject: 'Blast Subject',
          customMessage: 'Blast body',
          includeQrCode: true,
        },
        emailTemplate: 'survey-invitation',
        customSubject: 'Blast Subject',
        customMessage: 'Blast body',
        includeQrCode: true,
        recipientEmails: ['qa1@example.com', 'qa2@example.com'],
        disableDuplicateCheck: true,
        embedCover: true,
      });
    });
  });

  describe('executeReminder', () => {
    it('should pass parsed target criteria and manual recipients to reminder service', async () => {
      emailService.sendReminders.mockResolvedValue({ sent: 1, failed: 0 });

      const operation = {
        SurveyId: 'survey-2',
        EmailTemplate: 'survey-reminder',
        EmbedCover: false,
        TargetCriteria: JSON.stringify({
          recipientEmails: ['qa3@example.com'],
          customSubject: 'Reminder Subject',
          customMessage: 'Reminder body',
        }),
      };

      const result = await processor.executeReminder(operation);

      expect(result).toEqual({ sent: 1, failed: 0 });
      expect(emailService.sendReminders).toHaveBeenCalledWith({
        surveyId: 'survey-2',
        emailTemplate: 'survey-reminder',
        customSubject: 'Reminder Subject',
        customMessage: 'Reminder body',
        recipientEmails: ['qa3@example.com'],
        embedCover: false,
      });
    });
  });
});
