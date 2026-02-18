-- Add NPK column to Users and backfill key records
IF COL_LENGTH('Users', 'NPK') IS NULL
BEGIN
    ALTER TABLE Users
    ADD NPK NVARCHAR(50) NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Users_NPK'
      AND object_id = OBJECT_ID('Users')
)
BEGIN
    CREATE INDEX IX_Users_NPK ON Users(NPK);
END;

DECLARE @sql NVARCHAR(MAX);

-- Keep existing numeric usernames as NPK if not set yet
SET @sql = N'
UPDATE Users
SET NPK = Username
WHERE (NPK IS NULL OR LTRIM(RTRIM(NPK)) = '''')
  AND Username NOT LIKE ''%[^0-9]%'';
';
EXEC sp_executesql @sql;

-- Explicitly set superadmin NPK
SET @sql = N'
UPDATE Users
SET NPK = ''0676''
WHERE Username = ''superadmin''
  AND (NPK IS NULL OR LTRIM(RTRIM(NPK)) = '''');
';
EXEC sp_executesql @sql;
