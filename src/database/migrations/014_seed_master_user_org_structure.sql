/*
  Migration 014:
  Seed division/department structure for Master User mockup and map existing users.
  Target BU: Corporate HO (29760F29-B384-4FDB-B645-9471A3A4C932)
*/

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @CorporateHO UNIQUEIDENTIFIER = '29760F29-B384-4FDB-B645-9471A3A4C932';

  IF NOT EXISTS (
    SELECT 1 FROM dbo.BusinessUnits WHERE BusinessUnitId = @CorporateHO
  )
  BEGIN
    THROW 50010, 'Corporate HO Business Unit not found.', 1;
  END

  IF NOT EXISTS (SELECT 1 FROM dbo.Divisions WHERE Code = 'DIV-ITAPPS')
  BEGIN
    INSERT INTO dbo.Divisions (DivisionId, BusinessUnitId, Code, Name, IsActive, CreatedAt)
    VALUES (NEWID(), @CorporateHO, 'DIV-ITAPPS', 'IT Apps', 1, GETDATE());
  END

  IF NOT EXISTS (SELECT 1 FROM dbo.Divisions WHERE Code = 'DIV-ITOPS')
  BEGIN
    INSERT INTO dbo.Divisions (DivisionId, BusinessUnitId, Code, Name, IsActive, CreatedAt)
    VALUES (NEWID(), @CorporateHO, 'DIV-ITOPS', 'IT Ops', 1, GETDATE());
  END

  IF NOT EXISTS (SELECT 1 FROM dbo.Divisions WHERE Code = 'DIV-COMM')
  BEGIN
    INSERT INTO dbo.Divisions (DivisionId, BusinessUnitId, Code, Name, IsActive, CreatedAt)
    VALUES (NEWID(), @CorporateHO, 'DIV-COMM', 'Commercial', 1, GETDATE());
  END

  IF NOT EXISTS (SELECT 1 FROM dbo.Divisions WHERE Code = 'DIV-RETAIL')
  BEGIN
    INSERT INTO dbo.Divisions (DivisionId, BusinessUnitId, Code, Name, IsActive, CreatedAt)
    VALUES (NEWID(), @CorporateHO, 'DIV-RETAIL', 'Retail', 1, GETDATE());
  END

  DECLARE @DivITApps UNIQUEIDENTIFIER = (SELECT TOP 1 DivisionId FROM dbo.Divisions WHERE Code = 'DIV-ITAPPS');
  DECLARE @DivITOps UNIQUEIDENTIFIER = (SELECT TOP 1 DivisionId FROM dbo.Divisions WHERE Code = 'DIV-ITOPS');
  DECLARE @DivCommercial UNIQUEIDENTIFIER = (SELECT TOP 1 DivisionId FROM dbo.Divisions WHERE Code = 'DIV-COMM');
  DECLARE @DivRetail UNIQUEIDENTIFIER = (SELECT TOP 1 DivisionId FROM dbo.Divisions WHERE Code = 'DIV-RETAIL');

  IF NOT EXISTS (SELECT 1 FROM dbo.Departments WHERE Code = 'DEPT-ITDIG-APPS')
  BEGIN
    INSERT INTO dbo.Departments (DepartmentId, DivisionId, Code, Name, IsActive, CreatedAt)
    VALUES (NEWID(), @DivITApps, 'DEPT-ITDIG-APPS', 'IT Digital', 1, GETDATE());
  END

  IF NOT EXISTS (SELECT 1 FROM dbo.Departments WHERE Code = 'DEPT-ITINF-OPS')
  BEGIN
    INSERT INTO dbo.Departments (DepartmentId, DivisionId, Code, Name, IsActive, CreatedAt)
    VALUES (NEWID(), @DivITOps, 'DEPT-ITINF-OPS', 'IT Infrastructure', 1, GETDATE());
  END

  IF NOT EXISTS (SELECT 1 FROM dbo.Departments WHERE Code = 'DEPT-SALES-COMM')
  BEGIN
    INSERT INTO dbo.Departments (DepartmentId, DivisionId, Code, Name, IsActive, CreatedAt)
    VALUES (NEWID(), @DivCommercial, 'DEPT-SALES-COMM', 'Sales', 1, GETDATE());
  END

  IF NOT EXISTS (SELECT 1 FROM dbo.Departments WHERE Code = 'DEPT-SALES-RET')
  BEGIN
    INSERT INTO dbo.Departments (DepartmentId, DivisionId, Code, Name, IsActive, CreatedAt)
    VALUES (NEWID(), @DivRetail, 'DEPT-SALES-RET', 'Sales', 1, GETDATE());
  END

  DECLARE @DeptITDigital UNIQUEIDENTIFIER = (SELECT TOP 1 DepartmentId FROM dbo.Departments WHERE Code = 'DEPT-ITDIG-APPS');
  DECLARE @DeptITInfra UNIQUEIDENTIFIER = (SELECT TOP 1 DepartmentId FROM dbo.Departments WHERE Code = 'DEPT-ITINF-OPS');
  DECLARE @DeptSalesComm UNIQUEIDENTIFIER = (SELECT TOP 1 DepartmentId FROM dbo.Departments WHERE Code = 'DEPT-SALES-COMM');
  DECLARE @DeptSalesRetail UNIQUEIDENTIFIER = (SELECT TOP 1 DepartmentId FROM dbo.Departments WHERE Code = 'DEPT-SALES-RET');

  UPDATE dbo.Users
  SET BusinessUnitId = @CorporateHO,
      DivisionId = @DivITApps,
      DepartmentId = @DeptITDigital,
      UpdatedAt = GETDATE()
  WHERE Username IN ('2091', '3321');

  UPDATE dbo.Users
  SET BusinessUnitId = @CorporateHO,
      DivisionId = @DivITOps,
      DepartmentId = @DeptITInfra,
      UpdatedAt = GETDATE()
  WHERE Username = '4589';

  UPDATE dbo.Users
  SET BusinessUnitId = @CorporateHO,
      DivisionId = @DivCommercial,
      DepartmentId = @DeptSalesComm,
      UpdatedAt = GETDATE()
  WHERE Username = '7751';

  UPDATE dbo.Users
  SET BusinessUnitId = @CorporateHO,
      DivisionId = @DivRetail,
      DepartmentId = @DeptSalesRetail,
      UpdatedAt = GETDATE()
  WHERE Username = '8893';

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;

