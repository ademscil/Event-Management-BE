/*
  Migration: Rename survey-oriented tables to event-oriented names
  - Surveys -> Events
  - SurveyConfiguration -> EventConfiguration

  Backward compatibility is preserved by creating synonyms:
  - Surveys -> Events
  - SurveyConfiguration -> EventConfiguration
*/

BEGIN TRY
  BEGIN TRANSACTION;

  -- Drop compatibility synonyms first if they already exist
  IF OBJECT_ID(N'dbo.Surveys', N'SN') IS NOT NULL
    DROP SYNONYM dbo.Surveys;

  IF OBJECT_ID(N'dbo.SurveyConfiguration', N'SN') IS NOT NULL
    DROP SYNONYM dbo.SurveyConfiguration;

  -- Rename base tables if they still use old names
  IF OBJECT_ID(N'dbo.Surveys', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.Events', N'U') IS NULL
    EXEC sp_rename N'dbo.Surveys', N'Events';

  IF OBJECT_ID(N'dbo.SurveyConfiguration', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.EventConfiguration', N'U') IS NULL
    EXEC sp_rename N'dbo.SurveyConfiguration', N'EventConfiguration';

  -- Recreate compatibility synonyms so old code paths still work
  IF OBJECT_ID(N'dbo.Events', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.Surveys', N'SN') IS NULL
    EXEC('CREATE SYNONYM dbo.Surveys FOR dbo.Events');

  IF OBJECT_ID(N'dbo.EventConfiguration', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.SurveyConfiguration', N'SN') IS NULL
    EXEC('CREATE SYNONYM dbo.SurveyConfiguration FOR dbo.EventConfiguration');

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;

  THROW;
END CATCH;
