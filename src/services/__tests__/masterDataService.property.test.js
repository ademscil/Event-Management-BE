const fc = require('fast-check');
const { MasterDataService, ValidationError } = require('../masterDataService');
const db = require('../../database/connection');

describe('Property Tests - Master Data Service', () => {
  let service;

  beforeAll(async () => {
    service = new MasterDataService();
    // Ensure database connection is established
    await db.getPool();
  });

  afterAll(async () => {
    await db.close();
  });

  describe('Property 9: Hierarchical Integrity', () => {
    /**
     * Property 9: Hierarchical Integrity
     * For any organizational hierarchy, a Division must have a valid parent Business Unit,
     * and a Department must have a valid parent Division, with orphaned records prevented.
     * Validates: Requirements 3.2, 3.3, 3.8
     */
    
    test('Division creation should fail with non-existent Business Unit', async () => {
      // Feature: csi-portal, Property 9: Hierarchical Integrity
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            code: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
            name: fc.string({ minLength: 1, maxLength: 200 }),
            businessUnitId: fc.uuid()
          }),
          async (divisionData) => {
            // Try to create division with non-existent business unit
            try {
              await service.createDivision(divisionData);
              // If no error thrown, the test fails
              return false;
            } catch (error) {
              // Should throw ValidationError for non-existent parent
              return error.name === 'ValidationError' && 
                     error.message.includes('Business Unit');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);

    test('Department creation should fail with non-existent Division', async () => {
      // Feature: csi-portal, Property 9: Hierarchical Integrity
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            code: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
            name: fc.string({ minLength: 1, maxLength: 200 }),
            divisionId: fc.uuid()
          }),
          async (departmentData) => {
            // Try to create department with non-existent division
            try {
              await service.createDepartment(departmentData);
              // If no error thrown, the test fails
              return false;
            } catch (error) {
              // Should throw ValidationError for non-existent parent
              return error.name === 'ValidationError' && 
                     error.message.includes('Division');
            }
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);

    test('Valid hierarchy creation should succeed and maintain integrity', async () => {
      // Feature: csi-portal, Property 9: Hierarchical Integrity
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            buCode: fc.string({ minLength: 1, maxLength: 5 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
            buName: fc.string({ minLength: 1, maxLength: 150 }),
            divCode: fc.string({ minLength: 1, maxLength: 5 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
            divName: fc.string({ minLength: 1, maxLength: 150 }),
            deptCode: fc.string({ minLength: 1, maxLength: 5 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
            deptName: fc.string({ minLength: 1, maxLength: 150 })
          }),
          async (data) => {
            // Add timestamp to ensure uniqueness (limit to 13 chars to stay under 20 total)
            const timestamp = Date.now();
            const uniqueBuCode = `${data.buCode}-${timestamp}`.substring(0, 20);
            const uniqueDivCode = `${data.divCode}-${timestamp}`.substring(0, 20);
            const uniqueDeptCode = `${data.deptCode}-${timestamp}`.substring(0, 20);

            try {
              // Create Business Unit
              const bu = await service.createBusinessUnit({
                code: uniqueBuCode,
                name: data.buName
              });

              // Create Division with valid Business Unit
              const division = await service.createDivision({
                businessUnitId: bu.BusinessUnitId,
                code: uniqueDivCode,
                name: data.divName
              });

              // Create Department with valid Division
              const department = await service.createDepartment({
                divisionId: division.DivisionId,
                code: uniqueDeptCode,
                name: data.deptName
              });

              // Verify the complete hierarchy
              const hierarchy = await service.verifyDepartmentHierarchy(department.DepartmentId);

              // Check that all relationships are correct
              const hierarchyValid = 
                hierarchy.DepartmentId === department.DepartmentId &&
                hierarchy.DivisionId === division.DivisionId &&
                hierarchy.BusinessUnitId === bu.BusinessUnitId;

              // Cleanup - delete in reverse order
              const pool = await db.getPool();
              await pool.request()
                .input('deptId', department.DepartmentId)
                .query('DELETE FROM Departments WHERE DepartmentId = @deptId');
              
              await pool.request()
                .input('divId', division.DivisionId)
                .query('DELETE FROM Divisions WHERE DivisionId = @divId');
              
              await pool.request()
                .input('buId', bu.BusinessUnitId)
                .query('DELETE FROM BusinessUnits WHERE BusinessUnitId = @buId');

              return hierarchyValid;
            } catch (error) {
              // If any error occurs during valid hierarchy creation, test fails
              console.error('Unexpected error in valid hierarchy test:', error.message);
              return false;
            }
          }
        ),
        { numRuns: 5 }
      );
    }, 60000);

    test('Division with inactive Business Unit should be rejected', async () => {
      // Feature: csi-portal, Property 9: Hierarchical Integrity
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            buCode: fc.string({ minLength: 1, maxLength: 5 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
            buName: fc.string({ minLength: 1, maxLength: 150 }),
            divCode: fc.string({ minLength: 1, maxLength: 5 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
            divName: fc.string({ minLength: 1, maxLength: 150 })
          }),
          async (data) => {
            const timestamp = Date.now();
            const uniqueBuCode = `${data.buCode}-${timestamp}`.substring(0, 20);
            const uniqueDivCode = `${data.divCode}-${timestamp}`.substring(0, 20);

            try {
              // Create Business Unit
              const bu = await service.createBusinessUnit({
                code: uniqueBuCode,
                name: data.buName
              });

              // Mark Business Unit as inactive
              const pool = await db.getPool();
              await pool.request()
                .input('buId', bu.BusinessUnitId)
                .query('UPDATE BusinessUnits SET IsActive = 0 WHERE BusinessUnitId = @buId');

              // Try to create Division with inactive Business Unit
              let validationFailed = false;
              try {
                await service.createDivision({
                  businessUnitId: bu.BusinessUnitId,
                  code: uniqueDivCode,
                  name: data.divName
                });
              } catch (error) {
                validationFailed = error.name === 'ValidationError' && 
                                  error.message.includes('inactive');
              }

              // Cleanup
              await pool.request()
                .input('buId', bu.BusinessUnitId)
                .query('DELETE FROM BusinessUnits WHERE BusinessUnitId = @buId');

              return validationFailed;
            } catch (error) {
              console.error('Unexpected error in inactive parent test:', error.message);
              return false;
            }
          }
        ),
        { numRuns: 5 }
      );
    }, 60000);

    test('Department with inactive Division should be rejected', async () => {
      // Feature: csi-portal, Property 9: Hierarchical Integrity
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            buCode: fc.string({ minLength: 1, maxLength: 5 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
            buName: fc.string({ minLength: 1, maxLength: 150 }),
            divCode: fc.string({ minLength: 1, maxLength: 5 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
            divName: fc.string({ minLength: 1, maxLength: 150 }),
            deptCode: fc.string({ minLength: 1, maxLength: 5 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
            deptName: fc.string({ minLength: 1, maxLength: 150 })
          }),
          async (data) => {
            const timestamp = Date.now();
            const uniqueBuCode = `${data.buCode}-${timestamp}`.substring(0, 20);
            const uniqueDivCode = `${data.divCode}-${timestamp}`.substring(0, 20);
            const uniqueDeptCode = `${data.deptCode}-${timestamp}`.substring(0, 20);

            try {
              // Create Business Unit
              const bu = await service.createBusinessUnit({
                code: uniqueBuCode,
                name: data.buName
              });

              // Create Division
              const division = await service.createDivision({
                businessUnitId: bu.BusinessUnitId,
                code: uniqueDivCode,
                name: data.divName
              });

              // Mark Division as inactive
              const pool = await db.getPool();
              await pool.request()
                .input('divId', division.DivisionId)
                .query('UPDATE Divisions SET IsActive = 0 WHERE DivisionId = @divId');

              // Try to create Department with inactive Division
              let validationFailed = false;
              try {
                await service.createDepartment({
                  divisionId: division.DivisionId,
                  code: uniqueDeptCode,
                  name: data.deptName
                });
              } catch (error) {
                validationFailed = error.name === 'ValidationError' && 
                                  error.message.includes('inactive');
              }

              // Cleanup
              await pool.request()
                .input('divId', division.DivisionId)
                .query('DELETE FROM Divisions WHERE DivisionId = @divId');
              
              await pool.request()
                .input('buId', bu.BusinessUnitId)
                .query('DELETE FROM BusinessUnits WHERE BusinessUnitId = @buId');

              return validationFailed;
            } catch (error) {
              console.error('Unexpected error in inactive division test:', error.message);
              return false;
            }
          }
        ),
        { numRuns: 5 }
      );
    }, 60000);
  });
});
