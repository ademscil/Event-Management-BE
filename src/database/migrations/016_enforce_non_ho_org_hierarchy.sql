/*
  Migration 016:
  Enforce non-Corporate-HO org hierarchy where Division and Department mirror Business Unit name.

  Rules:
  - Corporate HO keeps existing detailed Division/Department hierarchy.
  - For every non-Corporate-HO Business Unit:
    - Ensure one Division with Name = BusinessUnit.Name.
    - Ensure one Department (under that Division) with Name = BusinessUnit.Name.
    - Sync IsActive with BusinessUnit.IsActive.
  - Backfill Users on non-Corporate-HO to mapped Division/Department.
*/

USE CSI;
GO

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @CorporateHO UNIQUEIDENTIFIER = '29760F29-B384-4FDB-B645-9471A3A4C932';

  ;WITH TargetBU AS (
    SELECT BusinessUnitId, Code, Name, IsActive
    FROM dbo.BusinessUnits
    WHERE BusinessUnitId <> @CorporateHO
  )
  INSERT INTO dbo.Divisions (DivisionId, BusinessUnitId, Code, Name, IsActive, CreatedAt)
  SELECT
    NEWID(),
    bu.BusinessUnitId,
    LEFT(CONCAT('DIVBU', REPLACE(CONVERT(VARCHAR(36), bu.BusinessUnitId), '-', '')), 20),
    bu.Name,
    bu.IsActive,
    GETDATE()
  FROM TargetBU bu
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.Divisions d
    WHERE d.BusinessUnitId = bu.BusinessUnitId
      AND d.Name = bu.Name
  );

  ;WITH TargetBU AS (
    SELECT BusinessUnitId, Name, IsActive
    FROM dbo.BusinessUnits
    WHERE BusinessUnitId <> @CorporateHO
  )
  UPDATE d
  SET d.IsActive = bu.IsActive,
      d.UpdatedAt = GETDATE()
  FROM dbo.Divisions d
  INNER JOIN TargetBU bu
    ON bu.BusinessUnitId = d.BusinessUnitId
   AND bu.Name = d.Name;

  ;WITH TargetBU AS (
    SELECT BusinessUnitId, Name, IsActive
    FROM dbo.BusinessUnits
    WHERE BusinessUnitId <> @CorporateHO
  ), MirrorDivision AS (
    SELECT bu.BusinessUnitId, bu.Name AS BUName, bu.IsActive AS BUActive, d.DivisionId
    FROM TargetBU bu
    INNER JOIN dbo.Divisions d
      ON d.BusinessUnitId = bu.BusinessUnitId
     AND d.Name = bu.Name
  )
  INSERT INTO dbo.Departments (DepartmentId, DivisionId, Code, Name, IsActive, CreatedAt)
  SELECT
    NEWID(),
    md.DivisionId,
    LEFT(CONCAT('DEPTBU', REPLACE(CONVERT(VARCHAR(36), md.BusinessUnitId), '-', '')), 20),
    md.BUName,
    md.BUActive,
    GETDATE()
  FROM MirrorDivision md
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.Departments dp
    WHERE dp.DivisionId = md.DivisionId
      AND dp.Name = md.BUName
  );

  ;WITH TargetBU AS (
    SELECT BusinessUnitId, Name, IsActive
    FROM dbo.BusinessUnits
    WHERE BusinessUnitId <> @CorporateHO
  ), MirrorDivision AS (
    SELECT bu.BusinessUnitId, bu.Name AS BUName, bu.IsActive AS BUActive, d.DivisionId
    FROM TargetBU bu
    INNER JOIN dbo.Divisions d
      ON d.BusinessUnitId = bu.BusinessUnitId
     AND d.Name = bu.Name
  )
  UPDATE dp
  SET dp.IsActive = md.BUActive,
      dp.UpdatedAt = GETDATE()
  FROM dbo.Departments dp
  INNER JOIN MirrorDivision md
    ON md.DivisionId = dp.DivisionId
   AND md.BUName = dp.Name;

  ;WITH MappedOrg AS (
    SELECT
      bu.BusinessUnitId,
      divpick.DivisionId,
      deppick.DepartmentId
    FROM dbo.BusinessUnits bu
    OUTER APPLY (
      SELECT TOP 1 d.DivisionId
      FROM dbo.Divisions d
      WHERE d.BusinessUnitId = bu.BusinessUnitId
        AND d.Name = bu.Name
      ORDER BY d.IsActive DESC, d.CreatedAt ASC
    ) divpick
    OUTER APPLY (
      SELECT TOP 1 dp.DepartmentId
      FROM dbo.Departments dp
      WHERE dp.DivisionId = divpick.DivisionId
        AND dp.Name = bu.Name
      ORDER BY dp.IsActive DESC, dp.CreatedAt ASC
    ) deppick
    WHERE bu.BusinessUnitId <> @CorporateHO
  )
  UPDATE u
  SET u.DivisionId = mo.DivisionId,
      u.DepartmentId = mo.DepartmentId,
      u.UpdatedAt = GETDATE()
  FROM dbo.Users u
  INNER JOIN MappedOrg mo
    ON mo.BusinessUnitId = u.BusinessUnitId
  WHERE mo.DivisionId IS NOT NULL
    AND mo.DepartmentId IS NOT NULL
    AND (
      ISNULL(CONVERT(VARCHAR(36), u.DivisionId), '') <> CONVERT(VARCHAR(36), mo.DivisionId)
      OR ISNULL(CONVERT(VARCHAR(36), u.DepartmentId), '') <> CONVERT(VARCHAR(36), mo.DepartmentId)
    );

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;

  THROW;
END CATCH;
GO
