const bcrypt = require("bcrypt");
const db = require("../src/database/connection");
const { sql } = require("../src/database/connection");

const MOCKUP_BUSINESS_UNITS = [
  { code: "HO", name: "Corporate HO", isActive: true },
  { code: "MD01", name: "Main Dealer Jakarta", isActive: true },
  { code: "MD02", name: "Main Dealer Bandung", isActive: false },
];

const MOCKUP_DIVISIONS = [
  { code: "ITD", name: "IT Digital", buCode: "HO", isActive: true },
  { code: "ITI", name: "IT Infrastructure", buCode: "HO", isActive: true },
  { code: "ITN", name: "IT Network", buCode: "MD01", isActive: false },
  { code: "BPM", name: "BPM", buCode: "HO", isActive: false },
];

const MOCKUP_DEPARTMENTS = [
  { code: "ITD-01", name: "IT Digital", divisionCode: "ITD", isActive: true },
  { code: "ITI-02", name: "IT Infrastructure", divisionCode: "ITI", isActive: true },
  { code: "BPM-03", name: "BPM Process", divisionCode: "BPM", isActive: false },
];

const MOCKUP_FUNCTIONS = [
  { code: "INF", name: "Infrastructure", isActive: true },
  { code: "ITC", name: "IT Care Service Desk", isActive: true },
  { code: "WTC", name: "IT Local Support / WTC", isActive: true },
  { code: "BPM", name: "BPM", isActive: true },
  { code: "SAP", name: "IT SAP", isActive: true },
  { code: "TRD", name: "IT Apps Trading", isActive: true },
  { code: "RTL", name: "IT Apps Retail", isActive: true },
  { code: "MFG", name: "IT Apps Manufacture", isActive: true },
  { code: "HR", name: "IT Apps Corporate HR", isActive: true },
  { code: "NHR", name: "IT Apps Corporate Non HR", isActive: true },
  { code: "DIG", name: "IT Apps Digital", isActive: true },
];

const MOCKUP_APPLICATIONS = [
  { code: "ITC", name: "IT Care", isActive: true },
  { code: "B2B", name: "B2B Ordering", isActive: true },
  { code: "WMOS", name: "Warehouse (WMOS)", isActive: false },
];

const MOCKUP_USERS = [
  { username: "superadmin", displayName: "Super Admin", email: "superadmin@company.co.id", role: "SuperAdmin", isActive: true, password: "admin123" },
  { username: "2091", displayName: "Firman", email: "firman@company.co.id", role: "AdminEvent", isActive: true, password: "admin123" },
  { username: "4589", displayName: "Sinta", email: "sinta@company.co.id", role: "ITLead", isActive: true, password: "admin123" },
  { username: "7751", displayName: "Rudi", email: "rudi@dealer.co.id", role: "SuperAdmin", isActive: false, password: "admin123" },
  { username: "3321", displayName: "Indah", email: "indah@company.co.id", role: "DepartmentHead", isActive: true, password: "admin123" },
  { username: "8893", displayName: "Arif", email: "arif@dealer.co.id", role: "AdminEvent", isActive: true, password: "admin123" },
];

async function upsertBusinessUnits(pool) {
  for (const item of MOCKUP_BUSINESS_UNITS) {
    await pool
      .request()
      .input("code", sql.NVarChar(20), item.code)
      .input("name", sql.NVarChar(200), item.name)
      .input("isActive", sql.Bit, item.isActive)
      .query(`
        IF EXISTS (SELECT 1 FROM BusinessUnits WHERE Code = @code)
        BEGIN
          UPDATE BusinessUnits
          SET Name = @name, IsActive = @isActive, UpdatedAt = GETDATE()
          WHERE Code = @code
        END
        ELSE
        BEGIN
          INSERT INTO BusinessUnits (Code, Name, IsActive, CreatedAt)
          VALUES (@code, @name, @isActive, GETDATE())
        END
      `);
  }
}

async function upsertDivisions(pool) {
  for (const item of MOCKUP_DIVISIONS) {
    const buResult = await pool
      .request()
      .input("buCode", sql.NVarChar(20), item.buCode)
      .query("SELECT TOP 1 BusinessUnitId FROM BusinessUnits WHERE Code = @buCode");
    const businessUnitId = buResult.recordset[0]?.BusinessUnitId;
    if (!businessUnitId) {
      throw new Error(`BusinessUnit with code ${item.buCode} not found`);
    }

    await pool
      .request()
      .input("code", sql.NVarChar(20), item.code)
      .input("name", sql.NVarChar(200), item.name)
      .input("businessUnitId", sql.UniqueIdentifier, businessUnitId)
      .input("isActive", sql.Bit, item.isActive)
      .query(`
        IF EXISTS (SELECT 1 FROM Divisions WHERE Code = @code)
        BEGIN
          UPDATE Divisions
          SET Name = @name, BusinessUnitId = @businessUnitId, IsActive = @isActive, UpdatedAt = GETDATE()
          WHERE Code = @code
        END
        ELSE
        BEGIN
          INSERT INTO Divisions (Code, Name, BusinessUnitId, IsActive, CreatedAt)
          VALUES (@code, @name, @businessUnitId, @isActive, GETDATE())
        END
      `);
  }
}

