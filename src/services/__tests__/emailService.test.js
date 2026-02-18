/**
 * Email Service Tests
 * Basic unit tests for email service functionality
 */

const emailService = require('../emailService');

describe('EmailService', () => {
    describe('validateEmail', () => {
        test('should validate correct email addresses', () => {
            expect(emailService.validateEmail('user@example.com')).toBe(true);
            expect(emailService.validateEmail('test.user@company.co.id')).toBe(true);
            expect(emailService.validateEmail('admin+tag@domain.com')).toBe(true);
        });

        test('should reject invalid email addresses', () => {
            expect(emailService.validateEmail('invalid')).toBe(false);
            expect(emailService.validateEmail('user@')).toBe(false);
            expect(emailService.validateEmail('@domain.com')).toBe(false);
            expect(emailService.validateEmail('user @domain.com')).toBe(false);
            expect(emailService.validateEmail('')).toBe(false);
        });
    });

    describe('renderTemplate', () => {
        test('should render survey invitation template', async () => {
            const html = await emailService.renderTemplate('survey-invitation', {
                recipientName: 'John Doe',
                surveyTitle: 'IT Satisfaction Survey',
                surveyDescription: 'Please provide your feedback',
                surveyLink: 'http://localhost:3000/survey/index.html?id=123',
                startDate: '2024-01-01',
                endDate: '2024-01-31',
                targetRespondents: '100',
                embedCover: false,
                heroCoverUrl: null
            });

            expect(html).toContain('John Doe');
            expect(html).toContain('IT Satisfaction Survey');
            expect(html).toContain('Please provide your feedback');
            expect(html).toContain('http://localhost:3000/survey/index.html?id=123');
        });

        test('should render survey reminder template', async () => {
            const html = await emailService.renderTemplate('survey-reminder', {
                recipientName: 'Jane Smith',
                surveyTitle: 'IT Satisfaction Survey',
                surveyLink: 'http://localhost:3000/survey/index.html?id=123',
                endDate: '2024-01-31',
                daysRemaining: 5,
                embedCover: false,
                heroCoverUrl: null
            });

            expect(html).toContain('Jane Smith');
            expect(html).toContain('IT Satisfaction Survey');
            expect(html).toContain('5 hari lagi');
        });

        test('should render approval notification template', async () => {
            const html = await emailService.renderTemplate('approval-notification', {
                recipientName: 'Admin User',
                surveyTitle: 'IT Satisfaction Survey',
                respondentEmail: 'respondent@example.com',
                questionText: 'How satisfied are you?',
                approvalReason: 'Valid reason',
                approverName: 'IT Lead',
                approvalDate: '2024-01-15'
            });

            expect(html).toContain('Admin User');
            expect(html).toContain('IT Satisfaction Survey');
            expect(html).toContain('respondent@example.com');
            expect(html).toContain('DISETUJUI');
        });

        test('should render rejection notification template', async () => {
            const html = await emailService.renderTemplate('rejection-notification', {
                recipientName: 'Admin User',
                surveyTitle: 'IT Satisfaction Survey',
                respondentEmail: 'respondent@example.com',
                questionText: 'How satisfied are you?',
                rejectionReason: 'Not valid',
                rejectorName: 'IT Lead',
                rejectionDate: '2024-01-15'
            });

            expect(html).toContain('Admin User');
            expect(html).toContain('IT Satisfaction Survey');
            expect(html).toContain('respondent@example.com');
            expect(html).toContain('DITOLAK');
            expect(html).toContain('Not valid');
        });

        test('should throw error for non-existent template', async () => {
            await expect(
                emailService.renderTemplate('non-existent-template', {})
            ).rejects.toThrow('Template rendering failed');
        });
    });

    describe('delay', () => {
        test('should delay for specified milliseconds', async () => {
            const start = Date.now();
            await emailService.delay(100);
            const elapsed = Date.now() - start;
            
            expect(elapsed).toBeGreaterThanOrEqual(100);
            expect(elapsed).toBeLessThan(200);
        });
    });

    describe('getTemplate', () => {
        test('should get template content', async () => {
            const content = await emailService.getTemplate('survey-invitation');
            
            expect(content).toContain('<!DOCTYPE html>');
            expect(content).toContain('surveyTitle');
            expect(content).toContain('recipientName');
        });

        test('should throw error for non-existent template', async () => {
            await expect(
                emailService.getTemplate('non-existent')
            ).rejects.toThrow('Template not found');
        });
    });
});
