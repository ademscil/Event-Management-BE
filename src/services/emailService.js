/**
 * Email Service
 * Handles email sending, template rendering, and email logging
 */

const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs').promises;
const sql = require('mssql');
const logger = require('../config/logger');
const { getPool } = require('../database/connection');

/**
 * @typedef {Object} EmailOptions
 * @property {string} to - Recipient email address
 * @property {string} subject - Email subject
 * @property {string} template - Template name (without .ejs extension)
 * @property {Object} data - Template data
 * @property {string} [surveyId] - Survey ID for logging
 * @property {string} [emailType] - Email type (Blast, Reminder, Notification)
 */

/**
 * @typedef {Object} SendResult
 * @property {boolean} success
 * @property {string} [messageId]
 * @property {string} [error]
 */

class EmailService {
    constructor() {
        this.transporter = null;
        this.templatesDir = path.join(__dirname, '../templates/email');
        this.initializeTransporter();
    }

    /**
     * Initialize nodemailer transporter
     */
    initializeTransporter() {
        try {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            logger.info('Email transporter initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize email transporter:', error);
            throw error;
        }
    }

    /**
     * Render email template with data
     * @param {string} templateName - Template name (without .ejs extension)
     * @param {Object} data - Template data
     * @returns {Promise<string>} Rendered HTML
     */
    async renderTemplate(templateName, data) {
        try {
            const templatePath = path.join(this.templatesDir, `${templateName}.ejs`);
            const templateContent = await fs.readFile(templatePath, 'utf-8');
            const html = ejs.render(templateContent, data);
            return html;
        } catch (error) {
            logger.error(`Failed to render template ${templateName}:`, error);
            throw new Error(`Template rendering failed: ${error.message}`);
        }
    }

    /**
     * Get template by name
     * @param {string} templateName - Template name
     * @returns {Promise<string>} Template content
     */
    async getTemplate(templateName) {
        try {
            const templatePath = path.join(this.templatesDir, `${templateName}.ejs`);
            const content = await fs.readFile(templatePath, 'utf-8');
            return content;
        } catch (error) {
            logger.error(`Failed to get template ${templateName}:`, error);
            throw new Error(`Template not found: ${templateName}`);
        }
    }

