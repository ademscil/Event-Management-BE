-- Migration 004: Create Operational and Feedback Tables
-- Description: Creates ScheduledOperations and BestCommentFeedback tables

USE CSI;
GO

-- ScheduledOperations Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ScheduledOperations')
BEGIN
    CREATE TABLE ScheduledOperations (
        OperationId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        SurveyId UNIQUEIDENTIFIER NOT NULL,
        OperationType NVARCHAR(50) NOT NULL CHECK (OperationType IN ('Blast', 'Reminder')),
        Frequency NVARCHAR(50) NOT NULL CHECK (Frequency IN ('once', 'daily', 'weekly', 'monthly')),
        ScheduledDate DATETIME2 NOT NULL,
        ScheduledTime TIME NULL,
        DayOfWeek INT NULL, -- 0=Sunday, 6=Saturday
        EmailTemplate NVARCHAR(MAX) NOT NULL,
        EmbedCover BIT NOT NULL DEFAULT 0,
        TargetCriteria NVARCHAR(MAX) NULL, -- JSON format
        Status NVARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'Running', 'Completed', 'Failed', 'Cancelled')),
        NextExecutionAt DATETIME2 NULL,
        LastExecutedAt DATETIME2 NULL,
        ExecutionCount INT NOT NULL DEFAULT 0,
        ErrorMessage NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        FOREIGN KEY (SurveyId) REFERENCES Surveys(SurveyId) ON DELETE CASCADE,
        FOREIGN KEY (CreatedBy) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_ScheduledOperations_SurveyId ON ScheduledOperations(SurveyId);
    CREATE INDEX IX_ScheduledOperations_Status ON ScheduledOperations(Status);
    CREATE INDEX IX_ScheduledOperations_NextExecutionAt ON ScheduledOperations(NextExecutionAt);
    CREATE INDEX IX_ScheduledOperations_OperationType ON ScheduledOperations(OperationType);

    PRINT 'ScheduledOperations table created successfully';
END
GO

-- BestCommentFeedback Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BestCommentFeedback')
BEGIN
    CREATE TABLE BestCommentFeedback (
        FeedbackId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        QuestionResponseId UNIQUEIDENTIFIER NOT NULL,
        ITLeadUserId UNIQUEIDENTIFIER NOT NULL,
        FeedbackText NVARCHAR(MAX) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2 NULL,
        FOREIGN KEY (QuestionResponseId) REFERENCES QuestionResponses(QuestionResponseId) ON DELETE CASCADE,
        FOREIGN KEY (ITLeadUserId) REFERENCES Users(UserId),
        CONSTRAINT UQ_BestCommentFeedback UNIQUE (QuestionResponseId, ITLeadUserId)
    );

    CREATE INDEX IX_BestCommentFeedback_QuestionResponseId ON BestCommentFeedback(QuestionResponseId);
    CREATE INDEX IX_BestCommentFeedback_ITLeadUserId ON BestCommentFeedback(ITLeadUserId);

    PRINT 'BestCommentFeedback table created successfully';
END
GO

PRINT 'Migration 004 completed successfully';
GO
