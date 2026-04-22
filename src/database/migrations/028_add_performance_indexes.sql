-- Migration 028: Add performance indexes for report and approval queries
USE CSI;
GO

-- Responses table indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Responses_SurveyId' AND object_id = OBJECT_ID('Responses'))
  CREATE INDEX IX_Responses_SurveyId ON Responses(SurveyId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Responses_RespondentEmail' AND object_id = OBJECT_ID('Responses'))
  CREATE INDEX IX_Responses_RespondentEmail ON Responses(RespondentEmail);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Responses_ResponseApprovalStatus' AND object_id = OBJECT_ID('Responses'))
  CREATE INDEX IX_Responses_ResponseApprovalStatus ON Responses(ResponseApprovalStatus);
GO

-- QuestionResponses table indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QuestionResponses_ResponseId' AND object_id = OBJECT_ID('QuestionResponses'))
  CREATE INDEX IX_QuestionResponses_ResponseId ON QuestionResponses(ResponseId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QuestionResponses_TakeoutStatus' AND object_id = OBJECT_ID('QuestionResponses'))
  CREATE INDEX IX_QuestionResponses_TakeoutStatus ON QuestionResponses(TakeoutStatus);
GO

-- AuditLogs table indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_Timestamp' AND object_id = OBJECT_ID('AuditLogs'))
  CREATE INDEX IX_AuditLogs_Timestamp ON AuditLogs(Timestamp DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_UserId' AND object_id = OBJECT_ID('AuditLogs'))
  CREATE INDEX IX_AuditLogs_UserId ON AuditLogs(UserId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_Action' AND object_id = OBJECT_ID('AuditLogs'))
  CREATE INDEX IX_AuditLogs_Action ON AuditLogs(Action);
GO

-- ScheduledOperations indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ScheduledOperations_SurveyId' AND object_id = OBJECT_ID('ScheduledOperations'))
  CREATE INDEX IX_ScheduledOperations_SurveyId ON ScheduledOperations(SurveyId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ScheduledOperations_Status' AND object_id = OBJECT_ID('ScheduledOperations'))
  CREATE INDEX IX_ScheduledOperations_Status ON ScheduledOperations(Status);
GO

PRINT 'Migration 028 completed: Performance indexes added';
GO