    /**
     * Send email
     * @param {EmailOptions} options - Email options
     * @returns {Promise<SendResult>}
     */
    async sendEmail(options) {
        const { to, subject, template, data, surveyId, emailType = 'Notification' } = options;

        try {
            // Render template
            const html = await this.renderTemplate(template, data);

            // Send email
            const info = await this.transporter.sendMail({
                from: process.env.SMTP_FROM,
                to,
                subject,
                html
            });

            // Log email
            await this.logEmail({
                surveyId,
                recipientEmail: to,
                recipientName: data.recipientName || null,
                subject,
                emailType,
                status: 'Sent',
                errorMessage: null
            });

            logger.info(`Email sent successfully to ${to}`, { messageId: info.messageId });

            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            logger.error(`Failed to send email to ${to}:`, error);

            // Log failed email
            await this.logEmail({
                surveyId,
                recipientEmail: to,
                recipientName: data.recipientName || null,
                subject,
                emailType,
                status: 'Failed',
                errorMessage: error.message
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send batch emails with rate limiting
     * @param {EmailOptions[]} emails - Array of email options
     * @param {number} [batchSize=50] - Number of emails per batch
     * @param {number} [delayMs=1000] - Delay between batches in milliseconds
     * @returns {Promise<Object>} Results summary
     */
    async sendBatch(emails, batchSize = 50, delayMs = 1000) {
        const results = {
            total: emails.length,
            sent: 0,
            failed: 0,
            errors: []
        };

        for (let i = 0; i < emails.length; i += batchSize) {
            const batch = emails.slice(i, i + batchSize);
            
            logger.info(`Sending batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(emails.length / batchSize)}`);

            const batchPromises = batch.map(email => this.sendEmail(email));
            const batchResults = await Promise.allSettled(batchPromises);

            batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.success) {
                    results.sent++;
                } else {
                    results.failed++;
                    results.errors.push({
                        email: batch[index].to,
                        error: result.status === 'fulfilled' ? result.value.error : result.reason
                    });
                }
            });

            // Delay between batches (except for the last batch)
            if (i + batchSize < emails.length) {
                await this.delay(delayMs);
            }
        }

        logger.info(`Batch sending completed: ${results.sent} sent, ${results.failed} failed`);

        return results;
    }

    /**
     * Log email to database
     * @param {Object} logData - Email log data
     * @returns {Promise<void>}
     */
    async logEmail(logData) {
        const pool = await getPool();
        
        try {
            await pool.request()
                .input('surveyId', sql.UniqueIdentifier, logData.surveyId || null)
                .input('recipientEmail', sql.NVarChar(255), logData.recipientEmail)
                .input('recipientName', sql.NVarChar(200), logData.recipientName)
                .input('subject', sql.NVarChar(500), logData.subject)
                .input('emailType', sql.NVarChar(50), logData.emailType)
                .input('status', sql.NVarChar(50), logData.status)
                .input('errorMessage', sql.NVarChar(sql.MAX), logData.errorMessage)
                .query(`
                    INSERT INTO EmailLogs (
                        SurveyId, RecipientEmail, RecipientName, Subject,
                        EmailType, Status, ErrorMessage, SentAt
                    )
                    VALUES (
                        @surveyId, @recipientEmail, @recipientName, @subject,
                        @emailType, @status, @errorMessage, GETDATE()
                    )
                `);
        } catch (error) {
            logger.error('Failed to log email:', error);
            // Don't throw - logging failure shouldn't prevent email sending
        }
    }

    /**
     * Check if email was sent recently (duplicate prevention)
     * @param {string} recipientEmail - Recipient email
     * @param {string} surveyId - Survey ID
     * @param {number} [hoursWindow=24] - Time window in hours
     * @returns {Promise<boolean>} True if email was sent recently
     */
    async wasEmailSentRecently(recipientEmail, surveyId, hoursWindow = 24) {
        const pool = await getPool();
        
        try {
            const result = await pool.request()
                .input('recipientEmail', sql.NVarChar(255), recipientEmail)
                .input('surveyId', sql.UniqueIdentifier, surveyId)
                .input('hoursWindow', sql.Int, hoursWindow)
                .query(`
                    SELECT COUNT(*) as count
                    FROM EmailLogs
                    WHERE RecipientEmail = @recipientEmail
                        AND SurveyId = @surveyId
                        AND Status = 'Sent'
                        AND SentAt >= DATEADD(HOUR, -@hoursWindow, GETDATE())
                `);

            return result.recordset[0].count > 0;
        } catch (error) {
            logger.error('Failed to check email history:', error);
            return false; // On error, allow sending
        }
    }

    /**
     * Validate email address format
     * @param {string} email - Email address
     * @returns {boolean} True if valid
     */
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Delay helper for rate limiting
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Send survey invitation email
     * @param {Object} params - Email parameters
     * @returns {Promise<SendResult>}
     */
    async sendSurveyInvitation(params) {
        const {
            recipientEmail,
            recipientName,
            surveyId,
            surveyTitle,
            surveyDescription,
            surveyLink,
            startDate,
            endDate,
            targetRespondents,
            embedCover,
            heroCoverUrl
        } = params;

        return this.sendEmail({
            to: recipientEmail,
            subject: `Undangan Survey: ${surveyTitle}`,
            template: 'survey-invitation',
            data: {
                recipientName,
                surveyTitle,
                surveyDescription,
                surveyLink,
                startDate,
                endDate,
                targetRespondents,
                embedCover,
                heroCoverUrl
            },
            surveyId,
            emailType: 'Blast'
        });
    }

    /**
     * Send survey reminder email
     * @param {Object} params - Email parameters
     * @returns {Promise<SendResult>}
     */
    async sendSurveyReminder(params) {
        const {
            recipientEmail,
            recipientName,
            surveyId,
            surveyTitle,
            surveyLink,
            endDate,
            daysRemaining,
            embedCover,
            heroCoverUrl
        } = params;

        return this.sendEmail({
            to: recipientEmail,
            subject: `Reminder: ${surveyTitle} - Segera Berakhir`,
            template: 'survey-reminder',
            data: {
                recipientName,
                surveyTitle,
                surveyLink,
                endDate,
                daysRemaining,
                embedCover,
                heroCoverUrl
            },
            surveyId,
            emailType: 'Reminder'
        });
    }

    /**
     * Send approval notification email
     * @param {Object} params - Email parameters
     * @returns {Promise<SendResult>}
     */
    async sendApprovalNotification(params) {
        const {
            recipientEmail,
            recipientName,
            surveyTitle,
            respondentEmail,
            questionText,
            approvalReason,
            approverName,
            approvalDate
        } = params;

        return this.sendEmail({
            to: recipientEmail,
            subject: `Takeout Disetujui - ${surveyTitle}`,
            template: 'approval-notification',
            data: {
                recipientName,
                surveyTitle,
                respondentEmail,
                questionText,
                approvalReason,
                approverName,
                approvalDate
            },
            emailType: 'Notification'
        });
    }

    /**
     * Send rejection notification email
     * @param {Object} params - Email parameters
     * @returns {Promise<SendResult>}
     */
    async sendRejectionNotification(params) {
        const {
            recipientEmail,
            recipientName,
            surveyTitle,
            respondentEmail,
            questionText,
            rejectionReason,
            rejectorName,
            rejectionDate
        } = params;

        return this.sendEmail({
            to: recipientEmail,
            subject: `Takeout Ditolak - ${surveyTitle}`,
            template: 'rejection-notification',
            data: {
                recipientName,
                surveyTitle,
                respondentEmail,
                questionText,
                rejectionReason,
                rejectorName,
                rejectionDate
            },
            emailType: 'Notification'
        });
    }

    /**
     * Get target recipients based on organizational criteria
     * @param {Object} criteria - Target criteria
     * @returns {Promise<Array>} Array of recipients
     */
    async getTargetRecipients(criteria) {
        const pool = await getPool();
        const {
            businessUnitIds = [],
            divisionIds = [],
            departmentIds = [],
            functionIds = []
        } = criteria;

        try {
            let query = `
                SELECT DISTINCT 
                    u.UserId,
                    u.Email,
                    u.DisplayName,
                    bu.BusinessUnitName,
                    d.DivisionName,
                    dept.DepartmentName
                FROM Users u
                LEFT JOIN BusinessUnits bu ON u.BusinessUnitId = bu.BusinessUnitId
                LEFT JOIN Divisions d ON u.DivisionId = d.DivisionId
                LEFT JOIN Departments dept ON u.DepartmentId = dept.DepartmentId
                WHERE u.IsActive = 1
                    AND u.Email IS NOT NULL
                    AND u.Email != ''
            `;

            const request = pool.request();

            // Add filters based on criteria
            if (businessUnitIds.length > 0) {
                query += ` AND u.BusinessUnitId IN (${businessUnitIds.map((_, i) => `@bu${i}`).join(',')})`;
                businessUnitIds.forEach((id, i) => {
                    request.input(`bu${i}`, sql.UniqueIdentifier, id);
                });
            }

            if (divisionIds.length > 0) {
                query += ` AND u.DivisionId IN (${divisionIds.map((_, i) => `@div${i}`).join(',')})`;
                divisionIds.forEach((id, i) => {
                    request.input(`div${i}`, sql.UniqueIdentifier, id);
                });
            }

            if (departmentIds.length > 0) {
                query += ` AND u.DepartmentId IN (${departmentIds.map((_, i) => `@dept${i}`).join(',')})`;
                departmentIds.forEach((id, i) => {
                    request.input(`dept${i}`, sql.UniqueIdentifier, id);
                });
            }

            if (functionIds.length > 0) {
                query += ` AND u.FunctionId IN (${functionIds.map((_, i) => `@func${i}`).join(',')})`;
                functionIds.forEach((id, i) => {
                    request.input(`func${i}`, sql.UniqueIdentifier, id);
                });
            }

            query += ` ORDER BY u.DisplayName`;

            const result = await request.query(query);

            return result.recordset.map(row => ({
                userId: row.UserId,
                email: row.Email,
                name: row.DisplayName,
                businessUnit: row.BusinessUnitName,
                division: row.DivisionName,
                department: row.DepartmentName
            }));
        } catch (error) {
            logger.error('Failed to get target recipients:', error);
            throw error;
        }
    }

    /**
     * Send survey blast to target recipients
     * @param {Object} params - Blast parameters
     * @returns {Promise<Object>} Results summary
     */
    async sendSurveyBlast(params) {
        const {
            surveyId,
            targetCriteria,
            emailTemplate,
            embedCover = false,
            duplicatePreventionHours = 24
        } = params;

        try {
            // Get survey details
            const pool = await getPool();
            const surveyResult = await pool.request()
                .input('surveyId', sql.UniqueIdentifier, surveyId)
                .query(`
                    SELECT 
                        s.SurveyId,
                        s.Title,
                        s.Description,
                        s.StartDate,
                        s.EndDate,
                        s.SurveyLink,
                        s.TargetRespondents,
                        sc.HeroImageUrl
                    FROM Surveys s
                    LEFT JOIN SurveyConfiguration sc ON s.SurveyId = sc.SurveyId
                    WHERE s.SurveyId = @surveyId
                `);

            if (surveyResult.recordset.length === 0) {
                throw new Error('Survey not found');
            }

            const survey = surveyResult.recordset[0];

            // Get target recipients
            const recipients = await this.getTargetRecipients(targetCriteria);

            if (recipients.length === 0) {
                logger.warn('No recipients found for survey blast');
                return {
                    total: 0,
                    sent: 0,
                    failed: 0,
                    skipped: 0,
                    errors: []
                };
            }

            logger.info(`Preparing to send survey blast to ${recipients.length} recipients`);

            // Filter out recipients who received email recently (duplicate prevention)
            const filteredRecipients = [];
            let skippedCount = 0;

            for (const recipient of recipients) {
                if (!this.validateEmail(recipient.email)) {
                    logger.warn(`Invalid email address: ${recipient.email}`);
                    skippedCount++;
                    continue;
                }

                const wasSent = await this.wasEmailSentRecently(
                    recipient.email,
                    surveyId,
                    duplicatePreventionHours
                );

                if (wasSent) {
                    logger.info(`Skipping ${recipient.email} - email sent recently`);
                    skippedCount++;
                    continue;
                }

                filteredRecipients.push(recipient);
            }

            logger.info(`Sending to ${filteredRecipients.length} recipients (${skippedCount} skipped)`);

            // Prepare email options for batch sending
            const emails = filteredRecipients.map(recipient => ({
                to: recipient.email,
                subject: `Undangan Survey: ${survey.Title}`,
                template: emailTemplate || 'survey-invitation',
                data: {
                    recipientName: recipient.name,
                    surveyTitle: survey.Title,
                    surveyDescription: survey.Description,
                    surveyLink: survey.SurveyLink || `${process.env.BASE_URL}/survey/index.html?id=${surveyId}`,
                    startDate: new Date(survey.StartDate).toLocaleDateString('id-ID'),
                    endDate: new Date(survey.EndDate).toLocaleDateString('id-ID'),
                    targetRespondents: survey.TargetRespondents,
                    embedCover,
                    heroCoverUrl: embedCover ? survey.HeroImageUrl : null
                },
                surveyId,
                emailType: 'Blast'
            }));

            // Send batch emails
            const results = await this.sendBatch(emails);

            return {
                ...results,
                skipped: skippedCount
            };
        } catch (error) {
            logger.error('Failed to send survey blast:', error);
            throw error;
        }
    }

    /**
     * Get non-respondents for a survey
     * @param {string} surveyId - Survey ID
     * @returns {Promise<Array>} Array of non-respondents
     */
    async getNonRespondents(surveyId) {
        const pool = await getPool();

        try {
            // Get all recipients who received the blast email
            const blastRecipientsResult = await pool.request()
                .input('surveyId', sql.UniqueIdentifier, surveyId)
                .query(`
                    SELECT DISTINCT 
                        el.RecipientEmail,
                        el.RecipientName
                    FROM EmailLogs el
                    WHERE el.SurveyId = @surveyId
                        AND el.EmailType = 'Blast'
                        AND el.Status = 'Sent'
                `);

            const blastRecipients = blastRecipientsResult.recordset;

            if (blastRecipients.length === 0) {
                logger.warn('No blast recipients found for survey');
                return [];
            }

            // Get respondents who have submitted responses
            const respondentsResult = await pool.request()
                .input('surveyId', sql.UniqueIdentifier, surveyId)
                .query(`
                    SELECT DISTINCT RespondentEmail
                    FROM Responses
                    WHERE SurveyId = @surveyId
                `);

            const respondentEmails = new Set(
                respondentsResult.recordset.map(r => r.RespondentEmail.toLowerCase())
            );

            // Filter out respondents
            const nonRespondents = blastRecipients.filter(
                recipient => !respondentEmails.has(recipient.RecipientEmail.toLowerCase())
            );

            logger.info(`Found ${nonRespondents.length} non-respondents out of ${blastRecipients.length} recipients`);

            return nonRespondents.map(r => ({
                email: r.RecipientEmail,
                name: r.RecipientName
            }));
        } catch (error) {
            logger.error('Failed to get non-respondents:', error);
            throw error;
        }
    }

    /**
     * Send reminders to non-respondents
     * @param {Object} params - Reminder parameters
     * @returns {Promise<Object>} Results summary
     */
    async sendReminders(params) {
        const {
            surveyId,
            emailTemplate,
            embedCover = false,
            duplicatePreventionHours = 24
        } = params;

        try {
            // Get survey details
            const pool = await getPool();
            const surveyResult = await pool.request()
                .input('surveyId', sql.UniqueIdentifier, surveyId)
                .query(`
                    SELECT 
                        s.SurveyId,
                        s.Title,
                        s.EndDate,
                        s.SurveyLink,
                        sc.HeroImageUrl
                    FROM Surveys s
                    LEFT JOIN SurveyConfiguration sc ON s.SurveyId = sc.SurveyId
                    WHERE s.SurveyId = @surveyId
                `);

            if (surveyResult.recordset.length === 0) {
                throw new Error('Survey not found');
            }

            const survey = surveyResult.recordset[0];

            // Check if survey is still active
            const endDate = new Date(survey.EndDate);
            const now = new Date();

            if (now > endDate) {
                logger.warn('Survey has already ended, skipping reminders');
                return {
                    total: 0,
                    sent: 0,
                    failed: 0,
                    skipped: 0,
                    errors: [],
                    message: 'Survey has ended'
                };
            }

            // Calculate days remaining
            const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

            // Get non-respondents
            const nonRespondents = await this.getNonRespondents(surveyId);

            if (nonRespondents.length === 0) {
                logger.info('No non-respondents found, all recipients have responded');
                return {
                    total: 0,
                    sent: 0,
                    failed: 0,
                    skipped: 0,
                    errors: [],
                    message: 'All recipients have responded'
                };
            }

            logger.info(`Preparing to send reminders to ${nonRespondents.length} non-respondents`);

            // Filter out recipients who received reminder recently (duplicate prevention)
            const filteredRecipients = [];
            let skippedCount = 0;

            for (const recipient of nonRespondents) {
                if (!this.validateEmail(recipient.email)) {
                    logger.warn(`Invalid email address: ${recipient.email}`);
                    skippedCount++;
                    continue;
                }

                const wasSent = await this.wasEmailSentRecently(
                    recipient.email,
                    surveyId,
                    duplicatePreventionHours
                );

                if (wasSent) {
                    logger.info(`Skipping ${recipient.email} - reminder sent recently`);
                    skippedCount++;
                    continue;
                }

                filteredRecipients.push(recipient);
            }

            logger.info(`Sending to ${filteredRecipients.length} recipients (${skippedCount} skipped)`);

            // Prepare email options for batch sending
            const emails = filteredRecipients.map(recipient => ({
                to: recipient.email,
                subject: `Reminder: ${survey.Title} - Segera Berakhir`,
                template: emailTemplate || 'survey-reminder',
                data: {
                    recipientName: recipient.name,
                    surveyTitle: survey.Title,
                    surveyLink: survey.SurveyLink || `${process.env.BASE_URL}/survey/index.html?id=${surveyId}`,
                    endDate: endDate.toLocaleDateString('id-ID'),
                    daysRemaining,
                    embedCover,
                    heroCoverUrl: embedCover ? survey.HeroImageUrl : null
                },
                surveyId,
                emailType: 'Reminder'
            }));

            // Send batch emails
            const results = await this.sendBatch(emails);

            return {
                ...results,
                skipped: skippedCount
            };
        } catch (error) {
            logger.error('Failed to send reminders:', error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new EmailService();
