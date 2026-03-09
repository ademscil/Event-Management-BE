/*
  Migration 022: Align event-management naming and function ownership
  - Canonicalize main event header tables to Events / EventConfiguration
  - Keep backward-compatible survey synonyms for existing code
  - Add Functions.DeptId to support department ownership of functions
*/

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.Surveys', N'SN') IS NOT NULL
    DROP SYNONYM dbo.Surveys;

  IF OBJECT_ID(N'dbo.SurveyConfiguration', N'SN') IS NOT NULL
    DROP SYNONYM dbo.SurveyConfiguration;

  IF OBJECT_ID(N'dbo.Surveys', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.Events', N'U') IS NULL
    EXEC sp_rename N'dbo.Surveys', N'Events';

  IF OBJECT_ID(N'dbo.SurveyConfiguration', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.EventConfiguration', N'U') IS NULL
    EXEC sp_rename N'dbo.SurveyConfiguration', N'EventConfiguration';

  IF OBJECT_ID(N'dbo.Events', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.Surveys', N'SN') IS NULL
    EXEC('CREATE SYNONYM dbo.Surveys FOR dbo.Events');

  IF OBJECT_ID(N'dbo.EventConfiguration', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.SurveyConfiguration', N'SN') IS NULL
    EXEC('CREATE SYNONYM dbo.SurveyConfiguration FOR dbo.EventConfiguration');

  IF OBJECT_ID(N'dbo.Functions', N'U') IS NOT NULL AND COL_LENGTH('dbo.Functions', 'DeptId') IS NULL
  BEGIN
    ALTER TABLE dbo.Functions ADD DeptId UNIQUEIDENTIFIER NULL;
  END;

  IF OBJECT_ID(N'dbo.Functions', N'U') IS NOT NULL
  BEGIN
    EXEC(N'
      UPDATE f
      SET DeptId = u.DepartmentId
      FROM dbo.Functions f
      INNER JOIN dbo.Users u ON f.ITDeptHeadUserId = u.UserId
      WHERE f.DeptId IS NULL
        AND f.ITDeptHeadUserId IS NOT NULL
        AND u.DepartmentId IS NOT NULL;
    ');

    IF NOT EXISTS (
      SELECT 1
      FROM sys.foreign_keys
      WHERE name = N'FK_Functions_Departments_DeptId'
    )
    BEGIN
      EXEC(N'
        ALTER TABLE dbo.Functions
        ADD CONSTRAINT FK_Functions_Departments_DeptId
        FOREIGN KEY (DeptId) REFERENCES dbo.Departments(DepartmentId);
      ');
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'IX_Functions_DeptId'
        AND object_id = OBJECT_ID(N'dbo.Functions')
    )
    BEGIN
      EXEC(N'CREATE INDEX IX_Functions_DeptId ON dbo.Functions(DeptId);');
    END;
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;

  THROW;
END CATCH;