async function upsertDepartments(pool) {
  for (const item of MOCKUP_DEPARTMENTS) {
    const divResult = await pool
      .request()
      .input("divisionCode", sql.NVarChar(20), item.divisionCode)
      .query("SELECT TOP 1 DivisionId FROM Divisions WHERE Code = @divisionCode");
    const divisionId = divResult.recordset[0]?.DivisionId;
    if (!divisionId) {
      throw new Error(`Division with code ${item.divisionCode} not found`);
    }

    await pool
      .request()
      .input("code", sql.NVarChar(20), item.code)
      .input("name", sql.NVarChar(200), item.name)
      .input("divisionId", sql.UniqueIdentifier, divisionId)
      .input("isActive", sql.Bit, item.isActive)
      .query(`
        IF EXISTS (SELECT 1 FROM Departments WHERE Code = @code)
        BEGIN
          UPDATE Departments
          SET Name = @name, DivisionId = @divisionId, IsActive = @isActive, UpdatedAt = GETDATE()
          WHERE Code = @code
        END
        ELSE
        BEGIN
          INSERT INTO Departments (Code, Name, DivisionId, IsActive, CreatedAt)
          VALUES (@code, @name, @divisionId, @isActive, GETDATE())
        END
      `);
  }
}

async function upsertFunctions(pool) {
  for (const item of MOCKUP_FUNCTIONS) {
    await pool
      .request()
      .input("code", sql.NVarChar(20), item.code)
      .input("name", sql.NVarChar(200), item.name)
      .input("isActive", sql.Bit, item.isActive)
      .query(`
        IF EXISTS (SELECT 1 FROM Functions WHERE Code = @code)
        BEGIN
          UPDATE Functions
          SET Name = @name, IsActive = @isActive, UpdatedAt = GETDATE()
          WHERE Code = @code
        END
        ELSE
        BEGIN
          INSERT INTO Functions (Code, Name, IsActive, CreatedAt)
          VALUES (@code, @name, @isActive, GETDATE())
        END
      `);
  }
}

async function upsertApplications(pool) {
  for (const item of MOCKUP_APPLICATIONS) {
    await pool
      .request()
      .input("code", sql.NVarChar(20), item.code)
      .input("name", sql.NVarChar(200), item.name)
      .input("isActive", sql.Bit, item.isActive)
      .query(`
        IF EXISTS (SELECT 1 FROM Applications WHERE Code = @code)
        BEGIN
          UPDATE Applications
          SET Name = @name, IsActive = @isActive, UpdatedAt = GETDATE()
          WHERE Code = @code
        END
        ELSE
        BEGIN
          INSERT INTO Applications (Code, Name, Description, IsActive, CreatedAt)
          VALUES (@code, @name, NULL, @isActive, GETDATE())
        END
      `);
  }
}

async function upsertUsers(pool) {
  for (const item of MOCKUP_USERS) {
    const passwordHash = await bcrypt.hash(item.password, 10);
    await pool
      .request()
      .input("username", sql.NVarChar(50), item.username)
      .input("displayName", sql.NVarChar(200), item.displayName)
      .input("email", sql.NVarChar(255), item.email)
      .input("role", sql.NVarChar(50), item.role)
      .input("isActive", sql.Bit, item.isActive)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .query(`
        IF EXISTS (SELECT 1 FROM Users WHERE Username = @username OR Email = @email)
        BEGIN
          UPDATE Users
          SET
            Username = @username,
            DisplayName = @displayName,
            Email = @email,
            Role = @role,
            UseLDAP = 0,
            IsActive = @isActive,
            UpdatedAt = GETDATE()
          WHERE Username = @username OR Email = @email
        END
        ELSE
        BEGIN
          INSERT INTO Users (Username, DisplayName, Email, Role, UseLDAP, PasswordHash, IsActive, CreatedAt)
          VALUES (@username, @displayName, @email, @role, 0, @passwordHash, @isActive, GETDATE())
        END
      `);
  }
}

async function run() {
  const pool = await db.getPool();
  await pool.request().batch(`
    DELETE FROM BestCommentFeedback;
    DELETE FROM ApprovalHistory;
    DELETE FROM QuestionResponses;
    DELETE FROM Responses;
    DELETE FROM Questions;
    DELETE FROM ScheduledOperations;
    DELETE FROM EmailLogs;
    DELETE FROM EventConfiguration;
    DELETE FROM Events;
    DELETE FROM FunctionApplicationMappings;
    DELETE FROM ApplicationDepartmentMappings;
    DELETE FROM Sessions;
    DELETE FROM AuditLogs;
    DELETE FROM Departments;
    DELETE FROM Divisions;
    DELETE FROM BusinessUnits;
    DELETE FROM Functions;
    DELETE FROM Applications;
    DELETE FROM Users;
  `);

  await upsertBusinessUnits(pool);
  await upsertDivisions(pool);
  await upsertDepartments(pool);
  await upsertFunctions(pool);
  await upsertApplications(pool);
  await upsertUsers(pool);
  await db.close();
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("Mockup master data seed completed");
    process.exit(0);
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error("Mockup master data seed failed:", error.message);
    await db.close();
    process.exit(1);
  });
