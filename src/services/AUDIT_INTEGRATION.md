# Audit Logging Integration Guide

This document explains how to integrate audit logging across all services in the CSI Portal application.

## Overview

The audit logging system consists of:
1. **auditService.js** - Core service for logging actions
2. **auditLogger.js** - Express middleware for automatic logging
3. **Integration in services** - Manual logging for specific operations

## Automatic Logging via Middleware

The audit logging middleware is already integrated in `src/app.js` and will automatically log:
- All POST, PUT, PATCH, DELETE requests to `/api/v1/*` endpoints
- Authentication attempts (login/logout) via specific middleware
- Data exports via export-specific middleware

### Configuration in app.js

```javascript
const { auditLoggerMiddleware } = require('./middleware/auditLogger');

app.use('/api/v1', auditLoggerMiddleware({
  skipPaths: [
    '/api/v1/auth/validate',
    '/api/v1/health',
    '/api/v1/audit'
  ],
  logGetRequests: false // Only log state-changing operations
}));
```

### Authentication-Specific Middleware

In `src/routes/authRoutes.js`:

```javascript
const { auditAuthMiddleware, auditLogoutMiddleware } = require('../middleware/auditLogger');

router.post('/login', auditAuthMiddleware, authController.loginValidation, authController.login);
router.post('/logout', requireAuth, auditLogoutMiddleware, authController.logout);
```

### Export-Specific Middleware

For export endpoints, use the export middleware:

```javascript
const { auditExportMiddleware } = require('../middleware/auditLogger');

router.get('/reports/export', 
  requireAuth, 
  auditExportMiddleware('Report'), 
  reportController.exportReport
);
```

## Manual Logging in Services

For operations that require more detailed logging or custom logic, use the auditService directly.

### Import the Service

```javascript
const auditService = require('./auditService');
```

### Example: User Service Integration

```javascript
class UserService {
  async createUser(data, createdBy, ipAddress, userAgent) {
    try {
      // Create user logic...
      const result = await this.repository.create(userData);
      
      // Log the creation
      await auditService.logCreate(
        createdBy.userId,
        createdBy.username,
        'User',
        result.UserId,
        {
          username: result.Username,
          email: result.Email,
          role: result.Role,
          useLDAP: result.UseLDAP
        },
        ipAddress,
        userAgent
      );
      
      return result;
    } catch (error) {
      logger.error('Error creating user', { error: error.message });
      throw error;
    }
  }

  async updateUser(userId, data, updatedBy, ipAddress, userAgent) {
    try {
      // Get old values first
      const oldUser = await this.repository.findById(userId);
      
      // Update user logic...
      const result = await this.repository.update(userId, data);
      
      // Log the update with old and new values
      await auditService.logUpdate(
        updatedBy.userId,
        updatedBy.username,
        'User',
        userId,
        {
          displayName: oldUser.DisplayName,
          email: oldUser.Email,
          role: oldUser.Role
        },
        {
          displayName: result.DisplayName,
          email: result.Email,
          role: result.Role
        },
        ipAddress,
        userAgent
      );
      
      return result;
    } catch (error) {
      logger.error('Error updating user', { error: error.message });
      throw error;
    }
  }

  async deactivateUser(userId, deactivatedBy, ipAddress, userAgent) {
    try {
      // Get user data before deactivation
      const user = await this.repository.findById(userId);
      
      // Deactivate user logic...
      await this.repository.update(userId, { IsActive: false });
      
      // Log the deletion (soft delete)
      await auditService.logDelete(
        deactivatedBy.userId,
        deactivatedBy.username,
        'User',
        userId,
        {
          username: user.Username,
          email: user.Email,
          role: user.Role
        },
        ipAddress,
        userAgent
      );
      
      return { success: true };
    } catch (error) {
      logger.error('Error deactivating user', { error: error.message });
      throw error;
    }
  }
}
```

### Example: Approval Service Integration

```javascript
class ApprovalService {
  async approveProposedTakeout(responseId, questionId, approvedBy, reason, ipAddress, userAgent) {
    try {
      // Approval logic...
      const result = await this.updateTakeoutStatus(responseId, questionId, 'TakenOut');
      
      // Log the approval
      await auditService.logApprove(
        approvedBy.userId,
        approvedBy.username,
        'QuestionResponse',
        responseId,
        {
          questionId: questionId,
          reason: reason,
          newStatus: 'TakenOut'
        },
        ipAddress,
        userAgent
      );
      
      return result;
    } catch (error) {
      logger.error('Error approving takeout', { error: error.message });
      throw error;
    }
  }

  async rejectProposedTakeout(responseId, questionId, rejectedBy, reason, ipAddress, userAgent) {
    try {
      // Rejection logic...
      const result = await this.updateTakeoutStatus(responseId, questionId, 'Active');
      
      // Log the rejection
      await auditService.logReject(
        rejectedBy.userId,
        rejectedBy.username,
        'QuestionResponse',
        responseId,
        {
          questionId: questionId,
          reason: reason,
          newStatus: 'Active'
        },
        ipAddress,
        userAgent
      );
      
      return result;
    } catch (error) {
      logger.error('Error rejecting takeout', { error: error.message });
      throw error;
    }
  }
}
```

