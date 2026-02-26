const sql = require('mssql');
const db = require('../database/connection');
const logger = require('../config/logger');

/**
 * @typedef {Object} AuditLog
 * @property {string} logId
 * @property {Date} timestamp
 * @property {string} userId
 * @property {string} username
 * @property {string} action - 'Create' | 'Update' | 'Delete' | 'Access' | 'Login' | 'Logout' | 'LoginFailed' | 'Approve' | 'Reject' | 'Export'
 * @property {string} entityType
 * @property {string} entityId
 * @property {Object} oldValues - JSON
 * @property {Object} newValues - JSON
 * @property {string} ipAddress
 * @property {string} userAgent
 */

/**
 * Audit Service for logging all system actions
 * Implements comprehensive audit trail for security and compliance
 */
class AuditService {
    constructor() {
        this.validActions = [
            'Create', 'Update', 'Delete', 'Access', 
            'Login', 'Logout', 'LoginFailed', 
            'Approve', 'Reject', 'Export'
        ];
    }

    /**
     * Log an action to the audit trail
     * @param {Object} logData - The audit log data
     * @param {string} logData.userId - User ID performing the action (optional for failed logins)
     * @param {string} logData.username - Username performing the action
     * @param {string} logData.action - Action type (Create, Update, Delete, Access, Login, Logout, LoginFailed, Approve, Reject, Export)
     * @param {string} logData.entityType - Type of entity affected (optional)
     * @param {string} logData.entityId - ID of entity affected (optional)
     * @param {Object} logData.oldValues - Previous values before change (optional)
     * @param {Object} logData.newValues - New values after change (optional)
     * @param {string} logData.ipAddress - IP address of the user
     * @param {string} logData.userAgent - User agent string from browser
     * @returns {Promise<Object>} The created audit log entry
     */
    async logAction(logData) {
        try {
            // Validate action type
            if (!this.validActions.includes(logData.action)) {
                throw new Error(`Invalid action type: ${logData.action}. Must be one of: ${this.validActions.join(', ')}`);
            }

            const pool = await db.getPool();
            
            // Convert objects to JSON strings
            const oldValuesJson = logData.oldValues ? JSON.stringify(logData.oldValues) : null;
            const newValuesJson = logData.newValues ? JSON.stringify(logData.newValues) : null;

            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, logData.userId || null)
                .input('username', sql.NVarChar(50), logData.username)
                .input('action', sql.NVarChar(50), logData.action)
                .input('entityType', sql.NVarChar(100), logData.entityType || null)
                .input('entityId', sql.UniqueIdentifier, logData.entityId || null)
                .input('oldValues', sql.NVarChar(sql.MAX), oldValuesJson)
                .input('newValues', sql.NVarChar(sql.MAX), newValuesJson)
                .input('ipAddress', sql.NVarChar(50), logData.ipAddress || null)
                .input('userAgent', sql.NVarChar(500), logData.userAgent || null)
                .query(`
                    INSERT INTO AuditLogs (
                        UserId, Username, Action, EntityType, EntityId,
                        OldValues, NewValues, IPAddress, UserAgent
                    )
                    OUTPUT INSERTED.*
                    VALUES (
                        @userId, @username, @action, @entityType, @entityId,
                        @oldValues, @newValues, @ipAddress, @userAgent
                    )
                `);

            const auditLog = result.recordset[0];
            
            logger.info('Audit log created', {
                logId: auditLog.LogId,
                action: logData.action,
                entityType: logData.entityType,
                username: logData.username
            });

            return {
                success: true,
                logId: auditLog.LogId,
                timestamp: auditLog.Timestamp,
                action: auditLog.Action,
                entityType: auditLog.EntityType,
                entityId: auditLog.EntityId
            };

        } catch (error) {
            logger.error('Error creating audit log', {
                error: error.message,
                action: logData.action,
                username: logData.username
            });
            
            // Don't throw error - audit logging should not break application flow
            // But log the error for investigation
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Log authentication attempt
     * @param {string} username - Username attempting to login
     * @param {boolean} success - Whether login was successful
     * @param {string} ipAddress - IP address
     * @param {string} userAgent - User agent
     * @param {string} userId - User ID (if successful)
     * @returns {Promise<Object>}
     */
    async logAuthAttempt(username, success, ipAddress, userAgent, userId = null) {
        return this.logAction({
            userId: userId,
            username: username,
            action: success ? 'Login' : 'LoginFailed',
            ipAddress: ipAddress,
            userAgent: userAgent
        });
    }

    /**
     * Log logout action
     * @param {string} userId - User ID
     * @param {string} username - Username
     * @param {string} ipAddress - IP address
     * @param {string} userAgent - User agent
     * @returns {Promise<Object>}
     */
    async logLogout(userId, username, ipAddress, userAgent) {
        return this.logAction({
            userId: userId,
            username: username,
            action: 'Logout',
            ipAddress: ipAddress,
            userAgent: userAgent
        });
    }

    /**
     * Log entity creation
     * @param {string} userId - User ID
     * @param {string} username - Username
     * @param {string} entityType - Type of entity
     * @param {string} entityId - ID of created entity
     * @param {Object} newValues - Created entity values
     * @param {string} ipAddress - IP address
     * @param {string} userAgent - User agent
     * @returns {Promise<Object>}
     */
    async logCreate(userId, username, entityType, entityId, newValues, ipAddress, userAgent) {
        return this.logAction({
            userId: userId,
            username: username,
            action: 'Create',
            entityType: entityType,
            entityId: entityId,
            newValues: newValues,
            ipAddress: ipAddress,
            userAgent: userAgent
        });
    }

    /**
     * Log entity update
     * @param {string} userId - User ID
     * @param {string} username - Username
     * @param {string} entityType - Type of entity
     * @param {string} entityId - ID of updated entity
     * @param {Object} oldValues - Previous values
     * @param {Object} newValues - New values
     * @param {string} ipAddress - IP address
     * @param {string} userAgent - User agent
     * @returns {Promise<Object>}
     */
    async logUpdate(userId, username, entityType, entityId, oldValues, newValues, ipAddress, userAgent) {
        return this.logAction({
            userId: userId,
            username: username,
            action: 'Update',
            entityType: entityType,
            entityId: entityId,
            oldValues: oldValues,
            newValues: newValues,
            ipAddress: ipAddress,
            userAgent: userAgent
        });
    }

    /**
     * Log entity deletion
     * @param {string} userId - User ID
     * @param {string} username - Username
     * @param {string} entityType - Type of entity
     * @param {string} entityId - ID of deleted entity
     * @param {Object} oldValues - Deleted entity values
     * @param {string} ipAddress - IP address
     * @param {string} userAgent - User agent
     * @returns {Promise<Object>}
     */
    async logDelete(userId, username, entityType, entityId, oldValues, ipAddress, userAgent) {
        return this.logAction({
            userId: userId,
            username: username,
            action: 'Delete',
            entityType: entityType,
            entityId: entityId,
            oldValues: oldValues,
            ipAddress: ipAddress,
            userAgent: userAgent
        });
    }

    /**
     * Log sensitive data access
     * @param {string} userId - User ID
     * @param {string} username - Username
     * @param {string} entityType - Type of entity accessed
     * @param {string} entityId - ID of accessed entity
     * @param {string} ipAddress - IP address
     * @param {string} userAgent - User agent
     * @returns {Promise<Object>}
     */
    async logAccess(userId, username, entityType, entityId, ipAddress, userAgent) {
        return this.logAction({
            userId: userId,
            username: username,
            action: 'Access',
            entityType: entityType,
            entityId: entityId,
            ipAddress: ipAddress,
            userAgent: userAgent
        });
    }

    /**
     * Log approval action
     * @param {string} userId - User ID
     * @param {string} username - Username
     * @param {string} entityType - Type of entity
     * @param {string} entityId - ID of entity
     * @param {Object} details - Approval details (reason, etc.)
     * @param {string} ipAddress - IP address
     * @param {string} userAgent - User agent
     * @returns {Promise<Object>}
     */
    async logApprove(userId, username, entityType, entityId, details, ipAddress, userAgent) {
        return this.logAction({
            userId: userId,
            username: username,
            action: 'Approve',
            entityType: entityType,
            entityId: entityId,
            newValues: details,
            ipAddress: ipAddress,
            userAgent: userAgent
        });
    }

    /**
     * Log rejection action
     * @param {string} userId - User ID
     * @param {string} username - Username
     * @param {string} entityType - Type of entity
     * @param {string} entityId - ID of entity
     * @param {Object} details - Rejection details (reason, etc.)
     * @param {string} ipAddress - IP address
     * @param {string} userAgent - User agent
     * @returns {Promise<Object>}
     */
    async logReject(userId, username, entityType, entityId, details, ipAddress, userAgent) {
        return this.logAction({
            userId: userId,
            username: username,
            action: 'Reject',
            entityType: entityType,
            entityId: entityId,
            newValues: details,
            ipAddress: ipAddress,
            userAgent: userAgent
        });
    }

    /**
     * Log data export action
     * @param {string} userId - User ID
     * @param {string} username - Username
     * @param {string} entityType - Type of data exported
     * @param {Object} exportDetails - Export details (format, filters, etc.)
     * @param {string} ipAddress - IP address
     * @param {string} userAgent - User agent
     * @returns {Promise<Object>}
     */
    async logExport(userId, username, entityType, exportDetails, ipAddress, userAgent) {
        return this.logAction({
            userId: userId,
            username: username,
            action: 'Export',
            entityType: entityType,
            newValues: exportDetails,
            ipAddress: ipAddress,
            userAgent: userAgent
        });
    }

    /**
     * Get audit logs with filtering
     * @param {Object} filter - Filter criteria
     * @param {Date} filter.startDate - Start date for filtering
     * @param {Date} filter.endDate - End date for filtering
     * @param {string} filter.userId - Filter by user ID
     * @param {string} filter.username - Filter by username
     * @param {string} filter.action - Filter by action type
     * @param {string} filter.entityType - Filter by entity type
     * @param {string} filter.entityId - Filter by entity ID
     * @param {number} filter.page - Page number (default: 1)
     * @param {number} filter.pageSize - Page size (default: 50)
     * @returns {Promise<Object>} Paginated audit logs
     */
    async getAuditLogs(filter = {}) {
        try {
            const pool = await db.getPool();
            const page = filter.page || 1;
            const pageSize = filter.pageSize || 50;
            const offset = (page - 1) * pageSize;

            // Build WHERE clause dynamically
            let whereConditions = [];
            const request = pool.request();

            if (filter.startDate) {
                whereConditions.push('Timestamp >= @startDate');
                request.input('startDate', sql.DateTime2, filter.startDate);
            }

            if (filter.endDate) {
                whereConditions.push('Timestamp <= @endDate');
                request.input('endDate', sql.DateTime2, filter.endDate);
            }

            if (filter.userId) {
                whereConditions.push('UserId = @userId');
                request.input('userId', sql.UniqueIdentifier, filter.userId);
            }

            if (filter.username) {
                whereConditions.push('Username LIKE @username');
                request.input('username', sql.NVarChar(50), `%${filter.username}%`);
            }

            if (filter.action) {
                whereConditions.push('Action = @action');
                request.input('action', sql.NVarChar(50), filter.action);
            }

            if (filter.entityType) {
                whereConditions.push('EntityType = @entityType');
                request.input('entityType', sql.NVarChar(100), filter.entityType);
            }

            if (filter.entityId) {
                whereConditions.push('EntityId = @entityId');
                request.input('entityId', sql.UniqueIdentifier, filter.entityId);
            }

            const whereClause = whereConditions.length > 0 
                ? 'WHERE ' + whereConditions.join(' AND ')
                : '';

            // Get total count
            const countResult = await request.query(`
                SELECT COUNT(*) as Total
                FROM AuditLogs
                ${whereClause}
            `);

            const totalRecords = countResult.recordset[0].Total;

            // Get paginated results
            request.input('offset', sql.Int, offset);
            request.input('pageSize', sql.Int, pageSize);

            const result = await request.query(`
                SELECT 
                    LogId,
                    Timestamp,
                    UserId,
                    Username,
                    Action,
                    EntityType,
                    EntityId,
                    OldValues,
                    NewValues,
                    IPAddress,
                    UserAgent
                FROM AuditLogs
                ${whereClause}
                ORDER BY Timestamp DESC
                OFFSET @offset ROWS
                FETCH NEXT @pageSize ROWS ONLY
            `);

            // Parse JSON fields
            const logs = result.recordset.map(log => ({
                ...log,
                OldValues: log.OldValues ? JSON.parse(log.OldValues) : null,
                NewValues: log.NewValues ? JSON.parse(log.NewValues) : null
            }));

            return {
                success: true,
                data: logs,
                pagination: {
                    page: page,
                    pageSize: pageSize,
                    totalRecords: totalRecords,
                    totalPages: Math.ceil(totalRecords / pageSize)
                }
            };

        } catch (error) {
            logger.error('Error retrieving audit logs', {
                error: error.message,
                filter: filter
            });
            throw error;
        }
    }

    /**
     * Get entity history (all audit logs for a specific entity)
     * @param {string} entityType - Type of entity
     * @param {string} entityId - ID of entity
     * @returns {Promise<Object>} Entity audit history
     */
    async getEntityHistory(entityType, entityId) {
        try {
            const pool = await db.getPool();

            const result = await pool.request()
                .input('entityType', sql.NVarChar(100), entityType)
                .input('entityId', sql.UniqueIdentifier, entityId)
                .query(`
                    SELECT 
                        LogId,
                        Timestamp,
                        UserId,
                        Username,
                        Action,
                        EntityType,
                        EntityId,
                        OldValues,
                        NewValues,
                        IPAddress,
                        UserAgent
                    FROM AuditLogs
                    WHERE EntityType = @entityType
                        AND EntityId = @entityId
                    ORDER BY Timestamp ASC
                `);

            // Parse JSON fields
            const history = result.recordset.map(log => ({
                ...log,
                OldValues: log.OldValues ? JSON.parse(log.OldValues) : null,
                NewValues: log.NewValues ? JSON.parse(log.NewValues) : null
            }));

            return {
                success: true,
                entityType: entityType,
                entityId: entityId,
                history: history,
                totalChanges: history.length
            };

        } catch (error) {
            logger.error('Error retrieving entity history', {
                error: error.message,
                entityType: entityType,
                entityId: entityId
            });
            throw error;
        }
    }

    /**
     * Get audit statistics
     * @param {Object} filter - Filter criteria
     * @param {Date} filter.startDate - Start date
     * @param {Date} filter.endDate - End date
     * @returns {Promise<Object>} Audit statistics
     */
    async getAuditStatistics(filter = {}) {
        try {
            const pool = await db.getPool();
            const request = pool.request();

            let whereConditions = [];

            if (filter.startDate) {
                whereConditions.push('Timestamp >= @startDate');
                request.input('startDate', sql.DateTime2, filter.startDate);
            }

            if (filter.endDate) {
                whereConditions.push('Timestamp <= @endDate');
                request.input('endDate', sql.DateTime2, filter.endDate);
            }

            const whereClause = whereConditions.length > 0 
                ? 'WHERE ' + whereConditions.join(' AND ')
                : '';

            const result = await request.query(`
                SELECT 
                    Action,
                    COUNT(*) as Count
                FROM AuditLogs
                ${whereClause}
                GROUP BY Action
                ORDER BY Count DESC
            `);

            const userActivityResult = await request.query(`
                SELECT TOP 10
                    Username,
                    COUNT(*) as ActionCount
                FROM AuditLogs
                ${whereClause}
                GROUP BY Username
                ORDER BY ActionCount DESC
            `);

            return {
                success: true,
                actionCounts: result.recordset,
                topUsers: userActivityResult.recordset
            };

        } catch (error) {
            logger.error('Error retrieving audit statistics', {
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = new AuditService();

