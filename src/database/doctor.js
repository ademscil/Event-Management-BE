const fs = require('fs').promises;
const path = require('path');
const sql = require('mssql');
const config = require('../config');

const migrationsDir = path.join(__dirname, 'migrations');

async function getMigrationFiles() {
  const files = await fs.readdir(migrationsDir);
  return files.filter((file) => file.endsWith('.sql')).sort();
}

async function getAppliedMigrations(pool) {
  const result = await pool.request().query(`
    IF OBJECT_ID(N'dbo.Migrations', N'U') IS NULL
      SELECT CAST(NULL AS NVARCHAR(255)) AS MigrationName WHERE 1 = 0
    ELSE
      SELECT MigrationName FROM dbo.Migrations
  `);
  return result.recordset.map((row) => row.MigrationName);
}

async function objectInfo(pool, name) {
  const result = await pool.request()
    .input('name', sql.NVarChar(128), name)
    .query(`
      SELECT name, type_desc
      FROM sys.objects
      WHERE name = @name
      UNION ALL
      SELECT name, 'SYNONYM' AS type_desc
      FROM sys.synonyms
      WHERE name = @name
    `);
  return result.recordset;
}

async function hasColumn(pool, tableName, columnName) {
  const result = await pool.request()
    .input('tableName', sql.NVarChar(128), tableName)
    .input('columnName', sql.NVarChar(128), columnName)
    .query(`
      SELECT COUNT(1) AS Cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName
        AND COLUMN_NAME = @columnName
    `);
  return Number(result.recordset[0]?.Cnt || 0) > 0;
}

async function main() {
  let pool;
  try {
    pool = await new sql.ConnectionPool(config.database).connect();

    const migrationFiles = await getMigrationFiles();
    const applied = await getAppliedMigrations(pool);
    const pending = migrationFiles.filter((file) => !applied.includes(file));

    const checks = [
      { label: 'Events object', ok: (await objectInfo(pool, 'Events')).length > 0 },
      { label: 'Surveys alias/object', ok: (await objectInfo(pool, 'Surveys')).length > 0 },
      { label: 'EventConfiguration object', ok: (await objectInfo(pool, 'EventConfiguration')).length > 0 },
      { label: 'SurveyConfiguration alias/object', ok: (await objectInfo(pool, 'SurveyConfiguration')).length > 0 },
      { label: 'EventTypes table', ok: (await objectInfo(pool, 'EventTypes')).some((row) => row.type_desc === 'USER_TABLE') },
      { label: 'Events.EventTypeId', ok: await hasColumn(pool, 'Events', 'EventTypeId') || await hasColumn(pool, 'Surveys', 'EventTypeId') },
      { label: 'Functions.DeptId', ok: await hasColumn(pool, 'Functions', 'DeptId') },
      { label: 'Responses.ResponseApprovalStatus', ok: await hasColumn(pool, 'Responses', 'ResponseApprovalStatus') },
      { label: 'SurveyPublishCycles/EventPublishCycles support', ok: (await objectInfo(pool, 'SurveyPublishCycles')).length > 0 || (await objectInfo(pool, 'EventPublishCycles')).length > 0 },
      { label: 'Responses.PublishCycleId', ok: await hasColumn(pool, 'Responses', 'PublishCycleId') },
    ];

    console.log('=== DB DOCTOR REPORT ===');
    console.log(`Server   : ${config.database.server}`);
    console.log(`Database : ${config.database.database}`);
    console.log('');
    for (const check of checks) {
      console.log(`${check.ok ? '[OK] ' : '[MISS]'} ${check.label}`);
    }
    console.log('');
    console.log(`Applied migrations : ${applied.length}`);
    console.log(`Pending migrations : ${pending.length}`);
    if (pending.length > 0) {
      console.log('Pending list:');
      pending.forEach((item) => console.log(`- ${item}`));
    }

    const hardBlocks = checks.filter((item) => !item.ok);
    console.log('');
    if (hardBlocks.length === 0 && pending.length === 0) {
      console.log('DB readiness: READY');
    } else if (hardBlocks.length === 0) {
      console.log('DB readiness: USABLE WITH PENDING MIGRATIONS');
    } else {
      console.log('DB readiness: NOT READY');
    }
  } catch (error) {
    console.error('DB doctor failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

main();
