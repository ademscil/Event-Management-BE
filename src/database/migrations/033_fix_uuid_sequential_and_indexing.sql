-- Migration 033: Fix UUID to Sequential + Additional Performance Indexes
-- Purpose:
--   1. Change DEFAULT NEWID() -> NEWSEQUENTIALID() on all PK columns
--      so new UUIDs are sequential (no more random-looking IDs like 61B0744F-EED1...)
--   2. Add missing composite indexes for report & approval query patterns
--   3. Add missing indexes on FK columns that are frequently JOINed
--
-- NOTE: NEWSEQUENTIALID() only affects NEW rows going forward.
--       Existing data UUIDs are NOT changed (safe, no data migration needed).
--       The visual appearance in SQL Server Management Studio will be clean
--       sequential UUIDs for all new records.

USE CSI;
GO

SET XACT_ABORT ON;
GO

PRINT '=== Migration 033: Fix UUID Sequential + Indexing ===';
GO

-- ============================================================
-- PART 1: Switch DEFAULT from NEWID() to NEWSEQUENTIALID()
--         on all primary key columns
-- ============================================================

-- Helper: drop existing default constraint by column, then add new one
-- We do this for every PK that currently uses NEWID()

-- 1. Users.UserId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Users') AND c.name = 'UserId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.Users DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.Users ADD CONSTRAINT DF_Users_UserId DEFAULT NEWSEQUENTIALID() FOR UserId;
PRINT 'Users.UserId -> NEWSEQUENTIALID()';
GO

-- 2. BusinessUnits.BusinessUnitId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.BusinessUnits') AND c.name = 'BusinessUnitId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.BusinessUnits DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.BusinessUnits ADD CONSTRAINT DF_BusinessUnits_BusinessUnitId DEFAULT NEWSEQUENTIALID() FOR BusinessUnitId;
PRINT 'BusinessUnits.BusinessUnitId -> NEWSEQUENTIALID()';
GO

-- 3. Divisions.DivisionId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Divisions') AND c.name = 'DivisionId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.Divisions DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.Divisions ADD CONSTRAINT DF_Divisions_DivisionId DEFAULT NEWSEQUENTIALID() FOR DivisionId;
PRINT 'Divisions.DivisionId -> NEWSEQUENTIALID()';
GO

-- 4. Departments.DepartmentId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Departments') AND c.name = 'DepartmentId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.Departments DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.Departments ADD CONSTRAINT DF_Departments_DepartmentId DEFAULT NEWSEQUENTIALID() FOR DepartmentId;
PRINT 'Departments.DepartmentId -> NEWSEQUENTIALID()';
GO

-- 5. Functions.FunctionId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Functions') AND c.name = 'FunctionId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.Functions DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.Functions ADD CONSTRAINT DF_Functions_FunctionId DEFAULT NEWSEQUENTIALID() FOR FunctionId;
PRINT 'Functions.FunctionId -> NEWSEQUENTIALID()';
GO

-- 6. Applications.ApplicationId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Applications') AND c.name = 'ApplicationId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.Applications DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.Applications ADD CONSTRAINT DF_Applications_ApplicationId DEFAULT NEWSEQUENTIALID() FOR ApplicationId;
PRINT 'Applications.ApplicationId -> NEWSEQUENTIALID()';
GO

-- 7. FunctionApplicationMappings.MappingId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.FunctionApplicationMappings') AND c.name = 'MappingId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.FunctionApplicationMappings DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.FunctionApplicationMappings ADD CONSTRAINT DF_FunctionApplicationMappings_MappingId DEFAULT NEWSEQUENTIALID() FOR MappingId;
PRINT 'FunctionApplicationMappings.MappingId -> NEWSEQUENTIALID()';
GO

-- 8. ApplicationDepartmentMappings.MappingId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.ApplicationDepartmentMappings') AND c.name = 'MappingId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.ApplicationDepartmentMappings DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.ApplicationDepartmentMappings ADD CONSTRAINT DF_ApplicationDepartmentMappings_MappingId DEFAULT NEWSEQUENTIALID() FOR MappingId;
PRINT 'ApplicationDepartmentMappings.MappingId -> NEWSEQUENTIALID()';
GO

-- 9. Events (Surveys).SurveyId
DECLARE @constraintName NVARCHAR(256);
DECLARE @tbl NVARCHAR(128) = CASE WHEN OBJECT_ID('dbo.Events','U') IS NOT NULL THEN 'dbo.Events' ELSE 'dbo.Surveys' END;
DECLARE @col NVARCHAR(128) = CASE WHEN OBJECT_ID('dbo.Events','U') IS NOT NULL THEN 'SurveyId' ELSE 'SurveyId' END;
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID(@tbl) AND c.name = @col;
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE ' + @tbl + ' DROP CONSTRAINT ' + @constraintName);
EXEC('ALTER TABLE ' + @tbl + ' ADD CONSTRAINT DF_Events_SurveyId DEFAULT NEWSEQUENTIALID() FOR SurveyId');
PRINT 'Events.SurveyId -> NEWSEQUENTIALID()';
GO

