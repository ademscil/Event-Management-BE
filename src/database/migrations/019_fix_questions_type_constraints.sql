-- Migration: 019_fix_questions_type_constraints.sql
-- Description: Ensure only one valid Questions.Type constraint exists (including Signature)

SET NOCOUNT ON;

DECLARE @constraintName NVARCHAR(128);
DECLARE @dropSql NVARCHAR(MAX);

DECLARE constraint_cursor CURSOR FOR
SELECT cc.name
FROM sys.check_constraints cc
INNER JOIN sys.objects o ON cc.parent_object_id = o.object_id
WHERE o.name = 'Questions'
  AND cc.definition LIKE '%[[]Type]%'
  AND cc.name <> 'CK_Questions_Type';

OPEN constraint_cursor;
FETCH NEXT FROM constraint_cursor INTO @constraintName;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @dropSql = N'ALTER TABLE Questions DROP CONSTRAINT ' + QUOTENAME(@constraintName) + ';';
    EXEC sp_executesql @dropSql;
    PRINT 'Dropped legacy constraint: ' + @constraintName;
    FETCH NEXT FROM constraint_cursor INTO @constraintName;
END

CLOSE constraint_cursor;
DEALLOCATE constraint_cursor;

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('Questions')
      AND name = 'CK_Questions_Type'
)
BEGIN
    ALTER TABLE Questions DROP CONSTRAINT CK_Questions_Type;
    PRINT 'Dropped existing CK_Questions_Type';
END

ALTER TABLE Questions
ADD CONSTRAINT CK_Questions_Type
CHECK (Type IN (
    'HeroCover',
    'Text',
    'MultipleChoice',
    'Checkbox',
    'Dropdown',
    'MatrixLikert',
    'Rating',
    'Date',
    'Signature'
));

PRINT 'Created canonical CK_Questions_Type constraint';
