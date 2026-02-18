-- Migration 008: Add Signature Question Type
-- Description: Adds 'Signature' to the allowed question types in Questions table

USE CSI;
GO

-- Drop the existing CHECK constraint on Type column
IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK__Questions__Type__*' AND parent_object_id = OBJECT_ID('Questions'))
BEGIN
    DECLARE @ConstraintName NVARCHAR(200);
    SELECT @ConstraintName = name 
    FROM sys.check_constraints 
    WHERE parent_object_id = OBJECT_ID('Questions') 
    AND definition LIKE '%Type%';
    
    IF @ConstraintName IS NOT NULL
    BEGIN
        DECLARE @SQL NVARCHAR(MAX) = 'ALTER TABLE Questions DROP CONSTRAINT ' + @ConstraintName;
        EXEC sp_executesql @SQL;
        PRINT 'Dropped existing Type CHECK constraint';
    END
END
GO

-- Add new CHECK constraint with Signature type included
ALTER TABLE Questions
ADD CONSTRAINT CK_Questions_Type CHECK (Type IN ('HeroCover', 'Text', 'MultipleChoice', 'Checkbox', 'Dropdown', 'MatrixLikert', 'Rating', 'Date', 'Signature'));
GO

PRINT 'Migration 008 completed successfully - Signature question type added';
GO