-- 10. EventConfiguration.ConfigId
DECLARE @constraintName NVARCHAR(256);
DECLARE @tbl2 NVARCHAR(128) = CASE WHEN OBJECT_ID('dbo.EventConfiguration','U') IS NOT NULL THEN 'dbo.EventConfiguration' ELSE 'dbo.SurveyConfiguration' END;
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID(@tbl2) AND c.name = 'ConfigId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE ' + @tbl2 + ' DROP CONSTRAINT ' + @constraintName);
EXEC('ALTER TABLE ' + @tbl2 + ' ADD CONSTRAINT DF_EventConfiguration_ConfigId DEFAULT NEWSEQUENTIALID() FOR ConfigId');
PRINT 'EventConfiguration.ConfigId -> NEWSEQUENTIALID()';
GO

-- 11. Questions.QuestionId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Questions') AND c.name = 'QuestionId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.Questions DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.Questions ADD CONSTRAINT DF_Questions_QuestionId DEFAULT NEWSEQUENTIALID() FOR QuestionId;
PRINT 'Questions.QuestionId -> NEWSEQUENTIALID()';
GO

-- 12. Responses.ResponseId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Responses') AND c.name = 'ResponseId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.Responses DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.Responses ADD CONSTRAINT DF_Responses_ResponseId DEFAULT NEWSEQUENTIALID() FOR ResponseId;
PRINT 'Responses.ResponseId -> NEWSEQUENTIALID()';
GO

-- 13. QuestionResponses.QuestionResponseId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.QuestionResponses') AND c.name = 'QuestionResponseId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.QuestionResponses DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.QuestionResponses ADD CONSTRAINT DF_QuestionResponses_QuestionResponseId DEFAULT NEWSEQUENTIALID() FOR QuestionResponseId;
PRINT 'QuestionResponses.QuestionResponseId -> NEWSEQUENTIALID()';
GO

-- 14. ScheduledOperations.OperationId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.ScheduledOperations') AND c.name = 'OperationId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.ScheduledOperations DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.ScheduledOperations ADD CONSTRAINT DF_ScheduledOperations_OperationId DEFAULT NEWSEQUENTIALID() FOR OperationId;
PRINT 'ScheduledOperations.OperationId -> NEWSEQUENTIALID()';
GO

-- 15. BestCommentFeedback.FeedbackId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.BestCommentFeedback') AND c.name = 'FeedbackId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.BestCommentFeedback DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.BestCommentFeedback ADD CONSTRAINT DF_BestCommentFeedback_FeedbackId DEFAULT NEWSEQUENTIALID() FOR FeedbackId;
PRINT 'BestCommentFeedback.FeedbackId -> NEWSEQUENTIALID()';
GO

-- 16. AuditLogs.LogId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.AuditLogs') AND c.name = 'LogId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.AuditLogs DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.AuditLogs ADD CONSTRAINT DF_AuditLogs_LogId DEFAULT NEWSEQUENTIALID() FOR LogId;
PRINT 'AuditLogs.LogId -> NEWSEQUENTIALID()';
GO

-- 17. EmailLogs.EmailLogId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.EmailLogs') AND c.name = 'EmailLogId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.EmailLogs DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.EmailLogs ADD CONSTRAINT DF_EmailLogs_EmailLogId DEFAULT NEWSEQUENTIALID() FOR EmailLogId;
PRINT 'EmailLogs.EmailLogId -> NEWSEQUENTIALID()';
GO

-- 18. ApprovalHistory.HistoryId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.ApprovalHistory') AND c.name = 'HistoryId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.ApprovalHistory DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.ApprovalHistory ADD CONSTRAINT DF_ApprovalHistory_HistoryId DEFAULT NEWSEQUENTIALID() FOR HistoryId;
PRINT 'ApprovalHistory.HistoryId -> NEWSEQUENTIALID()';
GO

-- 19. Sessions.SessionId
DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Sessions') AND c.name = 'SessionId';
IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE dbo.Sessions DROP CONSTRAINT ' + @constraintName);
ALTER TABLE dbo.Sessions ADD CONSTRAINT DF_Sessions_SessionId DEFAULT NEWSEQUENTIALID() FOR SessionId;
PRINT 'Sessions.SessionId -> NEWSEQUENTIALID()';
GO

-- ============================================================
-- PART 2: Additional composite indexes for report & approval
--         query patterns (missing from migration 028)
-- ============================================================

