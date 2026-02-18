-- Migration: Create SAP Sync Logs Table
-- Description: Table for tracking SAP synchronization results and history

-- Create SAPSyncLogs table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SAPSyncLogs')
BEGIN
    CREATE TABLE SAPSyncLogs (
        SyncLogId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        SyncType NVARCHAR(50) NOT NULL, -- 'OrganizationalData', 'BusinessUnits', 'Divisions', 'Departments'
        Status NVARCHAR(50) NOT NULL, -- 'Success', 'Failed', 'Completed with errors'
        StartTime DATETIME NOT NULL,
        EndTime DATETIME NOT NULL,
        RecordsProcessed INT NOT NULL DEFAULT 0,
        RecordsAdded INT NOT NULL DEFAULT 0,
        RecordsUpdated INT NOT NULL DEFAULT 0,
        RecordsDeactivated INT NOT NULL DEFAULT 0,
        ErrorCount INT NOT NULL DEFAULT 0,
        ErrorLog NVARCHAR(MAX) NULL,
        Details NVARCHAR(MAX) NULL, -- JSON with detailed statistics
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );

    -- Create index on CreatedAt for efficient history queries
    CREATE INDEX IX_SAPSyncLogs_CreatedAt ON SAPSyncLogs(CreatedAt DESC);

    -- Create index on SyncType for filtering
    CREATE INDEX IX_SAPSyncLogs_SyncType ON SAPSyncLogs(SyncType);

    PRINT 'SAPSyncLogs table created successfully';
END
ELSE
BEGIN
    PRINT 'SAPSyncLogs table already exists';
END
GO
