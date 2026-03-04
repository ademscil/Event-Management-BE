const db = require("../src/database/connection");

async function fetchActiveMaster(pool) {
  const [apps, departments, functions] = await Promise.all([
    pool.request().query(`
      SELECT ApplicationId, Name
      FROM Applications
      WHERE ISNULL(IsActive, 1) = 1
      ORDER BY Name
    `),
    pool.request().query(`
      SELECT DepartmentId, Name
      FROM Departments
      WHERE ISNULL(IsActive, 1) = 1
      ORDER BY Name
    `),
    pool.request().query(`
      SELECT FunctionId, Name
      FROM Functions
      WHERE ISNULL(IsActive, 1) = 1
      ORDER BY Name
    `),
  ]);

  return {
    apps: apps.recordset || [],
    departments: departments.recordset || [],
    functions: functions.recordset || [],
  };
}

async function ensureDummyApplications(pool, minimumActiveApps = 6) {
  const activeAppsResult = await pool.request().query(`
    SELECT ApplicationId, Code, Name
    FROM Applications
    WHERE ISNULL(IsActive, 1) = 1
    ORDER BY Name
  `);

  const activeApps = activeAppsResult.recordset || [];
  if (activeApps.length >= minimumActiveApps) {
    return { created: 0, activeApps };
  }

  const needed = minimumActiveApps - activeApps.length;
  for (let i = 1; i <= needed; i += 1) {
    const idx = String(i).padStart(2, "0");
    const code = `DUMMYAPP${idx}`;
    const name = `Dummy App ${idx}`;
    const description = "Dummy application for survey mapping preview";

    await pool.request()
      .input("code", db.sql.NVarChar, code)
      .input("name", db.sql.NVarChar, name)
      .input("description", db.sql.NVarChar, description)
      .query(`
        IF EXISTS (SELECT 1 FROM Applications WHERE Code = @code)
        BEGIN
          UPDATE Applications
          SET Name = @name,
              Description = @description,
              IsActive = 1,
              UpdatedAt = GETDATE()
          WHERE Code = @code
        END
        ELSE
        BEGIN
          INSERT INTO Applications (Code, Name, Description, IsActive, CreatedAt, CreatedBy)
          VALUES (@code, @name, @description, 1, GETDATE(), NULL)
        END
      `);
  }

  const refreshed = await pool.request().query(`
    SELECT ApplicationId, Code, Name
    FROM Applications
    WHERE ISNULL(IsActive, 1) = 1
    ORDER BY Name
  `);

  return { created: needed, activeApps: refreshed.recordset || [] };
}

async function seedDepartmentMappings(pool, apps, departments, targetAppsPerDepartment = 4) {
  let inserted = 0;
  for (let i = 0; i < departments.length; i += 1) {
    const department = departments[i];
    const existingRows = await pool.request()
      .input("departmentId", db.sql.UniqueIdentifier, department.DepartmentId)
      .query(`
        SELECT ApplicationId
        FROM ApplicationDepartmentMappings
        WHERE DepartmentId = @departmentId
      `);
    const existingAppIds = new Set((existingRows.recordset || []).map((x) => String(x.ApplicationId).toLowerCase()));

    let need = Math.max(0, targetAppsPerDepartment - existingAppIds.size);
    if (need === 0) continue;

    for (let k = 0; k < apps.length && need > 0; k += 1) {
      const app = apps[(i + k) % apps.length];
      const appId = String(app.ApplicationId).toLowerCase();
      if (existingAppIds.has(appId)) continue;

      await pool.request()
        .input("applicationId", db.sql.UniqueIdentifier, app.ApplicationId)
        .input("departmentId", db.sql.UniqueIdentifier, department.DepartmentId)
        .query(`
          INSERT INTO ApplicationDepartmentMappings (ApplicationId, DepartmentId, CreatedAt, CreatedBy)
          VALUES (@applicationId, @departmentId, GETDATE(), NULL)
        `);
      inserted += 1;
      need -= 1;
      existingAppIds.add(appId);
    }
  }
  return inserted;
}

async function seedFunctionMappings(pool, apps, functions, targetAppsPerFunction = 4) {
  let inserted = 0;
  for (let i = 0; i < functions.length; i += 1) {
    const func = functions[i];
    const existingRows = await pool.request()
      .input("functionId", db.sql.UniqueIdentifier, func.FunctionId)
      .query(`
        SELECT ApplicationId
        FROM FunctionApplicationMappings
        WHERE FunctionId = @functionId
      `);
    const existingAppIds = new Set((existingRows.recordset || []).map((x) => String(x.ApplicationId).toLowerCase()));

    let need = Math.max(0, targetAppsPerFunction - existingAppIds.size);
    if (need === 0) continue;

    for (let k = 0; k < apps.length && need > 0; k += 1) {
      const app = apps[(i + k) % apps.length];
      const appId = String(app.ApplicationId).toLowerCase();
      if (existingAppIds.has(appId)) continue;

      await pool.request()
        .input("functionId", db.sql.UniqueIdentifier, func.FunctionId)
        .input("applicationId", db.sql.UniqueIdentifier, app.ApplicationId)
        .query(`
          INSERT INTO FunctionApplicationMappings (FunctionId, ApplicationId, CreatedAt, CreatedBy)
          VALUES (@functionId, @applicationId, GETDATE(), NULL)
        `);
      inserted += 1;
      need -= 1;
      existingAppIds.add(appId);
    }
  }
  return inserted;
}

async function run() {
  const pool = await db.getPool();
  const ensureApps = await ensureDummyApplications(pool, 6);
  const { apps, departments, functions } = await fetchActiveMaster(pool);

  if (apps.length === 0) {
    console.log("No active applications found. Nothing to map.");
    return;
  }

  const insertedAppDept = await seedDepartmentMappings(pool, apps, departments, 4);
  const insertedFnApp = await seedFunctionMappings(pool, apps, functions, 4);

  const [countAppDept, countFnApp] = await Promise.all([
    pool.request().query("SELECT COUNT(1) AS Total FROM ApplicationDepartmentMappings"),
    pool.request().query("SELECT COUNT(1) AS Total FROM FunctionApplicationMappings"),
  ]);

  console.log(JSON.stringify({
    createdDummyApplications: ensureApps.created,
    inserted: {
      applicationDepartmentMappings: insertedAppDept,
      functionApplicationMappings: insertedFnApp,
    },
    totals: {
      applicationDepartmentMappings: countAppDept.recordset[0]?.Total || 0,
      functionApplicationMappings: countFnApp.recordset[0]?.Total || 0,
    },
    masters: {
      activeApplications: apps.length,
      activeDepartments: departments.length,
      activeFunctions: functions.length,
    },
  }, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed dummy mappings failed:", error.message);
    process.exit(1);
  });
