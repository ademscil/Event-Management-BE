-- Migration 010: Add CurrentScore to Surveys
-- Description: Stores current/actual score for dashboard overview

USE CSI;
GO

IF COL_LENGTH('Surveys', 'CurrentScore') IS NULL
BEGIN
    ALTER TABLE Surveys
    ADD CurrentScore DECIMAL(5,2) NULL;

    PRINT 'Column CurrentScore added to Surveys';
END
GO

PRINT 'Migration 010 completed successfully';
GO
