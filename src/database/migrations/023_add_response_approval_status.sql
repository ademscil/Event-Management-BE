PRINT 'Running migration 023_add_response_approval_status';
GO

IF COL_LENGTH('Responses', 'ResponseApprovalStatus') IS NULL
BEGIN
    ALTER TABLE Responses
    ADD ResponseApprovalStatus NVARCHAR(50) NOT NULL
        CONSTRAINT DF_Responses_ResponseApprovalStatus DEFAULT 'Submitted';
END
GO

IF COL_LENGTH('Responses', 'AdminReviewedBy') IS NULL
BEGIN
    ALTER TABLE Responses
    ADD AdminReviewedBy UNIQUEIDENTIFIER NULL;
END
GO

IF COL_LENGTH('Responses', 'AdminReviewedAt') IS NULL
BEGIN
    ALTER TABLE Responses
    ADD AdminReviewedAt DATETIME2 NULL;
END
GO

IF COL_LENGTH('Responses', 'AdminReviewReason') IS NULL
BEGIN
    ALTER TABLE Responses
    ADD AdminReviewReason NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('Responses', 'ITLeadReviewedBy') IS NULL
BEGIN
    ALTER TABLE Responses
    ADD ITLeadReviewedBy UNIQUEIDENTIFIER NULL;
END
GO

IF COL_LENGTH('Responses', 'ITLeadReviewedAt') IS NULL
BEGIN
    ALTER TABLE Responses
    ADD ITLeadReviewedAt DATETIME2 NULL;
END
GO

IF COL_LENGTH('Responses', 'ITLeadReviewReason') IS NULL
BEGIN
    ALTER TABLE Responses
    ADD ITLeadReviewReason NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('Responses', 'FinalizedAt') IS NULL
BEGIN
    ALTER TABLE Responses
    ADD FinalizedAt DATETIME2 NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_Responses_ResponseApprovalStatus'
)
BEGIN
    ALTER TABLE Responses
    ADD CONSTRAINT CK_Responses_ResponseApprovalStatus
    CHECK (
        ResponseApprovalStatus IN (
            'Submitted',
            'RejectedByAdmin',
            'PendingITLead',
            'PendingAdminTakeoutDecision',
            'ApprovedFinal'
        )
    );
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_Responses_AdminReviewedBy_Users'
)
BEGIN
    ALTER TABLE Responses
    ADD CONSTRAINT FK_Responses_AdminReviewedBy_Users
    FOREIGN KEY (AdminReviewedBy) REFERENCES Users(UserId);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_Responses_ITLeadReviewedBy_Users'
)
BEGIN
    ALTER TABLE Responses
    ADD CONSTRAINT FK_Responses_ITLeadReviewedBy_Users
    FOREIGN KEY (ITLeadReviewedBy) REFERENCES Users(UserId);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Responses_ResponseApprovalStatus'
      AND object_id = OBJECT_ID('Responses')
)
BEGIN
    CREATE INDEX IX_Responses_ResponseApprovalStatus
    ON Responses(ResponseApprovalStatus, SurveyId, SubmittedAt DESC);
END
GO

UPDATE r
SET ResponseApprovalStatus = CASE
    WHEN EXISTS (
        SELECT 1
        FROM QuestionResponses qr
        WHERE qr.ResponseId = r.ResponseId
          AND qr.TakeoutStatus = 'ProposedTakeout'
    ) THEN 'PendingAdminTakeoutDecision'
    ELSE 'ApprovedFinal'
END
FROM Responses r
WHERE (r.ResponseApprovalStatus IS NULL OR r.ResponseApprovalStatus = 'Submitted')
  AND EXISTS (
      SELECT 1
      FROM QuestionResponses qr
      WHERE qr.ResponseId = r.ResponseId
  );
GO

PRINT 'Migration 023_add_response_approval_status completed successfully';
GO
