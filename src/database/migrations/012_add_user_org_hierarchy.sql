/*
  Migration 012:
  Add organizational hierarchy references to Users table.
  - Users.BusinessUnitId -> BusinessUnits.BusinessUnitId
  - Users.DivisionId -> Divisions.DivisionId
  - Users.DepartmentId -> Departments.DepartmentId
*/

BEGIN TRY
  BEGIN TRANSACTION;

  IF COL_LENGTH('dbo.Users', 'BusinessUnitId') IS NULL
    ALTER TABLE dbo.Users ADD BusinessUnitId UNIQUEIDENTIFIER NULL;

  IF COL_LENGTH('dbo.Users', 'DivisionId') IS NULL
    ALTER TABLE dbo.Users ADD DivisionId UNIQUEIDENTIFIER NULL;

  IF COL_LENGTH('dbo.Users', 'DepartmentId') IS NULL
    ALTER TABLE dbo.Users ADD DepartmentId UNIQUEIDENTIFIER NULL;

  IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Users_BusinessUnits'
  )
  BEGIN
    ALTER TABLE dbo.Users
    ADD CONSTRAINT FK_Users_BusinessUnits
    FOREIGN KEY (BusinessUnitId) REFERENCES dbo.BusinessUnits(BusinessUnitId);
  END

  IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Users_Divisions'
  )
  BEGIN
    ALTER TABLE dbo.Users
    ADD CONSTRAINT FK_Users_Divisions
    FOREIGN KEY (DivisionId) REFERENCES dbo.Divisions(DivisionId);
  END

  IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Users_Departments'
  )
  BEGIN
    ALTER TABLE dbo.Users
    ADD CONSTRAINT FK_Users_Departments
    FOREIGN KEY (DepartmentId) REFERENCES dbo.Departments(DepartmentId);
  END

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_BusinessUnitId' AND object_id = OBJECT_ID('dbo.Users')
  )
    CREATE INDEX IX_Users_BusinessUnitId ON dbo.Users(BusinessUnitId);

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_DivisionId' AND object_id = OBJECT_ID('dbo.Users')
  )
    CREATE INDEX IX_Users_DivisionId ON dbo.Users(DivisionId);

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_DepartmentId' AND object_id = OBJECT_ID('dbo.Users')
  )
    CREATE INDEX IX_Users_DepartmentId ON dbo.Users(DepartmentId);

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
