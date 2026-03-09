/*
  Migration: Allow nullable respondent email for public survey submissions
  Purpose:
  - Do not force respondent email metadata when builder does not provide email question
  - Keep existing response records intact while allowing future submissions without email
*/

USE CSI;
GO

IF COL_LENGTH('Responses', 'RespondentEmail') IS NOT NULL
BEGIN
    ALTER TABLE Responses ALTER COLUMN RespondentEmail NVARCHAR(255) NULL;
END
GO
