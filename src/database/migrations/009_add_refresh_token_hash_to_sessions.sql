-- Migration 009: Add RefreshTokenHash column to Sessions table
-- Description: Store hashed refresh token for server-side refresh token revocation/rotation

USE CSI;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Sessions') AND name = 'RefreshTokenHash')
BEGIN
    ALTER TABLE Sessions ADD RefreshTokenHash NVARCHAR(255) NULL;
    PRINT 'RefreshTokenHash column added to Sessions table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('Sessions') AND name = 'IX_Sessions_RefreshTokenHash')
BEGIN
    CREATE INDEX IX_Sessions_RefreshTokenHash ON Sessions(RefreshTokenHash);
    PRINT 'Index IX_Sessions_RefreshTokenHash created';
END
GO

PRINT 'Migration 009 completed successfully';
GO
