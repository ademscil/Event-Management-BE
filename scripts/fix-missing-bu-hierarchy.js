/**
 * fix-missing-bu-hierarchy.js
 *
 * Untuk setiap BU aktif yang belum punya divisi,
 * otomatis buat 1 divisi dan 1 department dengan nama yang sama seperti BU.
 * Pola ini mengikuti Main Dealer Bandung.
 */

const db = require('../src/database/connection');
const { sql } = require('../src/database/connection');

async function run() {
  const pool = await db.getPool();

  // Cari semua BU aktif yang belum punya divisi
  const buResult = await pool.request().query(`
    SELECT bu.BusinessUnitId, bu.Name
    FROM BusinessUnits bu
    WHERE bu.IsActive = 1
      AND NOT EXISTS (
        SELECT 1 FROM Divisions d WHERE d.BusinessUnitId = bu.BusinessUnitId
      )
    ORDER BY bu.Name
  `);

  const missingBUs = buResult.recordset;

  if (missingBUs.length === 0) {
    console.log('Semua BU aktif sudah punya divisi. Tidak ada yang perlu diperbaiki.');
    await db.close();
    process.exit(0);
  }

  console.log(`Ditemukan ${missingBUs.length} BU tanpa divisi:`);
  missingBUs.forEach(bu => console.log(`  - ${bu.Name} (${bu.BusinessUnitId})`));
  console.log('');

  for (const bu of missingBUs) {
    console.log(`Memproses: ${bu.Name}...`);

    // Buat divisi dengan nama sama seperti BU
    // Generate Code unik berdasarkan nama BU
    const buCode = bu.Name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12).toUpperCase();
    const divCode = `DIV-${buCode}`;

    const divResult = await pool.request()
      .input('businessUnitId', sql.UniqueIdentifier, bu.BusinessUnitId)
      .input('name', sql.NVarChar(200), bu.Name)
      .input('code', sql.NVarChar(50), divCode)
      .query(`
        INSERT INTO Divisions (BusinessUnitId, Code, Name, IsActive, CreatedAt)
        OUTPUT INSERTED.DivisionId
        VALUES (@businessUnitId, @code, @name, 1, GETDATE())
      `);

    const divisionId = divResult.recordset[0].DivisionId;
    console.log(`  ✓ Divisi dibuat: "${bu.Name}" code=${divCode} (${divisionId})`);

    // Buat department dengan nama sama seperti BU
    const deptCode = `DEPT-${buCode}`;
    const deptResult = await pool.request()
      .input('divisionId', sql.UniqueIdentifier, divisionId)
      .input('name', sql.NVarChar(200), bu.Name)
      .input('code', sql.NVarChar(50), deptCode)
      .query(`
        INSERT INTO Departments (DivisionId, Code, Name, IsActive, CreatedAt)
        OUTPUT INSERTED.DepartmentId
        VALUES (@divisionId, @code, @name, 1, GETDATE())
      `);

    const departmentId = deptResult.recordset[0].DepartmentId;
    console.log(`  ✓ Department dibuat: "${bu.Name}" (${departmentId})`);
  }

  console.log('\n✅ Selesai! Semua BU sekarang punya divisi dan department.');
  await db.close();
}

run()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('❌ Error:', error.message);
    await db.close().catch(() => {});
    process.exit(1);
  });