### Example: Response Service Integration

```javascript
class ResponseService {
  async getResponseById(responseId, userId, username, ipAddress, userAgent) {
    try {
      const response = await this.repository.findById(responseId);
      
      // Log sensitive data access
      await auditService.logAccess(
        userId,
        username,
        'Response',
        responseId,
        ipAddress,
        userAgent
      );
      
      return response;
    } catch (error) {
      logger.error('Error retrieving response', { error: error.message });
      throw error;
    }
  }
}
```

## Controller Integration

Controllers should extract user info and pass it to services:

```javascript
class UserController {
  async createUser(req, res, next) {
    try {
      const userData = req.body;
      const createdBy = {
        userId: req.user.userId,
        username: req.user.username
      };
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent');
      
      const result = await userService.createUser(
        userData, 
        createdBy, 
        ipAddress, 
        userAgent
      );
      
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req, res, next) {
    try {
      const userId = req.params.id;
      const userData = req.body;
      const updatedBy = {
        userId: req.user.userId,
        username: req.user.username
      };
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent');
      
      // Store original data for middleware (optional)
      const oldUser = await userService.getUserById(userId);
      req.originalData = oldUser;
      
      const result = await userService.updateUser(
        userId, 
        userData, 
        updatedBy, 
        ipAddress, 
        userAgent
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}
```

## Helper Function for Controllers

Create a helper to extract audit context:

```javascript
// src/utils/auditHelpers.js
function getAuditContext(req) {
  return {
    userId: req.user?.userId || null,
    username: req.user?.username || 'anonymous',
    ipAddress: req.ip || 
               req.headers['x-forwarded-for']?.split(',')[0] || 
               req.connection?.remoteAddress || 
               'unknown',
    userAgent: req.get('user-agent') || 'unknown'
  };
}

module.exports = { getAuditContext };
```

Usage in controller:

```javascript
const { getAuditContext } = require('../utils/auditHelpers');

async createUser(req, res, next) {
  try {
    const auditContext = getAuditContext(req);
    const result = await userService.createUser(req.body, auditContext);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
```

## Services That Need Manual Audit Integration

The following services should integrate audit logging manually:

1. **userService.js** - User CRUD operations
2. **businessUnitService.js** - BU CRUD operations
3. **divisionService.js** - Division CRUD operations
4. **departmentService.js** - Department CRUD operations
5. **functionService.js** - Function CRUD operations
6. **applicationService.js** - Application CRUD operations
7. **mappingService.js** - Mapping CRUD operations
8. **surveyService.js** - Survey CRUD operations
9. **responseService.js** - Response access logging
10. **approvalService.js** - Approval/rejection logging
11. **reportService.js** - Report generation and export logging
12. **sapSyncService.js** - SAP sync operations

## Audit Log Retrieval

### Get Audit Logs with Filtering

```javascript
const auditService = require('./services/auditService');

// Get all audit logs
const logs = await auditService.getAuditLogs();

// Get logs with filters
const filteredLogs = await auditService.getAuditLogs({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  userId: 'some-user-id',
  action: 'Create',
  entityType: 'User',
  page: 1,
  pageSize: 50
});
```

### Get Entity History

```javascript
// Get all changes to a specific entity
const history = await auditService.getEntityHistory('User', userId);
```

### Get Audit Statistics

```javascript
// Get statistics for a date range
const stats = await auditService.getAuditStatistics({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31')
});
```

## Best Practices

1. **Always log state-changing operations** - Create, Update, Delete
2. **Log sensitive data access** - Viewing responses, reports, personal data
3. **Include meaningful context** - Old/new values for updates, reasons for approvals/rejections
4. **Don't block on audit failures** - Audit logging should not break application flow
5. **Use middleware for standard operations** - Let middleware handle common CRUD operations
6. **Manual logging for complex operations** - Use direct service calls for approvals, exports, etc.
7. **Capture IP and User Agent** - Always include for security analysis
8. **Log authentication attempts** - Both successful and failed logins

## Testing Audit Logging

```javascript
// Test that audit log is created
const result = await userService.createUser(userData, createdBy, ip, ua);
const logs = await auditService.getAuditLogs({
  entityType: 'User',
  entityId: result.UserId,
  action: 'Create'
});
expect(logs.data.length).toBe(1);
expect(logs.data[0].Username).toBe(createdBy.username);
```

## Audit Log Immutability

The AuditLogs table has no UPDATE or DELETE operations exposed through the service. This ensures audit trail integrity and compliance with security requirements.

## Retention Policy

Audit logs are retained for a minimum of 2 years as per Requirement 22.6. Implement a scheduled job to archive old logs if needed.
