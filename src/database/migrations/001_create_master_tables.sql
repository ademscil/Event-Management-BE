-- Migration 001: Create Master Data Tables
-- Description: Creates Users, BusinessUnits, Divisions, Departments, Functions, and Applications tables

USE CSI;
GO

-- Users Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE Users (
        UserId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        Username NVARCHAR(50) NOT NULL UNIQUE,
        DisplayName NVARCHAR(200) NOT NULL,
        Email NVARCHAR(255) NOT NULL,
        Role NVARCHAR(50) NOT NULL CHECK (Role IN ('SuperAdmin', 'AdminEvent', 'ITLead', 'DepartmentHead')),
        UseLDAP BIT NOT NULL DEFAULT 1,
        PasswordHash NVARCHAR(255) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedAt DATETIME2 NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        CONSTRAINT CK_Users_Email CHECK (Email LIKE '%_@__%.__%'),
        CONSTRAINT CK_Users_Password CHECK (UseLDAP = 1 OR PasswordHash IS NOT NULL)
    );

    CREATE INDEX IX_Users_Username ON Users(Username);
    CREATE INDEX IX_Users_Email ON Users(Email);
    CREATE INDEX IX_Users_Role ON Users(Role);
    CREATE INDEX IX_Users_IsActive ON Users(IsActive);

    PRINT 'Users table created successfully';
END
GO

-- BusinessUnits Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BusinessUnits')
BEGIN
    CREATE TABLE BusinessUnits (
        BusinessUnitId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        Code NVARCHAR(20) NOT NULL UNIQUE,
        Name NVARCHAR(200) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedAt DATETIME2 NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        FOREIGN KEY (CreatedBy) REFERENCES Users(UserId),
        FOREIGN KEY (UpdatedBy) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_BusinessUnits_Code ON BusinessUnits(Code);
    CREATE INDEX IX_BusinessUnits_IsActive ON BusinessUnits(IsActive);

    PRINT 'BusinessUnits table created successfully';
END
GO

-- Divisions Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Divisions')
BEGIN
    CREATE TABLE Divisions (
        DivisionId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        BusinessUnitId UNIQUEIDENTIFIER NOT NULL,
        Code NVARCHAR(20) NOT NULL UNIQUE,
        Name NVARCHAR(200) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedAt DATETIME2 NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        FOREIGN KEY (BusinessUnitId) REFERENCES BusinessUnits(BusinessUnitId),
        FOREIGN KEY (CreatedBy) REFERENCES Users(UserId),
        FOREIGN KEY (UpdatedBy) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_Divisions_BusinessUnitId ON Divisions(BusinessUnitId);
    CREATE INDEX IX_Divisions_Code ON Divisions(Code);
    CREATE INDEX IX_Divisions_IsActive ON Divisions(IsActive);

    PRINT 'Divisions table created successfully';
END
GO

-- Departments Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Departments')
BEGIN
    CREATE TABLE Departments (
        DepartmentId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        DivisionId UNIQUEIDENTIFIER NOT NULL,
        Code NVARCHAR(20) NOT NULL UNIQUE,
        Name NVARCHAR(200) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedAt DATETIME2 NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        FOREIGN KEY (DivisionId) REFERENCES Divisions(DivisionId),
        FOREIGN KEY (CreatedBy) REFERENCES Users(UserId),
        FOREIGN KEY (UpdatedBy) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_Departments_DivisionId ON Departments(DivisionId);
    CREATE INDEX IX_Departments_Code ON Departments(Code);
    CREATE INDEX IX_Departments_IsActive ON Departments(IsActive);

    PRINT 'Departments table created successfully';
END
GO

-- Functions Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Functions')
BEGIN
    CREATE TABLE Functions (
        FunctionId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        Code NVARCHAR(20) NOT NULL UNIQUE,
        Name NVARCHAR(200) NOT NULL,
        ITDeptHeadUserId UNIQUEIDENTIFIER NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedAt DATETIME2 NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        FOREIGN KEY (ITDeptHeadUserId) REFERENCES Users(UserId),
        FOREIGN KEY (CreatedBy) REFERENCES Users(UserId),
        FOREIGN KEY (UpdatedBy) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_Functions_Code ON Functions(Code);
    CREATE INDEX IX_Functions_ITDeptHeadUserId ON Functions(ITDeptHeadUserId);
    CREATE INDEX IX_Functions_IsActive ON Functions(IsActive);

    PRINT 'Functions table created successfully';
END
GO

-- Applications Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Applications')
BEGIN
    CREATE TABLE Applications (
        ApplicationId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        Code NVARCHAR(20) NOT NULL UNIQUE,
        Name NVARCHAR(200) NOT NULL,
        Description NVARCHAR(500) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedAt DATETIME2 NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        FOREIGN KEY (CreatedBy) REFERENCES Users(UserId),
        FOREIGN KEY (UpdatedBy) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_Applications_Code ON Applications(Code);
    CREATE INDEX IX_Applications_IsActive ON Applications(IsActive);

    PRINT 'Applications table created successfully';
END
GO

PRINT 'Migration 001 completed successfully';
GO
