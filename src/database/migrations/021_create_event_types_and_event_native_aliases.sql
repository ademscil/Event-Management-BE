/*
  Migration 021: Event management schema foundation
  - Create master EventTypes
  - Attach EventTypeId to Events
  - Rename survey-specific support tables to event-native names
  - Keep backward compatibility through synonyms so existing code keeps working
*/

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.EventTypes', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.EventTypes (
      EventTypeId UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
      Code NVARCHAR(50) NOT NULL,
      Name NVARCHAR(200) NOT NULL,
      Description NVARCHAR(500) NULL,
      IsActive BIT NOT NULL DEFAULT 1,
      CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT PK_EventTypes PRIMARY KEY (EventTypeId),
      CONSTRAINT UQ_EventTypes_Code UNIQUE (Code),
      CONSTRAINT UQ_EventTypes_Name UNIQUE (Name)
    );

    CREATE INDEX IX_EventTypes_IsActive ON dbo.EventTypes(IsActive);
  END;

  MERGE dbo.EventTypes AS target
  USING (
    VALUES
      (N'SURVEY',   N'Survey',   N'Customer satisfaction, feedback, evaluation, or questionnaire-based event'),
      (N'SEMINAR',  N'Seminar',  N'Formal seminar event with registration and attendance tracking'),
      (N'WORKSHOP', N'Workshop', N'Hands-on workshop event'),
      (N'TRAINING', N'Training', N'Training or upskilling event'),
      (N'WEBINAR',  N'Webinar',  N'Online webinar event'),
      (N'TOWNHALL', N'Townhall', N'Internal townhall or company update event'),
      (N'EXHIBITION', N'Exhibition', N'Booth, expo, or exhibition event'),
      (N'DOORPRIZE', N'Doorprize', N'Doorprize event management and winner selection')
  ) AS source (Code, Name, Description)
  ON target.Code = source.Code
  WHEN MATCHED THEN
    UPDATE SET
      Name = source.Name,
      Description = source.Description,
      IsActive = 1,
      UpdatedAt = GETDATE()
  WHEN NOT MATCHED THEN
    INSERT (EventTypeId, Code, Name, Description, IsActive, CreatedAt)
    VALUES (NEWID(), source.Code, source.Name, source.Description, 1, GETDATE());

  IF OBJECT_ID(N'dbo.Events', N'U') IS NOT NULL AND COL_LENGTH('dbo.Events', 'EventTypeId') IS NULL
  BEGIN
    ALTER TABLE dbo.Events ADD EventTypeId UNIQUEIDENTIFIER NULL;
  END;

  DECLARE @surveyEventTypeId UNIQUEIDENTIFIER;
  SELECT @surveyEventTypeId = EventTypeId
  FROM dbo.EventTypes
  WHERE Code = N'SURVEY';

  IF OBJECT_ID(N'dbo.Events', N'U') IS NOT NULL
  BEGIN
    EXEC sp_executesql
      N'
        UPDATE dbo.Events
        SET EventTypeId = @SurveyEventTypeId
        WHERE EventTypeId IS NULL;
      ',
      N'@SurveyEventTypeId UNIQUEIDENTIFIER',
      @SurveyEventTypeId = @surveyEventTypeId;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = N'FK_Events_EventTypes'
    )
    BEGIN
      EXEC(N'
        ALTER TABLE dbo.Events
        ADD CONSTRAINT FK_Events_EventTypes
        FOREIGN KEY (EventTypeId) REFERENCES dbo.EventTypes(EventTypeId);
      ');
    END;
  END;

  IF OBJECT_ID(N'dbo.SurveyAdminAssignments', N'SN') IS NOT NULL
    DROP SYNONYM dbo.SurveyAdminAssignments;

  IF OBJECT_ID(N'dbo.SurveyPublishCycles', N'SN') IS NOT NULL
    DROP SYNONYM dbo.SurveyPublishCycles;

  IF OBJECT_ID(N'dbo.SurveyAdminAssignments', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.EventAdminAssignments', N'U') IS NULL
    EXEC sp_rename N'dbo.SurveyAdminAssignments', N'EventAdminAssignments';

  IF OBJECT_ID(N'dbo.SurveyPublishCycles', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.EventPublishCycles', N'U') IS NULL
    EXEC sp_rename N'dbo.SurveyPublishCycles', N'EventPublishCycles';

  IF OBJECT_ID(N'dbo.EventAdminAssignments', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.SurveyAdminAssignments', N'SN') IS NULL
    EXEC('CREATE SYNONYM dbo.SurveyAdminAssignments FOR dbo.EventAdminAssignments');

  IF OBJECT_ID(N'dbo.EventPublishCycles', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.SurveyPublishCycles', N'SN') IS NULL
    EXEC('CREATE SYNONYM dbo.SurveyPublishCycles FOR dbo.EventPublishCycles');

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;

  THROW;
END CATCH;
