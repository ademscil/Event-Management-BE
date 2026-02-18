/*
  Migration 013:
  Set Users.BusinessUnitId to Corporate HO for existing records.
*/

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @CorporateHOBusinessUnitId UNIQUEIDENTIFIER = '29760F29-B384-4FDB-B645-9471A3A4C932';

  IF COL_LENGTH('dbo.Users', 'BusinessUnitId') IS NULL
  BEGIN
    THROW 50001, 'Users.BusinessUnitId column does not exist. Run migration 012 first.', 1;
  END

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.BusinessUnits
    WHERE BusinessUnitId = @CorporateHOBusinessUnitId
  )
  BEGIN
    THROW 50002, 'Corporate HO BusinessUnitId not found in dbo.BusinessUnits.', 1;
  END

  UPDATE dbo.Users
  SET BusinessUnitId = @CorporateHOBusinessUnitId,
      UpdatedAt = GETDATE()
  WHERE BusinessUnitId IS NULL
     OR BusinessUnitId <> @CorporateHOBusinessUnitId;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;

