-- Migration 003: Create Survey and Response Tables
-- Description: Creates Surveys, SurveyConfiguration, Questions, Responses, and QuestionResponses tables

USE CSI;
GO

-- Surveys Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Surveys')
BEGIN
    CREATE TABLE Surveys (
        SurveyId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        Title NVARCHAR(500) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        StartDate DATETIME2 NOT NULL,
        EndDate DATETIME2 NOT NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT 'Draft' CHECK (Status IN ('Draft', 'Active', 'Closed', 'Archived')),
        AssignedAdminId UNIQUEIDENTIFIER NULL,
        TargetRespondents INT NULL,
        TargetScore DECIMAL(5,2) NULL,
        SurveyLink NVARCHAR(500) NULL,
        ShortenedLink NVARCHAR(500) NULL,
        QRCodeDataUrl NVARCHAR(MAX) NULL,
        EmbedCode NVARCHAR(MAX) NULL,
        DuplicatePreventionEnabled BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedAt DATETIME2 NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        FOREIGN KEY (AssignedAdminId) REFERENCES Users(UserId),
        FOREIGN KEY (CreatedBy) REFERENCES Users(UserId),
        FOREIGN KEY (UpdatedBy) REFERENCES Users(UserId),
        CONSTRAINT CK_Surveys_Dates CHECK (EndDate > StartDate)
    );

    CREATE INDEX IX_Surveys_Status ON Surveys(Status);
    CREATE INDEX IX_Surveys_StartDate ON Surveys(StartDate);
    CREATE INDEX IX_Surveys_EndDate ON Surveys(EndDate);
    CREATE INDEX IX_Surveys_AssignedAdminId ON Surveys(AssignedAdminId);

    PRINT 'Surveys table created successfully';
END
GO

-- SurveyConfiguration Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SurveyConfiguration')
BEGIN
    CREATE TABLE SurveyConfiguration (
        ConfigId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        SurveyId UNIQUEIDENTIFIER NOT NULL UNIQUE,
        HeroTitle NVARCHAR(500) NULL,
        HeroSubtitle NVARCHAR(500) NULL,
        HeroImageUrl NVARCHAR(500) NULL,
        LogoUrl NVARCHAR(500) NULL,
        BackgroundColor NVARCHAR(50) NULL,
        BackgroundImageUrl NVARCHAR(500) NULL,
        PrimaryColor NVARCHAR(50) NULL,
        SecondaryColor NVARCHAR(50) NULL,
        FontFamily NVARCHAR(100) NULL,
        ButtonStyle NVARCHAR(50) NULL,
        ShowProgressBar BIT NOT NULL DEFAULT 1,
        ShowPageNumbers BIT NOT NULL DEFAULT 1,
        MultiPage BIT NOT NULL DEFAULT 0,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2 NULL,
        FOREIGN KEY (SurveyId) REFERENCES Surveys(SurveyId) ON DELETE CASCADE
    );

    CREATE INDEX IX_SurveyConfiguration_SurveyId ON SurveyConfiguration(SurveyId);

    PRINT 'SurveyConfiguration table created successfully';
END
GO

