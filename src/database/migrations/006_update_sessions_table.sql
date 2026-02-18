-- Migration 006: Update Sessions Table
-- Description: Add LastActivity, MaxExpiresAt, and InvalidatedAt columns to Sessions table

USE CSI;
GO

-- Add LastActivity column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Sessions') AND name = 'LastActivity')
BEGIN
    ALTER TABLE Sessions ADD LastActivity DATETIME2 NOT NULL DEFAULT GETDATE();
    PRINT 'LastActivity column added to Sessions table';
END
GO

-- Add MaxExpiresAt column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Sessions') AND name = 'MaxExpiresAt')
BEGIN
    ALTER TABLE Sessions ADD MaxExpiresAt DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 8, GETDATE());
    PRINT 'MaxExpiresAt column added to Sessions table';
END
GO

-- Add InvalidatedAt column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Sessions') AND name = 'InvalidatedAt')
BEGIN
    ALTER TABLE Sessions ADD InvalidatedAt DATETIME2 NULL;
    PRINT 'InvalidatedAt column added to Sessions table';
END
GO

-- Rename LastActivityAt to LastActivity if it exists and LastActivity doesn't exist
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Sessions') AND name = 'LastActivityAt')
   AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Sessions') AND name = 'LastActivity')
BEGIN
    EXEC sp_rename 'Sessions.LastActivityAt', 'LastActivity', 'COLUMN';
    PRINT 'LastActivityAt column renamed to LastActivity';
END
ELSE IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Sessions') AND name = 'LastActivityAt')
BEGIN
    -- Drop the default constraint first
    DECLARE @ConstraintName NVARCHAR(200);
    SELECT @ConstraintName = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
    WHERE c.object_id = OBJECT_ID('Sessions') AND c.name = 'LastActivityAt';
    
    IF @ConstraintName IS NOT NULL
    BEGIN
        EXEC('ALTER TABLE Sessions DROP CONSTRAINT ' + @ConstraintName);
        PRINT 'Dropped default constraint on LastActivityAt';
    END
    
    -- Now drop the old column if both exist
    ALTER TABLE Sessions DROP COLUMN LastActivityAt;
    PRINT 'Dropped duplicate LastActivityAt column';
END
GO

-- Create index on LastActivity if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('Sessions') AND name = 'IX_Sessions_LastActivity')
BEGIN
    CREATE INDEX IX_Sessions_LastActivity ON Sessions(LastActivity);
    PRINT 'Index IX_Sessions_LastActivity created';
END
GO

-- Create index on MaxExpiresAt if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('Sessions') AND name = 'IX_Sessions_MaxExpiresAt')
BEGIN
    CREATE INDEX IX_Sessions_MaxExpiresAt ON Sessions(MaxExpiresAt);
    PRINT 'Index IX_Sessions_MaxExpiresAt created';
END
GO

PRINT 'Migration 006 completed successfully';
GO
