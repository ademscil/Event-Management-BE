/*
  Migration 023: Rename misleading Functions ownership column
  - Rename Functions.ITDeptHeadUserId -> ITLeadUserId
  - Rename related index to keep schema naming consistent
*/

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.Functions', N'U') IS NOT NULL
  BEGIN
    IF COL_LENGTH('dbo.Functions', 'ITDeptHeadUserId') IS NOT NULL
       AND COL_LENGTH('dbo.Functions', 'ITLeadUserId') IS NULL
    BEGIN
      EXEC sp_rename N'dbo.Functions.ITDeptHeadUserId', N'ITLeadUserId', N'COLUMN';
    END;

    IF EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.Functions')
        AND name = N'IX_Functions_ITDeptHeadUserId'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.Functions')
        AND name = N'IX_Functions_ITLeadUserId'
    )
    BEGIN
      EXEC sp_rename
        N'dbo.Functions.IX_Functions_ITDeptHeadUserId',
        N'IX_Functions_ITLeadUserId',
        N'INDEX';
    END;
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;

  THROW;
END CATCH;