-- Questions Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Questions')
BEGIN
    CREATE TABLE Questions (
        QuestionId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        SurveyId UNIQUEIDENTIFIER NOT NULL,
        Type NVARCHAR(50) NOT NULL CHECK (Type IN ('HeroCover', 'Text', 'MultipleChoice', 'Checkbox', 'Dropdown', 'MatrixLikert', 'Rating', 'Date')),
        PromptText NVARCHAR(MAX) NOT NULL,
        Subtitle NVARCHAR(500) NULL,
        ImageUrl NVARCHAR(500) NULL,
        IsMandatory BIT NOT NULL DEFAULT 0,
        DisplayOrder INT NOT NULL,
        PageNumber INT NOT NULL DEFAULT 1,
        LayoutOrientation NVARCHAR(20) NULL CHECK (LayoutOrientation IN ('vertical', 'horizontal', NULL)),
        Options NVARCHAR(MAX) NULL, -- JSON format
        CommentRequiredBelowRating INT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy UNIQUEIDENTIFIER NULL,
        UpdatedAt DATETIME2 NULL,
        UpdatedBy UNIQUEIDENTIFIER NULL,
        FOREIGN KEY (SurveyId) REFERENCES Surveys(SurveyId) ON DELETE CASCADE,
        FOREIGN KEY (CreatedBy) REFERENCES Users(UserId),
        FOREIGN KEY (UpdatedBy) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_Questions_SurveyId ON Questions(SurveyId);
    CREATE INDEX IX_Questions_DisplayOrder ON Questions(DisplayOrder);
    CREATE INDEX IX_Questions_PageNumber ON Questions(PageNumber);

    PRINT 'Questions table created successfully';
END
GO

-- Responses Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Responses')
BEGIN
    CREATE TABLE Responses (
        ResponseId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        SurveyId UNIQUEIDENTIFIER NOT NULL,
        RespondentEmail NVARCHAR(255) NOT NULL,
        RespondentName NVARCHAR(200) NOT NULL,
        BusinessUnitId UNIQUEIDENTIFIER NOT NULL,
        DivisionId UNIQUEIDENTIFIER NOT NULL,
        DepartmentId UNIQUEIDENTIFIER NOT NULL,
        ApplicationId UNIQUEIDENTIFIER NOT NULL,
        IPAddress NVARCHAR(50) NULL,
        SubmittedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (SurveyId) REFERENCES Surveys(SurveyId),
        FOREIGN KEY (BusinessUnitId) REFERENCES BusinessUnits(BusinessUnitId),
        FOREIGN KEY (DivisionId) REFERENCES Divisions(DivisionId),
        FOREIGN KEY (DepartmentId) REFERENCES Departments(DepartmentId),
        FOREIGN KEY (ApplicationId) REFERENCES Applications(ApplicationId)
    );

    CREATE INDEX IX_Responses_SurveyId ON Responses(SurveyId);
    CREATE INDEX IX_Responses_RespondentEmail ON Responses(RespondentEmail);
    CREATE INDEX IX_Responses_ApplicationId ON Responses(ApplicationId);
    CREATE INDEX IX_Responses_DepartmentId ON Responses(DepartmentId);
    CREATE INDEX IX_Responses_SubmittedAt ON Responses(SubmittedAt);

    PRINT 'Responses table created successfully';
END
GO

-- QuestionResponses Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'QuestionResponses')
BEGIN
    CREATE TABLE QuestionResponses (
        QuestionResponseId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        ResponseId UNIQUEIDENTIFIER NOT NULL,
        QuestionId UNIQUEIDENTIFIER NOT NULL,
        TextValue NVARCHAR(MAX) NULL,
        NumericValue DECIMAL(10,2) NULL,
        DateValue DATETIME2 NULL,
        MatrixValues NVARCHAR(MAX) NULL, -- JSON format
        CommentValue NVARCHAR(MAX) NULL,
        TakeoutStatus NVARCHAR(50) NOT NULL DEFAULT 'Active' CHECK (TakeoutStatus IN ('Active', 'ProposedTakeout', 'TakenOut', 'Rejected')),
        TakeoutReason NVARCHAR(MAX) NULL,
        ProposedBy UNIQUEIDENTIFIER NULL,
        ProposedAt DATETIME2 NULL,
        ReviewedBy UNIQUEIDENTIFIER NULL,
        ReviewedAt DATETIME2 NULL,
        IsBestComment BIT NOT NULL DEFAULT 0,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (ResponseId) REFERENCES Responses(ResponseId) ON DELETE CASCADE,
        FOREIGN KEY (QuestionId) REFERENCES Questions(QuestionId),
        FOREIGN KEY (ProposedBy) REFERENCES Users(UserId),
        FOREIGN KEY (ReviewedBy) REFERENCES Users(UserId)
    );

    CREATE INDEX IX_QuestionResponses_ResponseId ON QuestionResponses(ResponseId);
    CREATE INDEX IX_QuestionResponses_QuestionId ON QuestionResponses(QuestionId);
    CREATE INDEX IX_QuestionResponses_TakeoutStatus ON QuestionResponses(TakeoutStatus);
    CREATE INDEX IX_QuestionResponses_IsBestComment ON QuestionResponses(IsBestComment);

    PRINT 'QuestionResponses table created successfully';
END
GO

PRINT 'Migration 003 completed successfully';
GO
