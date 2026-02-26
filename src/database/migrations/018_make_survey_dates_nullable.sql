-- Migration 018: Make Survey StartDate and EndDate Nullable
-- Description: Allow StartDate and EndDate to be NULL for draft surveys

USE CSI;
GO

-- Drop the existing date constraint from Events table
IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_Surveys_Dates' AND parent_object_id = OBJECT_ID('Events'))
BEGIN
    ALTER TABLE Events DROP CONSTRAINT CK_Surveys_Dates;
    PRINT 'Dropped constraint CK_Surveys_Dates from Events table';
END
GO

-- Alter StartDate to allow NULL
ALTER TABLE Events ALTER COLUMN StartDate DATETIME2 NULL;
PRINT 'StartDate column altered to allow NULL';
GO

-- Alter EndDate to allow NULL
ALTER TABLE Events ALTER COLUMN EndDate DATETIME2 NULL;
PRINT 'EndDate column altered to allow NULL';
GO

-- Add new constraint that only checks if both dates exist
ALTER TABLE Events ADD CONSTRAINT CK_Surveys_Dates 
    CHECK (StartDate IS NULL OR EndDate IS NULL OR EndDate > StartDate);
PRINT 'Added new constraint CK_Surveys_Dates (allows NULL)';
GO

PRINT 'Migration 018 completed successfully';
GO
