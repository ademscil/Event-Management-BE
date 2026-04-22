/*
  Migration: Create publish cycle support for surveys/events
  Purpose:
  - Separate response batches when the same survey is republished
  - Persist generated report state per active publish cycle
*/

USE CSI;
GO

DECLARE @PublishCycleParentTable NVARCHAR(128);
DECLARE @CreatePublishCyclesSql NVARCHAR(MAX);

SET @PublishCycleParentTable = CASE
    WHEN OBJECT_ID(N'dbo.Events', N'U') IS NOT NULL THEN N'Events'
    WHEN OBJECT_ID(N'dbo.Surveys', N'U') IS NOT NULL THEN N'Surveys'
    ELSE NULL
END;

IF @PublishCycleParentTable IS NULL
BEGIN
    THROW 50000, 'Migration 020 requires dbo.Events or dbo.Surveys user table.', 1;
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SurveyPublishCycles')
BEGIN
    SET @CreatePublishCyclesSql = N'
        CREATE TABLE SurveyPublishCycles (
            PublishCycleId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            SurveyId UNIQUEIDENTIFIER NOT NULL,
            CycleNumber INT NOT NULL,
            PublishedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
            PublishedBy UNIQUEIDENTIFIER NULL,
            IsCurrent BIT NOT NULL DEFAULT 1,
            GeneratedAt DATETIME2 NULL,
            GeneratedBy UNIQUEIDENTIFIER NULL,
            CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
            UpdatedAt DATETIME2 NULL,
            CONSTRAINT FK_SurveyPublishCycles_Survey FOREIGN KEY (SurveyId) REFERENCES dbo.' + QUOTENAME(@PublishCycleParentTable) + N'(SurveyId) ON DELETE CASCADE,
            CONSTRAINT FK_SurveyPublishCycles_PublishedBy FOREIGN KEY (PublishedBy) REFERENCES dbo.Users(UserId),
            CONSTRAINT FK_SurveyPublishCycles_GeneratedBy FOREIGN KEY (GeneratedBy) REFERENCES dbo.Users(UserId),
            CONSTRAINT UQ_SurveyPublishCycles_SurveyCycle UNIQUE (SurveyId, CycleNumber)
        );

        CREATE UNIQUE INDEX UX_SurveyPublishCycles_Current
            ON SurveyPublishCycles(SurveyId)
            WHERE IsCurrent = 1;

        CREATE INDEX IX_SurveyPublishCycles_SurveyId ON SurveyPublishCycles(SurveyId);
        CREATE INDEX IX_SurveyPublishCycles_GeneratedAt ON SurveyPublishCycles(GeneratedAt);
    ';

    EXEC sp_executesql @CreatePublishCyclesSql;
END
GO

IF COL_LENGTH('Responses', 'PublishCycleId') IS NULL
BEGIN
    ALTER TABLE Responses ADD PublishCycleId UNIQUEIDENTIFIER NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_Responses_PublishCycle'
)
AND COL_LENGTH('Responses', 'PublishCycleId') IS NOT NULL
BEGIN
    ALTER TABLE Responses
    ADD CONSTRAINT FK_Responses_PublishCycle
        FOREIGN KEY (PublishCycleId) REFERENCES SurveyPublishCycles(PublishCycleId);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Responses_PublishCycleId'
      AND object_id = OBJECT_ID('Responses')
)
AND COL_LENGTH('Responses', 'PublishCycleId') IS NOT NULL
BEGIN
    CREATE INDEX IX_Responses_PublishCycleId ON Responses(PublishCycleId);
END
GO

;WITH SurveyNeedsCycle AS (
    SELECT
        s.SurveyId,
        COALESCE(s.UpdatedAt, s.CreatedAt, GETDATE()) AS PublishedAt,
        s.UpdatedBy AS PublishedBy
    FROM Surveys s
    WHERE
        s.Status = 'Active'
        OR EXISTS (
            SELECT 1
            FROM Responses r
            WHERE r.SurveyId = s.SurveyId
        )
)
INSERT INTO SurveyPublishCycles (PublishCycleId, SurveyId, CycleNumber, PublishedAt, PublishedBy, IsCurrent, CreatedAt)
SELECT
    NEWID(),
    src.SurveyId,
    1,
    src.PublishedAt,
    src.PublishedBy,
    1,
    GETDATE()
FROM SurveyNeedsCycle src
WHERE NOT EXISTS (
    SELECT 1
    FROM SurveyPublishCycles pc
    WHERE pc.SurveyId = src.SurveyId
);
GO

IF COL_LENGTH('Responses', 'PublishCycleId') IS NOT NULL
BEGIN
    UPDATE r
    SET r.PublishCycleId = pc.PublishCycleId
    FROM Responses r
    INNER JOIN SurveyPublishCycles pc
        ON pc.SurveyId = r.SurveyId
       AND pc.IsCurrent = 1
    WHERE r.PublishCycleId IS NULL;
END
GO
