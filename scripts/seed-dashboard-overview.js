const db = require("../src/database/connection");
const { sql } = require("../src/database/connection");

const SURVEY_SEEDS = [
  {
    title: "Survey Corp IT & BPM",
    startDate: "2026-01-01T00:00:00",
    endDate: "2026-01-31T23:59:59",
    status: "Active",
    targetRespondents: 1500,
    targetScore: 8.5,
    currentScore: 8.4,
    respondentCount: 1245,
  },
  {
    title: "Survey IT Digital",
    startDate: "2025-12-01T00:00:00",
    endDate: "2025-12-31T23:59:59",
    status: "Closed",
    targetRespondents: 1000,
    targetScore: 8.5,
    currentScore: 8.3,
    respondentCount: 980,
  },
];

async function getRequiredIds(pool) {
  const user = await pool
    .request()
    .query(
      "SELECT TOP 1 UserId FROM Users WHERE IsActive = 1 AND Role = 'SuperAdmin' ORDER BY CreatedAt"
    );
  const bu = await pool
    .request()
    .query("SELECT TOP 1 BusinessUnitId FROM BusinessUnits ORDER BY CreatedAt");
  const div = await pool
    .request()
    .query("SELECT TOP 1 DivisionId FROM Divisions ORDER BY CreatedAt");
  const dept = await pool
    .request()
    .query("SELECT TOP 1 DepartmentId FROM Departments ORDER BY CreatedAt");
  const app = await pool
    .request()
    .query("SELECT TOP 1 ApplicationId FROM Applications ORDER BY CreatedAt");

  if (!user.recordset[0]?.UserId) {
    throw new Error("No active SuperAdmin user found");
  }
  let businessUnitId = bu.recordset[0]?.BusinessUnitId;
  let divisionId = div.recordset[0]?.DivisionId;
  let departmentId = dept.recordset[0]?.DepartmentId;
  let applicationId = app.recordset[0]?.ApplicationId;

  if (!businessUnitId) {
    const newBu = await pool
      .request()
      .query(`
        INSERT INTO BusinessUnits (Code, Name, IsActive, CreatedAt, CreatedBy)
        OUTPUT INSERTED.BusinessUnitId
        VALUES ('BU_DASHBOARD', 'Dashboard BU', 1, GETDATE(), NULL)
      `);
    businessUnitId = newBu.recordset[0].BusinessUnitId;
  }

  if (!divisionId) {
    const newDiv = await pool
      .request()
      .input("businessUnitId", sql.UniqueIdentifier, businessUnitId)
      .query(`
        INSERT INTO Divisions (BusinessUnitId, Code, Name, IsActive, CreatedAt, CreatedBy)
        OUTPUT INSERTED.DivisionId
        VALUES (@businessUnitId, 'DIV_DASHBOARD', 'Dashboard Division', 1, GETDATE(), NULL)
      `);
    divisionId = newDiv.recordset[0].DivisionId;
  }

  if (!departmentId) {
    const newDept = await pool
      .request()
      .input("divisionId", sql.UniqueIdentifier, divisionId)
      .query(`
        INSERT INTO Departments (DivisionId, Code, Name, IsActive, CreatedAt, CreatedBy)
        OUTPUT INSERTED.DepartmentId
        VALUES (@divisionId, 'DEPT_DASHBOARD', 'Dashboard Department', 1, GETDATE(), NULL)
      `);
    departmentId = newDept.recordset[0].DepartmentId;
  }

  if (!applicationId) {
    const newApp = await pool
      .request()
      .query(`
        INSERT INTO Applications (Code, Name, Description, IsActive, CreatedAt, CreatedBy)
        OUTPUT INSERTED.ApplicationId
        VALUES ('APP_DASHBOARD', 'Dashboard App', 'Synthetic app for dashboard seed', 1, GETDATE(), NULL)
      `);
    applicationId = newApp.recordset[0].ApplicationId;
  }

  return {
    createdBy: user.recordset[0].UserId,
    businessUnitId,
    divisionId,
    departmentId,
    applicationId,
  };
}

