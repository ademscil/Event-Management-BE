-- Migration 002: Create Mapping Tables
-- Description: Creates FunctionApplicationMappings and ApplicationDepartmentMappings tables

USE CSI;
GO

-- FunctionApplicationMappings Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FunctionApplicationMappings')
BEGIN
    CREATE TABLE FunctionApplicationMappings (
        MappingId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        FunctionId UNIQUEIDENTIFIER NOT NULL,
        ApplicationId UNIQUEIDENTIFIER NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        FOREIGN KEY (FunctionId) REFERENCES Functions(FunctionId) ON DELETE CASCADE,
        FOREIGN KEY (ApplicationId) REFERENCES Applications(ApplicationId) ON DELETE CASCADE,
        FOREIGN KEY (CreatedBy) REFERENCES Users(UserId),
        CONSTRAINT UQ_FunctionApplication UNIQUE (FunctionId, ApplicationId)
    );

    CREATE INDEX IX_FunctionApplicationMappings_FunctionId ON FunctionApplicationMappings(FunctionId);
    CREATE INDEX IX_FunctionApplicationMappings_ApplicationId ON FunctionApplicationMappings(ApplicationId);

    PRINT 'FunctionApplicationMappings table created successfully';
END
GO

-- ApplicationDepartmentMappings Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ApplicationDepartmentMappings')
BEGIN
    CREATE TABLE ApplicationDepartmentMappings (
        MappingId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        ApplicationId UNIQUEIDENTIFIER NOT NULL,
        DepartmentId UNIQUEIDENTIFIER NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        FOREIGN KEY (ApplicationId) REFERENCES Applications(ApplicationId) ON DELETE CASCADE,
        FOREIGN KEY (DepartmentId) REFERENCES Departments(DepartmentId) ON DELETE CASCADE,
        FOREIGN KEY (CreatedBy) REFERENCES Users(UserId),
        CONSTRAINT UQ_ApplicationDepartment UNIQUE (ApplicationId, DepartmentId)
    );

    CREATE INDEX IX_ApplicationDepartmentMappings_ApplicationId ON ApplicationDepartmentMappings(ApplicationId);
    CREATE INDEX IX_ApplicationDepartmentMappings_DepartmentId ON ApplicationDepartmentMappings(DepartmentId);

    PRINT 'ApplicationDepartmentMappings table created successfully';
END
GO

PRINT 'Migration 002 completed successfully';
GO
