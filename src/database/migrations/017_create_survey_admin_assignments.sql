-- Migration 017: Create SurveyAdminAssignments for multi-admin event ownership
-- Description: Allows one survey/event to be assigned to multiple AdminEvent users

USE CSI;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SurveyAdminAssignments')
BEGIN
    CREATE TABLE SurveyAdminAssignments (
        SurveyId UNIQUEIDENTIFIER NOT NULL,
        AdminUserId UNIQUEIDENTIFIER NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_SurveyAdminAssignments PRIMARY KEY (SurveyId, AdminUserId),
        CONSTRAINT FK_SAA_AdminUser FOREIGN KEY (AdminUserId) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_SurveyAdminAssignments_AdminUserId ON SurveyAdminAssignments(AdminUserId);

    PRINT 'SurveyAdminAssignments table created successfully';
END
GO

-- Backfill from legacy single-assignee column so old data stays valid
INSERT INTO SurveyAdminAssignments (SurveyId, AdminUserId, CreatedAt)
SELECT s.SurveyId, s.AssignedAdminId, GETDATE()
FROM Surveys s
WHERE s.AssignedAdminId IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM SurveyAdminAssignments saa
      WHERE saa.SurveyId = s.SurveyId
        AND saa.AdminUserId = s.AssignedAdminId
  );
GO

PRINT 'Migration 017 completed successfully';
GO