async function upsertSurvey(pool, ids, seed) {
  const existing = await pool
    .request()
    .input("title", sql.NVarChar(500), seed.title)
    .query("SELECT TOP 1 SurveyId FROM Events WHERE Title = @title ORDER BY CreatedAt");

  let surveyId = existing.recordset[0]?.SurveyId;

  if (!surveyId) {
    const created = await pool
      .request()
      .input("title", sql.NVarChar(500), seed.title)
      .input("description", sql.NVarChar(sql.MAX), null)
      .input("startDate", sql.DateTime2, new Date(seed.startDate))
      .input("endDate", sql.DateTime2, new Date(seed.endDate))
      .input("status", sql.NVarChar(50), seed.status)
      .input("targetRespondents", sql.Int, seed.targetRespondents)
      .input("targetScore", sql.Decimal(5, 2), seed.targetScore)
      .input("currentScore", sql.Decimal(5, 2), seed.currentScore)
      .input("createdBy", sql.UniqueIdentifier, ids.createdBy)
      .query(`
        INSERT INTO Events (
          Title, Description, StartDate, EndDate, Status,
          TargetRespondents, TargetScore, CurrentScore, DuplicatePreventionEnabled,
          CreatedBy, CreatedAt
        )
        OUTPUT INSERTED.SurveyId
        VALUES (
          @title, @description, @startDate, @endDate, @status,
          @targetRespondents, @targetScore, @currentScore, 1,
          @createdBy, GETDATE()
        )
      `);

    surveyId = created.recordset[0].SurveyId;
  } else {
    await pool
      .request()
      .input("surveyId", sql.UniqueIdentifier, surveyId)
      .input("startDate", sql.DateTime2, new Date(seed.startDate))
      .input("endDate", sql.DateTime2, new Date(seed.endDate))
      .input("status", sql.NVarChar(50), seed.status)
      .input("targetRespondents", sql.Int, seed.targetRespondents)
      .input("targetScore", sql.Decimal(5, 2), seed.targetScore)
      .input("currentScore", sql.Decimal(5, 2), seed.currentScore)
      .input("updatedBy", sql.UniqueIdentifier, ids.createdBy)
      .query(`
        UPDATE Events
        SET
          StartDate = @startDate,
          EndDate = @endDate,
          Status = @status,
          TargetRespondents = @targetRespondents,
          TargetScore = @targetScore,
          CurrentScore = @currentScore,
          UpdatedBy = @updatedBy,
          UpdatedAt = GETDATE()
        WHERE SurveyId = @surveyId
      `);
  }

  const configCheck = await pool
    .request()
    .input("surveyId", sql.UniqueIdentifier, surveyId)
    .query("SELECT TOP 1 ConfigId FROM EventConfiguration WHERE SurveyId = @surveyId");

  if (!configCheck.recordset[0]?.ConfigId) {
    await pool
      .request()
      .input("surveyId", sql.UniqueIdentifier, surveyId)
      .query(`
        INSERT INTO EventConfiguration (
          SurveyId, ShowProgressBar, ShowPageNumbers, MultiPage, CreatedAt
        )
        VALUES (@surveyId, 1, 1, 0, GETDATE())
      `);
  }

  return surveyId;
}

async function seedRespondents(pool, ids, surveyId, seed) {
  const currentCountResult = await pool
    .request()
    .input("surveyId", sql.UniqueIdentifier, surveyId)
    .query("SELECT COUNT(1) AS Total FROM Responses WHERE SurveyId = @surveyId");

  const currentCount = currentCountResult.recordset[0]?.Total || 0;
  const required = seed.respondentCount;
  const toInsert = required - currentCount;

  if (toInsert <= 0) {
    return;
  }

  await pool
    .request()
    .input("surveyId", sql.UniqueIdentifier, surveyId)
    .input("insertCount", sql.Int, toInsert)
    .input("baseCount", sql.Int, currentCount)
    .input("titleSlug", sql.NVarChar(200), seed.title.toLowerCase().replace(/[^a-z0-9]+/g, "."))
    .input("businessUnitId", sql.UniqueIdentifier, ids.businessUnitId)
    .input("divisionId", sql.UniqueIdentifier, ids.divisionId)
    .input("departmentId", sql.UniqueIdentifier, ids.departmentId)
    .input("applicationId", sql.UniqueIdentifier, ids.applicationId)
    .query(`
      ;WITH NumberSeries AS (
        SELECT TOP (@insertCount)
          ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS N
        FROM sys.all_objects a
        CROSS JOIN sys.all_objects b
      )
      INSERT INTO Responses (
        SurveyId, RespondentEmail, RespondentName,
        BusinessUnitId, DivisionId, DepartmentId, ApplicationId,
        IPAddress, SubmittedAt
      )
      SELECT
        @surveyId,
        CONCAT('dashboard.', @titleSlug, '.', (@baseCount + N), '@example.com'),
        CONCAT('Dashboard User ', (@baseCount + N)),
        @businessUnitId, @divisionId, @departmentId, @applicationId,
        '127.0.0.1',
        DATEADD(MINUTE, -N, GETDATE())
      FROM NumberSeries
    `);
}

async function run() {
  const pool = await db.getPool();
  const ids = await getRequiredIds(pool);

  for (const seed of SURVEY_SEEDS) {
    const surveyId = await upsertSurvey(pool, ids, seed);
    await seedRespondents(pool, ids, surveyId, seed);
    // eslint-disable-next-line no-console
    console.log(`Seeded dashboard survey: ${seed.title}`);
  }

  await db.close();
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("Dashboard overview seed completed");
    process.exit(0);
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error("Dashboard overview seed failed:", error.message);
    await db.close();
    process.exit(1);
  });
