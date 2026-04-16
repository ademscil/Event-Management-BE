-- Migration 027: Change BusinessUnits.Code to auto-increment integer
-- Description: Replace NVARCHAR Code with INT IDENTITY auto-increment

USE CSI;
GO

-- Step 1: Drop unique constraint on Code if exists
IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UQ__BusinessUnits__Code' AND object_id = OBJECT_ID('BusinessUnits')
)
BEGIN
  ALTER TABLE BusinessUnits DROP CONSTRAINT UQ__BusinessUnits__Code;
  PRINT 'Dropped unique constraint on BusinessUnits.Code';
END
GO

-- Drop index on Code if exists
IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_BusinessUnits_Code' AND object_id = OBJECT_ID('BusinessUnits')
)
BEGIN
  DROP INDEX IX_BusinessUnits_Code ON BusinessUnits;
  PRINT 'Dropped index IX_BusinessUnits_Code';
END
GO

-- Step 2: Drop the old Code column
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('BusinessUnits') AND name = 'Code'
)
BEGIN
  ALTER TABLE BusinessUnits DROP COLUMN Code;
  PRINT 'Dropped old Code column from BusinessUnits';
END
GO

-- Step 3: Add new Code column as INT IDENTITY auto-increment
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('BusinessUnits') AND name = 'Code'
)
BEGIN
  ALTER TABLE BusinessUnits ADD Code INT IDENTITY(1,1) NOT NULL;
  PRINT 'Added new Code column as INT IDENTITY(1,1)';
END
GO

-- Step 4: Add unique constraint on new Code
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UQ_BusinessUnits_Code' AND object_id = OBJECT_ID('BusinessUnits')
)
BEGIN
  ALTER TABLE BusinessUnits ADD CONSTRAINT UQ_BusinessUnits_Code UNIQUE (Code);
  PRINT 'Added unique constraint on new Code column';
END
GO

PRINT 'Migration 027 completed: BusinessUnits.Code is now INT IDENTITY auto-increment';
GO
