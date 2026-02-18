/**
 * Scheduled Operations Processor
 * Background job that processes scheduled email blasts and reminders
 */

const cron = require('node-cron');
const sql = require('mssql');
const logger = require('../config/logger');
const { getPool } = require('../database/connection');
const emailService = require('./emailService');

class ScheduledOperationsProcessor {
    constructor() {
        this.isRunning = false;
        this.cronJob = null;
    }

    /**
     * Start the scheduled operations processor
     * Runs every minute to check for pending operations
     */
    start() {
        if (this.cronJob) {
            logger.warn('Scheduled operations processor is already running');
            return;
        }

        // Run every minute
        this.cronJob = cron.schedule('* * * * *', async () => {
            if (this.isRunning) {
                logger.debug('Previous operation still running, skipping this cycle');
                return;
            }

            this.isRunning = true;
            try {
                await this.processScheduledOperations();
            } catch (error) {
                logger.error('Error processing scheduled operations:', error);
            } finally {
                this.isRunning = false;
            }
        });

        logger.info('Scheduled operations processor started');
    }

    /**
     * Stop the scheduled operations processor
     */
    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            logger.info('Scheduled operations processor stopped');
        }
    }

    /**
     * Process all pending scheduled operations
     */
    async processScheduledOperations() {
        const pool = await getPool();

        try {
            // Get pending operations that are due
            const result = await pool.request()
                .query(`
                    SELECT 
                        OperationId,
                        SurveyId,
                        OperationType,
                        Frequency,
                        ScheduledDate,
                        ScheduledTime,
                        DayOfWeek,
                        EmailTemplate,
                        EmbedCover,
                        TargetCriteria,
                        NextExecutionAt
                    FROM ScheduledOperations
                    WHERE Status = 'Pending'
                        AND NextExecutionAt <= GETDATE()
                    ORDER BY NextExecutionAt
                `);

            const operations = result.recordset;

            if (operations.length === 0) {
                logger.debug('No pending operations to process');
                return;
            }

            logger.info(`Processing ${operations.length} scheduled operations`);

            for (const operation of operations) {
                await this.processOperation(operation);
            }
        } catch (error) {
            logger.error('Failed to process scheduled operations:', error);
            throw error;
        }
    }

    /**
     * Process a single scheduled operation
     * @param {Object} operation - Operation details
     */
    async processOperation(operation) {
        const pool = await getPool();
        const operationId = operation.OperationId;

        try {
            logger.info(`Processing operation ${operationId} (${operation.OperationType})`);

            // Mark as running
            await pool.request()
                .input('operationId', sql.UniqueIdentifier, operationId)
                .query(`
                    UPDATE ScheduledOperations
                    SET Status = 'Running',
                        LastExecutedAt = GETDATE()
                    WHERE OperationId = @operationId
                `);

            // Execute the operation
            let result;
            if (operation.OperationType === 'Blast') {
                result = await this.executeBlast(operation);
            } else if (operation.OperationType === 'Reminder') {
                result = await this.executeReminder(operation);
            } else {
                throw new Error(`Unknown operation type: ${operation.OperationType}`);
            }

            // Calculate next execution time for recurring operations
            const nextExecutionAt = this.calculateNextExecution(operation);

            // Update operation status
            if (nextExecutionAt && operation.Frequency !== 'once') {
                // Recurring operation - set back to Pending with new execution time
                await pool.request()
                    .input('operationId', sql.UniqueIdentifier, operationId)
                    .input('nextExecutionAt', sql.DateTime2, nextExecutionAt)
                    .query(`
                        UPDATE ScheduledOperations
                        SET Status = 'Pending',
                            NextExecutionAt = @nextExecutionAt,
                            ExecutionCount = ExecutionCount + 1,
                            ErrorMessage = NULL
                        WHERE OperationId = @operationId
                    `);

                logger.info(`Operation ${operationId} completed. Next execution: ${nextExecutionAt}`);
            } else {
                // One-time operation - mark as completed
                await pool.request()
                    .input('operationId', sql.UniqueIdentifier, operationId)
                    .query(`
                        UPDATE ScheduledOperations
                        SET Status = 'Completed',
                            ExecutionCount = ExecutionCount + 1,
                            ErrorMessage = NULL
                        WHERE OperationId = @operationId
                    `);

                logger.info(`Operation ${operationId} completed (one-time)`);
            }

            logger.info(`Operation ${operationId} result: ${result.sent} sent, ${result.failed} failed`);
        } catch (error) {
            logger.error(`Failed to process operation ${operationId}:`, error);

            // Mark as failed
            await pool.request()
                .input('operationId', sql.UniqueIdentifier, operationId)
                .input('errorMessage', sql.NVarChar(sql.MAX), error.message)
                .query(`
                    UPDATE ScheduledOperations
                    SET Status = 'Failed',
                        ErrorMessage = @errorMessage
                    WHERE OperationId = @operationId
                `);
        }
    }

    /**
     * Execute a blast operation
     * @param {Object} operation - Operation details
     * @returns {Promise<Object>} Results
     */
    async executeBlast(operation) {
        const targetCriteria = operation.TargetCriteria 
            ? JSON.parse(operation.TargetCriteria) 
            : {};

        return await emailService.sendSurveyBlast({
            surveyId: operation.SurveyId,
            targetCriteria,
            emailTemplate: operation.EmailTemplate || 'survey-invitation',
            embedCover: operation.EmbedCover
        });
    }

    /**
     * Execute a reminder operation
     * @param {Object} operation - Operation details
     * @returns {Promise<Object>} Results
     */
    async executeReminder(operation) {
        return await emailService.sendReminders({
            surveyId: operation.SurveyId,
            emailTemplate: operation.EmailTemplate || 'survey-reminder',
            embedCover: operation.EmbedCover
        });
    }

    /**
     * Calculate next execution time for recurring operations
     * @param {Object} operation - Operation details
     * @returns {Date|null} Next execution time or null for one-time operations
     */
    calculateNextExecution(operation) {
        if (operation.Frequency === 'once') {
            return null;
        }

        const now = new Date();
        let nextExecution = new Date(now);

        switch (operation.Frequency) {
            case 'daily':
                // Execute at the same time tomorrow
                if (operation.ScheduledTime) {
                    const [hours, minutes] = operation.ScheduledTime.split(':');
                    nextExecution.setDate(nextExecution.getDate() + 1);
                    nextExecution.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                } else {
                    nextExecution.setDate(nextExecution.getDate() + 1);
                }
                break;

            case 'weekly':
                // Execute on the same day of week next week
                if (operation.DayOfWeek !== null) {
                    const currentDay = nextExecution.getDay();
                    const targetDay = operation.DayOfWeek;
                    let daysToAdd = targetDay - currentDay;
                    
                    if (daysToAdd <= 0) {
                        daysToAdd += 7; // Next week
                    }
                    
                    nextExecution.setDate(nextExecution.getDate() + daysToAdd);
                    
                    if (operation.ScheduledTime) {
                        const [hours, minutes] = operation.ScheduledTime.split(':');
                        nextExecution.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                    }
                } else {
                    nextExecution.setDate(nextExecution.getDate() + 7);
                }
                break;

            case 'monthly':
                // Execute on the same date next month
                nextExecution.setMonth(nextExecution.getMonth() + 1);
                
                if (operation.ScheduledTime) {
                    const [hours, minutes] = operation.ScheduledTime.split(':');
                    nextExecution.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                }
                break;

            default:
                logger.warn(`Unknown frequency: ${operation.Frequency}`);
                return null;
        }

        return nextExecution;
    }

    /**
     * Manually trigger processing (for testing)
     */
    async triggerProcessing() {
        if (this.isRunning) {
            throw new Error('Processing is already running');
        }

        this.isRunning = true;
        try {
            await this.processScheduledOperations();
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get processor status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isScheduled: this.cronJob !== null
        };
    }
}

// Export singleton instance
module.exports = new ScheduledOperationsProcessor();
