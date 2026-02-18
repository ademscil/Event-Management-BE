-- Migration 005: Create Audit and Configuration Tables
-- Description: Creates AuditLogs, EmailLogs, ApprovalHistory, and Configuration tables

USE CSI;
GO

-- AuditLogs Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditLogs')
BEGIN
    CREATE TABLE AuditLogs (
        LogId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        Timestamp DATETIME2 NOT NULL DEFAULT GETDATE(),
        UserId UNIQUEIDENTIFIER NULL,
        Username NVARCHAR(50) NULL,
        Action NVARCHAR(50) NOT NULL CHECK (Action IN ('Create', 'Update', 'Delete', 'Access', 'Login', 'Logout', 'LoginFailed', 'Approve', 'Reject', 'Export')),
        EntityType NVARCHAR(100) NULL,
        EntityId UNIQUEIDENTIFIER NULL,
        OldValues NVARCHAR(MAX) NULL, -- JSON format
        NewValues NVARCHAR(MAX) NULL, -- JSON format
        IPAddress NVARCHAR(50) NULL,
        UserAgent NVARCHAR(500) NULL,
        FOREIGN KEY (UserId) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_AuditLogs_Timestamp ON AuditLogs(Timestamp);
    CREATE INDEX IX_AuditLogs_UserId ON AuditLogs(UserId);
    CREATE INDEX IX_AuditLogs_Action ON AuditLogs(Action);
    CREATE INDEX IX_AuditLogs_EntityType ON AuditLogs(EntityType);
    CREATE INDEX IX_AuditLogs_EntityId ON AuditLogs(EntityId);

    PRINT 'AuditLogs table created successfully';
END
GO

-- EmailLogs Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmailLogs')
BEGIN
    CREATE TABLE EmailLogs (
        EmailLogId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        SurveyId UNIQUEIDENTIFIER NULL,
        RecipientEmail NVARCHAR(255) NOT NULL,
        RecipientName NVARCHAR(200) NULL,
        Subject NVARCHAR(500) NOT NULL,
        EmailType NVARCHAR(50) NOT NULL CHECK (EmailType IN ('Blast', 'Reminder', 'Notification')),
        Status NVARCHAR(50) NOT NULL CHECK (Status IN ('Sent', 'Failed', 'Pending')),
        ErrorMessage NVARCHAR(MAX) NULL,
        SentAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (SurveyId) REFERENCES Surveys(SurveyId)
    );

    CREATE INDEX IX_EmailLogs_SurveyId ON EmailLogs(SurveyId);
    CREATE INDEX IX_EmailLogs_RecipientEmail ON EmailLogs(RecipientEmail);
    CREATE INDEX IX_EmailLogs_EmailType ON EmailLogs(EmailType);
    CREATE INDEX IX_EmailLogs_Status ON EmailLogs(Status);
    CREATE INDEX IX_EmailLogs_SentAt ON EmailLogs(SentAt);

    PRINT 'EmailLogs table created successfully';
END
GO

-- ApprovalHistory Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ApprovalHistory')
BEGIN
    CREATE TABLE ApprovalHistory (
        HistoryId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        QuestionResponseId UNIQUEIDENTIFIER NOT NULL,
        Action NVARCHAR(50) NOT NULL CHECK (Action IN ('Proposed', 'Approved', 'Rejected', 'Cancelled')),
        PerformedBy UNIQUEIDENTIFIER NOT NULL,
        Reason NVARCHAR(MAX) NULL,
        PreviousStatus NVARCHAR(50) NULL,
        NewStatus NVARCHAR(50) NOT NULL,
        PerformedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (QuestionResponseId) REFERENCES QuestionResponses(QuestionResponseId) ON DELETE CASCADE,
        FOREIGN KEY (PerformedBy) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_ApprovalHistory_QuestionResponseId ON ApprovalHistory(QuestionResponseId);
    CREATE INDEX IX_ApprovalHistory_PerformedBy ON ApprovalHistory(PerformedBy);
    CREATE INDEX IX_ApprovalHistory_Action ON ApprovalHistory(Action);
    CREATE INDEX IX_ApprovalHistory_PerformedAt ON ApprovalHistory(PerformedAt);

    PRINT 'ApprovalHistory table created successfully';
END
GO

-- Configuration Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Configuration')
BEGIN
    CREATE TABLE Configuration (
        ConfigKey NVARCHAR(100) PRIMARY KEY,
        ConfigValue NVARCHAR(MAX) NOT NULL,
        Description NVARCHAR(500) NULL,
        UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedBy UNIQUEIDENTIFIER NULL,
        FOREIGN KEY (UpdatedBy) REFERENCES Users(UserId)
    );

    PRINT 'Configuration table created successfully';
END
GO

-- Sessions Table for JWT token management
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Sessions')
BEGIN
    CREATE TABLE Sessions (
        SessionId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        UserId UNIQUEIDENTIFIER NOT NULL,
        TokenHash NVARCHAR(255) NOT NULL UNIQUE,
        RefreshTokenHash NVARCHAR(255) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        LastActivity DATETIME2 NOT NULL DEFAULT GETDATE(),
        ExpiresAt DATETIME2 NOT NULL,
        MaxExpiresAt DATETIME2 NOT NULL,
        IPAddress NVARCHAR(50) NULL,
        UserAgent NVARCHAR(500) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        InvalidatedAt DATETIME2 NULL,
        FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE
    );

    CREATE INDEX IX_Sessions_UserId ON Sessions(UserId);
    CREATE INDEX IX_Sessions_TokenHash ON Sessions(TokenHash);
    CREATE INDEX IX_Sessions_RefreshTokenHash ON Sessions(RefreshTokenHash);
    CREATE INDEX IX_Sessions_ExpiresAt ON Sessions(ExpiresAt);
    CREATE INDEX IX_Sessions_MaxExpiresAt ON Sessions(MaxExpiresAt);
    CREATE INDEX IX_Sessions_LastActivity ON Sessions(LastActivity);
    CREATE INDEX IX_Sessions_IsActive ON Sessions(IsActive);

    PRINT 'Sessions table created successfully';
END
GO

PRINT 'Migration 005 completed successfully';
GO
