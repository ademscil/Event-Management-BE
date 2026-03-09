/*
  Migration: Add user phone number and password reset token support
  Purpose:
  - Store normalized phone number for local-user password recovery
  - Store one-time password reset tokens with expiry and audit metadata
*/

IF COL_LENGTH('Users', 'PhoneNumber') IS NULL
BEGIN
    ALTER TABLE Users
    ADD PhoneNumber NVARCHAR(30) NULL;
END;

GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Users_PhoneNumber'
      AND object_id = OBJECT_ID('Users')
)
BEGIN
    CREATE INDEX IX_Users_PhoneNumber ON Users(PhoneNumber);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_Users_PhoneNumber_NotNull'
      AND object_id = OBJECT_ID('Users')
)
BEGIN
    CREATE UNIQUE INDEX UX_Users_PhoneNumber_NotNull
    ON Users(PhoneNumber)
    WHERE PhoneNumber IS NOT NULL AND PhoneNumber <> '';
END;

GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PasswordResetTokens')
BEGIN
    CREATE TABLE PasswordResetTokens (
        PasswordResetTokenId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        UserId UNIQUEIDENTIFIER NOT NULL,
        TokenHash NVARCHAR(128) NOT NULL,
        RequestedByMethod NVARCHAR(20) NOT NULL,
        RequestedTo NVARCHAR(255) NOT NULL,
        ExpiresAt DATETIME2 NOT NULL,
        UsedAt DATETIME2 NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedByIp NVARCHAR(64) NULL,
        FOREIGN KEY (UserId) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_PasswordResetTokens_UserId ON PasswordResetTokens(UserId);
    CREATE INDEX IX_PasswordResetTokens_ExpiresAt ON PasswordResetTokens(ExpiresAt);
    CREATE INDEX IX_PasswordResetTokens_TokenHash ON PasswordResetTokens(TokenHash);
END;
