/*
  Migration 026: Add phase-1 alternate non-UUID keys
  Purpose:
  - Keep existing UUID PK/FK intact for compatibility
  - Introduce non-UUID alternate identifiers for all remaining tables
  - Use existing business identifiers where they already exist:
    Users.Username, BusinessUnits.Code, Divisions.Code, Departments.Code,
    Functions.Code, Applications.Code, EventTypes.Code, Configuration.ConfigKey
  - Add sequential BIGINT identifiers for transactional/operational tables
*/

USE CSI;
GO

SET XACT_ABORT ON;
GO

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @SurveyBaseTable NVARCHAR(128) =
    CASE
      WHEN OBJECT_ID(N'dbo.Events', N'U') IS NOT NULL THEN N'dbo.Events'
      WHEN OBJECT_ID(N'dbo.Surveys', N'U') IS NOT NULL THEN N'dbo.Surveys'
      ELSE NULL
    END;
  DECLARE @SurveyConfigTable NVARCHAR(128) =
    CASE
      WHEN OBJECT_ID(N'dbo.EventConfiguration', N'U') IS NOT NULL THEN N'dbo.EventConfiguration'
      WHEN OBJECT_ID(N'dbo.SurveyConfiguration', N'U') IS NOT NULL THEN N'dbo.SurveyConfiguration'
      ELSE NULL
    END;
  DECLARE @restartSql NVARCHAR(MAX);

  IF @SurveyBaseTable IS NULL
    THROW 50000, 'Phase 1 migration requires dbo.Events or dbo.Surveys table.', 1;

  IF OBJECT_ID(N'dbo.Seq_Surveys_SurveyNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_Surveys_SurveyNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH(@SurveyBaseTable, 'SurveyNo') IS NULL
    EXEC(N'ALTER TABLE ' + @SurveyBaseTable + N' ADD SurveyNo BIGINT NULL;');
  EXEC(N'
    ;WITH src AS (
      SELECT SurveyId, ROW_NUMBER() OVER (ORDER BY COALESCE(CreatedAt, GETDATE()), SurveyId) AS rn
      FROM ' + @SurveyBaseTable + N'
      WHERE SurveyNo IS NULL
    )
    UPDATE target
    SET SurveyNo = src.rn
    FROM ' + @SurveyBaseTable + N' target
    INNER JOIN src ON src.SurveyId = target.SurveyId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(@SurveyBaseTable) AND name = N'UX_Surveys_SurveyNo')
    EXEC(N'CREATE UNIQUE INDEX UX_Surveys_SurveyNo ON ' + @SurveyBaseTable + N'(SurveyNo) WHERE SurveyNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(@SurveyBaseTable) AND name = N'DF_Surveys_SurveyNo')
    EXEC(N'ALTER TABLE ' + @SurveyBaseTable + N' ADD CONSTRAINT DF_Surveys_SurveyNo DEFAULT (NEXT VALUE FOR dbo.Seq_Surveys_SurveyNo) FOR SurveyNo;');
  DECLARE @nextSurveyNo BIGINT;
  DECLARE @sqlSurveyNo NVARCHAR(MAX) = N'SELECT @valueOut = ISNULL(MAX(SurveyNo) + 1, 1) FROM ' + @SurveyBaseTable + N';';
  EXEC sp_executesql @sqlSurveyNo, N'@valueOut BIGINT OUTPUT', @valueOut = @nextSurveyNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_Surveys_SurveyNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextSurveyNo) + N';';
  EXEC(@restartSql);

  IF @SurveyConfigTable IS NOT NULL AND OBJECT_ID(N'dbo.Seq_SurveyConfiguration_ConfigNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_SurveyConfiguration_ConfigNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF @SurveyConfigTable IS NOT NULL
  BEGIN
    IF COL_LENGTH(@SurveyConfigTable, 'ConfigNo') IS NULL
      EXEC(N'ALTER TABLE ' + @SurveyConfigTable + N' ADD ConfigNo BIGINT NULL;');
    EXEC(N'
      ;WITH src AS (
        SELECT ConfigId, ROW_NUMBER() OVER (ORDER BY COALESCE(CreatedAt, GETDATE()), ConfigId) AS rn
        FROM ' + @SurveyConfigTable + N'
        WHERE ConfigNo IS NULL
      )
      UPDATE target
      SET ConfigNo = src.rn
      FROM ' + @SurveyConfigTable + N' target
      INNER JOIN src ON src.ConfigId = target.ConfigId;
    ');
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(@SurveyConfigTable) AND name = N'UX_SurveyConfiguration_ConfigNo')
      EXEC(N'CREATE UNIQUE INDEX UX_SurveyConfiguration_ConfigNo ON ' + @SurveyConfigTable + N'(ConfigNo) WHERE ConfigNo IS NOT NULL;');
    IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(@SurveyConfigTable) AND name = N'DF_SurveyConfiguration_ConfigNo')
      EXEC(N'ALTER TABLE ' + @SurveyConfigTable + N' ADD CONSTRAINT DF_SurveyConfiguration_ConfigNo DEFAULT (NEXT VALUE FOR dbo.Seq_SurveyConfiguration_ConfigNo) FOR ConfigNo;');
    DECLARE @nextConfigNo BIGINT;
    DECLARE @sqlConfigNo NVARCHAR(MAX) = N'SELECT @valueOut = ISNULL(MAX(ConfigNo) + 1, 1) FROM ' + @SurveyConfigTable + N';';
    EXEC sp_executesql @sqlConfigNo, N'@valueOut BIGINT OUTPUT', @valueOut = @nextConfigNo OUTPUT;
    SET @restartSql = N'ALTER SEQUENCE dbo.Seq_SurveyConfiguration_ConfigNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextConfigNo) + N';';
    EXEC(@restartSql);
  END;

  IF OBJECT_ID(N'dbo.Seq_Questions_QuestionNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_Questions_QuestionNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH('dbo.Questions', 'QuestionNo') IS NULL
    ALTER TABLE dbo.Questions ADD QuestionNo BIGINT NULL;
  EXEC(N'
    ;WITH src AS (
      SELECT QuestionId, ROW_NUMBER() OVER (ORDER BY COALESCE(CreatedAt, GETDATE()), QuestionId) AS rn
      FROM dbo.Questions
      WHERE QuestionNo IS NULL
    )
    UPDATE q
    SET QuestionNo = src.rn
    FROM dbo.Questions q
    INNER JOIN src ON src.QuestionId = q.QuestionId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Questions') AND name = N'UX_Questions_QuestionNo')
    EXEC(N'CREATE UNIQUE INDEX UX_Questions_QuestionNo ON dbo.Questions(QuestionNo) WHERE QuestionNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.Questions') AND name = N'DF_Questions_QuestionNo')
    EXEC(N'ALTER TABLE dbo.Questions ADD CONSTRAINT DF_Questions_QuestionNo DEFAULT (NEXT VALUE FOR dbo.Seq_Questions_QuestionNo) FOR QuestionNo;');
  DECLARE @nextQuestionNo BIGINT;
  EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(QuestionNo) + 1, 1) FROM dbo.Questions;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextQuestionNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_Questions_QuestionNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextQuestionNo) + N';';
  EXEC(@restartSql);

  IF OBJECT_ID(N'dbo.Seq_Responses_ResponseNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_Responses_ResponseNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH('dbo.Responses', 'ResponseNo') IS NULL
    ALTER TABLE dbo.Responses ADD ResponseNo BIGINT NULL;
  EXEC(N'
    ;WITH src AS (
      SELECT ResponseId, ROW_NUMBER() OVER (ORDER BY COALESCE(SubmittedAt, GETDATE()), ResponseId) AS rn
      FROM dbo.Responses
      WHERE ResponseNo IS NULL
    )
    UPDATE r
    SET ResponseNo = src.rn
    FROM dbo.Responses r
    INNER JOIN src ON src.ResponseId = r.ResponseId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Responses') AND name = N'UX_Responses_ResponseNo')
    EXEC(N'CREATE UNIQUE INDEX UX_Responses_ResponseNo ON dbo.Responses(ResponseNo) WHERE ResponseNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.Responses') AND name = N'DF_Responses_ResponseNo')
    EXEC(N'ALTER TABLE dbo.Responses ADD CONSTRAINT DF_Responses_ResponseNo DEFAULT (NEXT VALUE FOR dbo.Seq_Responses_ResponseNo) FOR ResponseNo;');
  DECLARE @nextResponseNo BIGINT;
  EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(ResponseNo) + 1, 1) FROM dbo.Responses;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextResponseNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_Responses_ResponseNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextResponseNo) + N';';
  EXEC(@restartSql);

  IF OBJECT_ID(N'dbo.Seq_QuestionResponses_QuestionResponseNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_QuestionResponses_QuestionResponseNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH('dbo.QuestionResponses', 'QuestionResponseNo') IS NULL
    ALTER TABLE dbo.QuestionResponses ADD QuestionResponseNo BIGINT NULL;
  EXEC(N'
    ;WITH src AS (
      SELECT QuestionResponseId, ROW_NUMBER() OVER (ORDER BY COALESCE(CreatedAt, GETDATE()), QuestionResponseId) AS rn
      FROM dbo.QuestionResponses
      WHERE QuestionResponseNo IS NULL
    )
    UPDATE qr
    SET QuestionResponseNo = src.rn
    FROM dbo.QuestionResponses qr
    INNER JOIN src ON src.QuestionResponseId = qr.QuestionResponseId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.QuestionResponses') AND name = N'UX_QuestionResponses_QuestionResponseNo')
    EXEC(N'CREATE UNIQUE INDEX UX_QuestionResponses_QuestionResponseNo ON dbo.QuestionResponses(QuestionResponseNo) WHERE QuestionResponseNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.QuestionResponses') AND name = N'DF_QuestionResponses_QuestionResponseNo')
    EXEC(N'ALTER TABLE dbo.QuestionResponses ADD CONSTRAINT DF_QuestionResponses_QuestionResponseNo DEFAULT (NEXT VALUE FOR dbo.Seq_QuestionResponses_QuestionResponseNo) FOR QuestionResponseNo;');
  DECLARE @nextQuestionResponseNo BIGINT;
  EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(QuestionResponseNo) + 1, 1) FROM dbo.QuestionResponses;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextQuestionResponseNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_QuestionResponses_QuestionResponseNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextQuestionResponseNo) + N';';
  EXEC(@restartSql);

  IF OBJECT_ID(N'dbo.Seq_FunctionApplicationMappings_MappingNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_FunctionApplicationMappings_MappingNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH('dbo.FunctionApplicationMappings', 'MappingNo') IS NULL
    ALTER TABLE dbo.FunctionApplicationMappings ADD MappingNo BIGINT NULL;
  EXEC(N'
    ;WITH src AS (
      SELECT MappingId, ROW_NUMBER() OVER (ORDER BY COALESCE(CreatedAt, GETDATE()), MappingId) AS rn
      FROM dbo.FunctionApplicationMappings
      WHERE MappingNo IS NULL
    )
    UPDATE fam
    SET MappingNo = src.rn
    FROM dbo.FunctionApplicationMappings fam
    INNER JOIN src ON src.MappingId = fam.MappingId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.FunctionApplicationMappings') AND name = N'UX_FunctionApplicationMappings_MappingNo')
    EXEC(N'CREATE UNIQUE INDEX UX_FunctionApplicationMappings_MappingNo ON dbo.FunctionApplicationMappings(MappingNo) WHERE MappingNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.FunctionApplicationMappings') AND name = N'DF_FunctionApplicationMappings_MappingNo')
    EXEC(N'ALTER TABLE dbo.FunctionApplicationMappings ADD CONSTRAINT DF_FunctionApplicationMappings_MappingNo DEFAULT (NEXT VALUE FOR dbo.Seq_FunctionApplicationMappings_MappingNo) FOR MappingNo;');
  DECLARE @nextFamNo BIGINT;
  EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(MappingNo) + 1, 1) FROM dbo.FunctionApplicationMappings;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextFamNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_FunctionApplicationMappings_MappingNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextFamNo) + N';';
  EXEC(@restartSql);

  IF OBJECT_ID(N'dbo.Seq_ApplicationDepartmentMappings_MappingNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_ApplicationDepartmentMappings_MappingNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH('dbo.ApplicationDepartmentMappings', 'MappingNo') IS NULL
    ALTER TABLE dbo.ApplicationDepartmentMappings ADD MappingNo BIGINT NULL;
  EXEC(N'
    ;WITH src AS (
      SELECT MappingId, ROW_NUMBER() OVER (ORDER BY COALESCE(CreatedAt, GETDATE()), MappingId) AS rn
      FROM dbo.ApplicationDepartmentMappings
      WHERE MappingNo IS NULL
    )
    UPDATE adm
    SET MappingNo = src.rn
    FROM dbo.ApplicationDepartmentMappings adm
    INNER JOIN src ON src.MappingId = adm.MappingId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ApplicationDepartmentMappings') AND name = N'UX_ApplicationDepartmentMappings_MappingNo')
    EXEC(N'CREATE UNIQUE INDEX UX_ApplicationDepartmentMappings_MappingNo ON dbo.ApplicationDepartmentMappings(MappingNo) WHERE MappingNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.ApplicationDepartmentMappings') AND name = N'DF_ApplicationDepartmentMappings_MappingNo')
    EXEC(N'ALTER TABLE dbo.ApplicationDepartmentMappings ADD CONSTRAINT DF_ApplicationDepartmentMappings_MappingNo DEFAULT (NEXT VALUE FOR dbo.Seq_ApplicationDepartmentMappings_MappingNo) FOR MappingNo;');
  DECLARE @nextAdmNo BIGINT;
  EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(MappingNo) + 1, 1) FROM dbo.ApplicationDepartmentMappings;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextAdmNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_ApplicationDepartmentMappings_MappingNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextAdmNo) + N';';
  EXEC(@restartSql);

  IF OBJECT_ID(N'dbo.Seq_ScheduledOperations_OperationNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_ScheduledOperations_OperationNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH('dbo.ScheduledOperations', 'OperationNo') IS NULL
    ALTER TABLE dbo.ScheduledOperations ADD OperationNo BIGINT NULL;
  EXEC(N'
    ;WITH src AS (
      SELECT OperationId, ROW_NUMBER() OVER (ORDER BY COALESCE(CreatedAt, GETDATE()), OperationId) AS rn
      FROM dbo.ScheduledOperations
      WHERE OperationNo IS NULL
    )
    UPDATE so
    SET OperationNo = src.rn
    FROM dbo.ScheduledOperations so
    INNER JOIN src ON src.OperationId = so.OperationId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ScheduledOperations') AND name = N'UX_ScheduledOperations_OperationNo')
    EXEC(N'CREATE UNIQUE INDEX UX_ScheduledOperations_OperationNo ON dbo.ScheduledOperations(OperationNo) WHERE OperationNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.ScheduledOperations') AND name = N'DF_ScheduledOperations_OperationNo')
    EXEC(N'ALTER TABLE dbo.ScheduledOperations ADD CONSTRAINT DF_ScheduledOperations_OperationNo DEFAULT (NEXT VALUE FOR dbo.Seq_ScheduledOperations_OperationNo) FOR OperationNo;');
  DECLARE @nextOperationNo BIGINT;
  EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(OperationNo) + 1, 1) FROM dbo.ScheduledOperations;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextOperationNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_ScheduledOperations_OperationNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextOperationNo) + N';';
  EXEC(@restartSql);

  IF OBJECT_ID(N'dbo.Seq_BestCommentFeedback_FeedbackNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_BestCommentFeedback_FeedbackNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH('dbo.BestCommentFeedback', 'FeedbackNo') IS NULL
    ALTER TABLE dbo.BestCommentFeedback ADD FeedbackNo BIGINT NULL;
  EXEC(N'
    ;WITH src AS (
      SELECT FeedbackId, ROW_NUMBER() OVER (ORDER BY COALESCE(CreatedAt, GETDATE()), FeedbackId) AS rn
      FROM dbo.BestCommentFeedback
      WHERE FeedbackNo IS NULL
    )
    UPDATE bcf
    SET FeedbackNo = src.rn
    FROM dbo.BestCommentFeedback bcf
    INNER JOIN src ON src.FeedbackId = bcf.FeedbackId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.BestCommentFeedback') AND name = N'UX_BestCommentFeedback_FeedbackNo')
    EXEC(N'CREATE UNIQUE INDEX UX_BestCommentFeedback_FeedbackNo ON dbo.BestCommentFeedback(FeedbackNo) WHERE FeedbackNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.BestCommentFeedback') AND name = N'DF_BestCommentFeedback_FeedbackNo')
    EXEC(N'ALTER TABLE dbo.BestCommentFeedback ADD CONSTRAINT DF_BestCommentFeedback_FeedbackNo DEFAULT (NEXT VALUE FOR dbo.Seq_BestCommentFeedback_FeedbackNo) FOR FeedbackNo;');
  DECLARE @nextFeedbackNo BIGINT;
  EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(FeedbackNo) + 1, 1) FROM dbo.BestCommentFeedback;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextFeedbackNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_BestCommentFeedback_FeedbackNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextFeedbackNo) + N';';
  EXEC(@restartSql);

  IF OBJECT_ID(N'dbo.Seq_AuditLogs_LogNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_AuditLogs_LogNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH('dbo.AuditLogs', 'LogNo') IS NULL
    ALTER TABLE dbo.AuditLogs ADD LogNo BIGINT NULL;
  EXEC(N'
    ;WITH src AS (
      SELECT LogId, ROW_NUMBER() OVER (ORDER BY COALESCE([Timestamp], GETDATE()), LogId) AS rn
      FROM dbo.AuditLogs
      WHERE LogNo IS NULL
    )
    UPDATE al
    SET LogNo = src.rn
    FROM dbo.AuditLogs al
    INNER JOIN src ON src.LogId = al.LogId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.AuditLogs') AND name = N'UX_AuditLogs_LogNo')
    EXEC(N'CREATE UNIQUE INDEX UX_AuditLogs_LogNo ON dbo.AuditLogs(LogNo) WHERE LogNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.AuditLogs') AND name = N'DF_AuditLogs_LogNo')
    EXEC(N'ALTER TABLE dbo.AuditLogs ADD CONSTRAINT DF_AuditLogs_LogNo DEFAULT (NEXT VALUE FOR dbo.Seq_AuditLogs_LogNo) FOR LogNo;');
  DECLARE @nextLogNo BIGINT;
  EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(LogNo) + 1, 1) FROM dbo.AuditLogs;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextLogNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_AuditLogs_LogNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextLogNo) + N';';
  EXEC(@restartSql);

  IF OBJECT_ID(N'dbo.Seq_EmailLogs_EmailNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_EmailLogs_EmailNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH('dbo.EmailLogs', 'EmailNo') IS NULL
    ALTER TABLE dbo.EmailLogs ADD EmailNo BIGINT NULL;
  EXEC(N'
    ;WITH src AS (
      SELECT EmailLogId, ROW_NUMBER() OVER (ORDER BY COALESCE(SentAt, GETDATE()), EmailLogId) AS rn
      FROM dbo.EmailLogs
      WHERE EmailNo IS NULL
    )
    UPDATE el
    SET EmailNo = src.rn
    FROM dbo.EmailLogs el
    INNER JOIN src ON src.EmailLogId = el.EmailLogId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.EmailLogs') AND name = N'UX_EmailLogs_EmailNo')
    EXEC(N'CREATE UNIQUE INDEX UX_EmailLogs_EmailNo ON dbo.EmailLogs(EmailNo) WHERE EmailNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.EmailLogs') AND name = N'DF_EmailLogs_EmailNo')
    EXEC(N'ALTER TABLE dbo.EmailLogs ADD CONSTRAINT DF_EmailLogs_EmailNo DEFAULT (NEXT VALUE FOR dbo.Seq_EmailLogs_EmailNo) FOR EmailNo;');
  DECLARE @nextEmailNo BIGINT;
  EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(EmailNo) + 1, 1) FROM dbo.EmailLogs;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextEmailNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_EmailLogs_EmailNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextEmailNo) + N';';
  EXEC(@restartSql);

  IF OBJECT_ID(N'dbo.Seq_ApprovalHistory_HistoryNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_ApprovalHistory_HistoryNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH('dbo.ApprovalHistory', 'HistoryNo') IS NULL
    ALTER TABLE dbo.ApprovalHistory ADD HistoryNo BIGINT NULL;
  EXEC(N'
    ;WITH src AS (
      SELECT HistoryId, ROW_NUMBER() OVER (ORDER BY COALESCE(PerformedAt, GETDATE()), HistoryId) AS rn
      FROM dbo.ApprovalHistory
      WHERE HistoryNo IS NULL
    )
    UPDATE ah
    SET HistoryNo = src.rn
    FROM dbo.ApprovalHistory ah
    INNER JOIN src ON src.HistoryId = ah.HistoryId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.ApprovalHistory') AND name = N'UX_ApprovalHistory_HistoryNo')
    EXEC(N'CREATE UNIQUE INDEX UX_ApprovalHistory_HistoryNo ON dbo.ApprovalHistory(HistoryNo) WHERE HistoryNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.ApprovalHistory') AND name = N'DF_ApprovalHistory_HistoryNo')
    EXEC(N'ALTER TABLE dbo.ApprovalHistory ADD CONSTRAINT DF_ApprovalHistory_HistoryNo DEFAULT (NEXT VALUE FOR dbo.Seq_ApprovalHistory_HistoryNo) FOR HistoryNo;');
  DECLARE @nextHistoryNo BIGINT;
  EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(HistoryNo) + 1, 1) FROM dbo.ApprovalHistory;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextHistoryNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_ApprovalHistory_HistoryNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextHistoryNo) + N';';
  EXEC(@restartSql);

  IF OBJECT_ID(N'dbo.Seq_Sessions_SessionNo', N'SO') IS NULL
    EXEC(N'CREATE SEQUENCE dbo.Seq_Sessions_SessionNo AS BIGINT START WITH 1 INCREMENT BY 1;');
  IF COL_LENGTH('dbo.Sessions', 'SessionNo') IS NULL
    ALTER TABLE dbo.Sessions ADD SessionNo BIGINT NULL;
  EXEC(N'
    ;WITH src AS (
      SELECT SessionId, ROW_NUMBER() OVER (ORDER BY COALESCE(CreatedAt, GETDATE()), SessionId) AS rn
      FROM dbo.Sessions
      WHERE SessionNo IS NULL
    )
    UPDATE s
    SET SessionNo = src.rn
    FROM dbo.Sessions s
    INNER JOIN src ON src.SessionId = s.SessionId;
  ');
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Sessions') AND name = N'UX_Sessions_SessionNo')
    EXEC(N'CREATE UNIQUE INDEX UX_Sessions_SessionNo ON dbo.Sessions(SessionNo) WHERE SessionNo IS NOT NULL;');
  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.Sessions') AND name = N'DF_Sessions_SessionNo')
    EXEC(N'ALTER TABLE dbo.Sessions ADD CONSTRAINT DF_Sessions_SessionNo DEFAULT (NEXT VALUE FOR dbo.Seq_Sessions_SessionNo) FOR SessionNo;');
  DECLARE @nextSessionNo BIGINT;
  EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(SessionNo) + 1, 1) FROM dbo.Sessions;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextSessionNo OUTPUT;
  SET @restartSql = N'ALTER SEQUENCE dbo.Seq_Sessions_SessionNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextSessionNo) + N';';
  EXEC(@restartSql);

  IF OBJECT_ID(N'dbo.PasswordResetTokens', N'U') IS NOT NULL
  BEGIN
    IF OBJECT_ID(N'dbo.Seq_PasswordResetTokens_ResetTokenNo', N'SO') IS NULL
      EXEC(N'CREATE SEQUENCE dbo.Seq_PasswordResetTokens_ResetTokenNo AS BIGINT START WITH 1 INCREMENT BY 1;');
    IF COL_LENGTH('dbo.PasswordResetTokens', 'ResetTokenNo') IS NULL
      ALTER TABLE dbo.PasswordResetTokens ADD ResetTokenNo BIGINT NULL;
    EXEC(N'
      ;WITH src AS (
        SELECT PasswordResetTokenId, ROW_NUMBER() OVER (ORDER BY COALESCE(CreatedAt, GETDATE()), PasswordResetTokenId) AS rn
        FROM dbo.PasswordResetTokens
        WHERE ResetTokenNo IS NULL
      )
      UPDATE prt
      SET ResetTokenNo = src.rn
      FROM dbo.PasswordResetTokens prt
      INNER JOIN src ON src.PasswordResetTokenId = prt.PasswordResetTokenId;
    ');
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.PasswordResetTokens') AND name = N'UX_PasswordResetTokens_ResetTokenNo')
      EXEC(N'CREATE UNIQUE INDEX UX_PasswordResetTokens_ResetTokenNo ON dbo.PasswordResetTokens(ResetTokenNo) WHERE ResetTokenNo IS NOT NULL;');
    IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.PasswordResetTokens') AND name = N'DF_PasswordResetTokens_ResetTokenNo')
      EXEC(N'ALTER TABLE dbo.PasswordResetTokens ADD CONSTRAINT DF_PasswordResetTokens_ResetTokenNo DEFAULT (NEXT VALUE FOR dbo.Seq_PasswordResetTokens_ResetTokenNo) FOR ResetTokenNo;');
    DECLARE @nextResetTokenNo BIGINT;
    EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(ResetTokenNo) + 1, 1) FROM dbo.PasswordResetTokens;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextResetTokenNo OUTPUT;
    SET @restartSql = N'ALTER SEQUENCE dbo.Seq_PasswordResetTokens_ResetTokenNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextResetTokenNo) + N';';
    EXEC(@restartSql);
  END;

  IF OBJECT_ID(N'dbo.SAPSyncLogs', N'U') IS NOT NULL
  BEGIN
    IF OBJECT_ID(N'dbo.Seq_SAPSyncLogs_SyncLogNo', N'SO') IS NULL
      EXEC(N'CREATE SEQUENCE dbo.Seq_SAPSyncLogs_SyncLogNo AS BIGINT START WITH 1 INCREMENT BY 1;');
    IF COL_LENGTH('dbo.SAPSyncLogs', 'SyncLogNo') IS NULL
      ALTER TABLE dbo.SAPSyncLogs ADD SyncLogNo BIGINT NULL;
    EXEC(N'
      ;WITH src AS (
        SELECT SyncLogId, ROW_NUMBER() OVER (ORDER BY COALESCE(CreatedAt, GETDATE()), SyncLogId) AS rn
        FROM dbo.SAPSyncLogs
        WHERE SyncLogNo IS NULL
      )
      UPDATE sl
      SET SyncLogNo = src.rn
      FROM dbo.SAPSyncLogs sl
      INNER JOIN src ON src.SyncLogId = sl.SyncLogId;
    ');
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.SAPSyncLogs') AND name = N'UX_SAPSyncLogs_SyncLogNo')
      EXEC(N'CREATE UNIQUE INDEX UX_SAPSyncLogs_SyncLogNo ON dbo.SAPSyncLogs(SyncLogNo) WHERE SyncLogNo IS NOT NULL;');
    IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.SAPSyncLogs') AND name = N'DF_SAPSyncLogs_SyncLogNo')
      EXEC(N'ALTER TABLE dbo.SAPSyncLogs ADD CONSTRAINT DF_SAPSyncLogs_SyncLogNo DEFAULT (NEXT VALUE FOR dbo.Seq_SAPSyncLogs_SyncLogNo) FOR SyncLogNo;');
    DECLARE @nextSyncLogNo BIGINT;
    EXEC sp_executesql N'SELECT @valueOut = ISNULL(MAX(SyncLogNo) + 1, 1) FROM dbo.SAPSyncLogs;', N'@valueOut BIGINT OUTPUT', @valueOut = @nextSyncLogNo OUTPUT;
    SET @restartSql = N'ALTER SEQUENCE dbo.Seq_SAPSyncLogs_SyncLogNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextSyncLogNo) + N';';
    EXEC(@restartSql);
  END;

  DECLARE @AdminAssignmentsTable NVARCHAR(128) =
    CASE
      WHEN OBJECT_ID(N'dbo.EventAdminAssignments', N'U') IS NOT NULL THEN N'dbo.EventAdminAssignments'
      WHEN OBJECT_ID(N'dbo.SurveyAdminAssignments', N'U') IS NOT NULL THEN N'dbo.SurveyAdminAssignments'
      ELSE NULL
    END;
  IF @AdminAssignmentsTable IS NOT NULL
  BEGIN
    IF OBJECT_ID(N'dbo.Seq_EventAdminAssignments_AssignmentNo', N'SO') IS NULL
      EXEC(N'CREATE SEQUENCE dbo.Seq_EventAdminAssignments_AssignmentNo AS BIGINT START WITH 1 INCREMENT BY 1;');
    IF COL_LENGTH(@AdminAssignmentsTable, 'AssignmentNo') IS NULL
      EXEC(N'ALTER TABLE ' + @AdminAssignmentsTable + N' ADD AssignmentNo BIGINT NULL;');
    EXEC(N'
      ;WITH src AS (
        SELECT SurveyId, AdminUserId, ROW_NUMBER() OVER (ORDER BY CreatedAt, SurveyId, AdminUserId) AS rn
        FROM ' + @AdminAssignmentsTable + N'
        WHERE AssignmentNo IS NULL
      )
      UPDATE target
      SET AssignmentNo = src.rn
      FROM ' + @AdminAssignmentsTable + N' target
      INNER JOIN src ON src.SurveyId = target.SurveyId AND src.AdminUserId = target.AdminUserId;
    ');
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(@AdminAssignmentsTable) AND name = N'UX_EventAdminAssignments_AssignmentNo')
      EXEC(N'CREATE UNIQUE INDEX UX_EventAdminAssignments_AssignmentNo ON ' + @AdminAssignmentsTable + N'(AssignmentNo) WHERE AssignmentNo IS NOT NULL;');
    IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(@AdminAssignmentsTable) AND name = N'DF_EventAdminAssignments_AssignmentNo')
      EXEC(N'ALTER TABLE ' + @AdminAssignmentsTable + N' ADD CONSTRAINT DF_EventAdminAssignments_AssignmentNo DEFAULT (NEXT VALUE FOR dbo.Seq_EventAdminAssignments_AssignmentNo) FOR AssignmentNo;');
    DECLARE @nextAssignmentNo BIGINT;
    DECLARE @sqlAssignment NVARCHAR(MAX) = N'SELECT @valueOut = ISNULL(MAX(AssignmentNo) + 1, 1) FROM ' + @AdminAssignmentsTable + N';';
    EXEC sp_executesql @sqlAssignment, N'@valueOut BIGINT OUTPUT', @valueOut = @nextAssignmentNo OUTPUT;
    SET @restartSql = N'ALTER SEQUENCE dbo.Seq_EventAdminAssignments_AssignmentNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextAssignmentNo) + N';';
    EXEC(@restartSql);
  END;

  DECLARE @PublishCyclesTable NVARCHAR(128) =
    CASE
      WHEN OBJECT_ID(N'dbo.EventPublishCycles', N'U') IS NOT NULL THEN N'dbo.EventPublishCycles'
      WHEN OBJECT_ID(N'dbo.SurveyPublishCycles', N'U') IS NOT NULL THEN N'dbo.SurveyPublishCycles'
      ELSE NULL
    END;
  IF @PublishCyclesTable IS NOT NULL
  BEGIN
    IF OBJECT_ID(N'dbo.Seq_EventPublishCycles_PublishCycleNo', N'SO') IS NULL
      EXEC(N'CREATE SEQUENCE dbo.Seq_EventPublishCycles_PublishCycleNo AS BIGINT START WITH 1 INCREMENT BY 1;');
    IF COL_LENGTH(@PublishCyclesTable, 'PublishCycleNo') IS NULL
      EXEC(N'ALTER TABLE ' + @PublishCyclesTable + N' ADD PublishCycleNo BIGINT NULL;');
    EXEC(N'
      ;WITH src AS (
        SELECT PublishCycleId, ROW_NUMBER() OVER (ORDER BY CreatedAt, PublishCycleId) AS rn
        FROM ' + @PublishCyclesTable + N'
        WHERE PublishCycleNo IS NULL
      )
      UPDATE target
      SET PublishCycleNo = src.rn
      FROM ' + @PublishCyclesTable + N' target
      INNER JOIN src ON src.PublishCycleId = target.PublishCycleId;
    ');
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(@PublishCyclesTable) AND name = N'UX_EventPublishCycles_PublishCycleNo')
      EXEC(N'CREATE UNIQUE INDEX UX_EventPublishCycles_PublishCycleNo ON ' + @PublishCyclesTable + N'(PublishCycleNo) WHERE PublishCycleNo IS NOT NULL;');
    IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(@PublishCyclesTable) AND name = N'DF_EventPublishCycles_PublishCycleNo')
      EXEC(N'ALTER TABLE ' + @PublishCyclesTable + N' ADD CONSTRAINT DF_EventPublishCycles_PublishCycleNo DEFAULT (NEXT VALUE FOR dbo.Seq_EventPublishCycles_PublishCycleNo) FOR PublishCycleNo;');
    DECLARE @nextPublishCycleNo BIGINT;
    DECLARE @sqlPublishCycle NVARCHAR(MAX) = N'SELECT @valueOut = ISNULL(MAX(PublishCycleNo) + 1, 1) FROM ' + @PublishCyclesTable + N';';
    EXEC sp_executesql @sqlPublishCycle, N'@valueOut BIGINT OUTPUT', @valueOut = @nextPublishCycleNo OUTPUT;
    SET @restartSql = N'ALTER SEQUENCE dbo.Seq_EventPublishCycles_PublishCycleNo RESTART WITH ' + CONVERT(NVARCHAR(30), @nextPublishCycleNo) + N';';
    EXEC(@restartSql);
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