-- Responses: report query joins SurveyId + ApprovalStatus + SubmittedAt
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Responses_Survey_Status_Date' AND object_id = OBJECT_ID('dbo.Responses'))
    CREATE INDEX IX_Responses_Survey_Status_Date
    ON dbo.Responses(SurveyId, ResponseApprovalStatus, SubmittedAt DESC)
    INCLUDE (RespondentName, RespondentEmail, DepartmentId, ApplicationId);
GO
PRINT 'Index IX_Responses_Survey_Status_Date created';
GO

-- QuestionResponses: approval query joins ResponseId + TakeoutStatus
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QuestionResponses_Response_Takeout' AND object_id = OBJECT_ID('dbo.QuestionResponses'))
    CREATE INDEX IX_QuestionResponses_Response_Takeout
    ON dbo.QuestionResponses(ResponseId, TakeoutStatus)
    INCLUDE (QuestionId, NumericValue, CommentValue, IsBestComment);
GO
PRINT 'Index IX_QuestionResponses_Response_Takeout created';
GO

-- QuestionResponses: best comments query
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QuestionResponses_BestComment' AND object_id = OBJECT_ID('dbo.QuestionResponses'))
    CREATE INDEX IX_QuestionResponses_BestComment
    ON dbo.QuestionResponses(IsBestComment, TakeoutStatus)
    INCLUDE (ResponseId, QuestionId, CommentValue, NumericValue);
GO
PRINT 'Index IX_QuestionResponses_BestComment created';
GO

-- Events: dashboard query by Status + date range
DECLARE @evtTable NVARCHAR(128) = CASE WHEN OBJECT_ID('dbo.Events','U') IS NOT NULL THEN 'dbo.Events' ELSE 'dbo.Surveys' END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Events_Status_Dates' AND object_id = OBJECT_ID(@evtTable))
    EXEC('CREATE INDEX IX_Events_Status_Dates ON ' + @evtTable + '(Status, StartDate, EndDate) INCLUDE (Title, AssignedAdminId, TargetRespondents, TargetScore)');
PRINT 'Index IX_Events_Status_Dates created';
GO

-- AuditLogs: filter by action + timestamp (most common audit query)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_Action_Timestamp' AND object_id = OBJECT_ID('dbo.AuditLogs'))
    CREATE INDEX IX_AuditLogs_Action_Timestamp
    ON dbo.AuditLogs(Action, Timestamp DESC)
    INCLUDE (UserId, Username, EntityType, EntityId, IPAddress);
GO
PRINT 'Index IX_AuditLogs_Action_Timestamp created';
GO

-- AuditLogs: filter by EntityType + EntityId (detail lookup)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_Entity_Lookup' AND object_id = OBJECT_ID('dbo.AuditLogs'))
    CREATE INDEX IX_AuditLogs_Entity_Lookup
    ON dbo.AuditLogs(EntityType, EntityId, Timestamp DESC);
GO
PRINT 'Index IX_AuditLogs_Entity_Lookup created';
GO

-- Sessions: cleanup query (expired + inactive)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_Cleanup' AND object_id = OBJECT_ID('dbo.Sessions'))
    CREATE INDEX IX_Sessions_Cleanup
    ON dbo.Sessions(IsActive, ExpiresAt)
    INCLUDE (UserId, TokenHash);
GO
PRINT 'Index IX_Sessions_Cleanup created';
GO

-- ScheduledOperations: scheduler processor query
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ScheduledOperations_Processor' AND object_id = OBJECT_ID('dbo.ScheduledOperations'))
    CREATE INDEX IX_ScheduledOperations_Processor
    ON dbo.ScheduledOperations(Status, NextExecutionAt)
    INCLUDE (SurveyId, OperationType, Frequency);
GO
PRINT 'Index IX_ScheduledOperations_Processor created';
GO

-- FunctionApplicationMappings: lookup by ApplicationId (approval routing)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FuncAppMap_AppId_FuncId' AND object_id = OBJECT_ID('dbo.FunctionApplicationMappings'))
    CREATE INDEX IX_FuncAppMap_AppId_FuncId
    ON dbo.FunctionApplicationMappings(ApplicationId, FunctionId);
GO
PRINT 'Index IX_FuncAppMap_AppId_FuncId created';
GO

-- ApplicationDepartmentMappings: lookup by DepartmentId (respondent app selection)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AppDeptMap_DeptId_AppId' AND object_id = OBJECT_ID('dbo.ApplicationDepartmentMappings'))
    CREATE INDEX IX_AppDeptMap_DeptId_AppId
    ON dbo.ApplicationDepartmentMappings(DepartmentId, ApplicationId);
GO
PRINT 'Index IX_AppDeptMap_DeptId_AppId created';
GO

PRINT '=== Migration 033 completed successfully ===';
GO
