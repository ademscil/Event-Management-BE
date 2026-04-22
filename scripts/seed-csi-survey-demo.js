/**
 * seed-csi-survey-demo.js
 *
 * Membuat 1 survey demo "Corporate IT & BPM Survey 2026" yang:
 * - Strukturnya mengikuti mockup page1-4 (hero cover, data diri, pilih aplikasi, rating, signature)
 * - Menggunakan data master BU/Divisi/Dept/Function dari DB aktual
 * - Menggunakan mapping Dept→App dan Function→App yang sudah ada
 * - Status: Active, periode 2026
 * - Assign ke AdminEvent pertama yang aktif
 *
 * Usage: node scripts/seed-csi-survey-demo.js
 */

const db = require("../src/database/connection");
const { sql } = require("../src/database/connection");

const SURVEY_TITLE = "Corporate IT & BPM Survey 2026";
const SURVEY_DESCRIPTION =
  "Survey kepuasan pengguna terhadap layanan IT & BPM PT Astra Otoparts Tbk. " +
  "Mohon isi survey ini dengan jujur untuk membantu kami meningkatkan kualitas layanan.";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getOrCreateAdminEvent(pool) {
  const result = await pool.request().query(`
    SELECT TOP 1 UserId, DisplayName, Username
    FROM Users
    WHERE Role = 'AdminEvent' AND IsActive = 1
    ORDER BY CreatedAt
  `);
  if (result.recordset[0]) return result.recordset[0];

  // fallback: SuperAdmin
  const fallback = await pool.request().query(`
    SELECT TOP 1 UserId, DisplayName, Username
    FROM Users
    WHERE Role = 'SuperAdmin' AND IsActive = 1
    ORDER BY CreatedAt
  `);
  if (!fallback.recordset[0]) throw new Error("No active user found in DB");
  return fallback.recordset[0];
}

async function getSuperAdmin(pool) {
  const result = await pool.request().query(`
    SELECT TOP 1 UserId FROM Users
    WHERE Role = 'SuperAdmin' AND IsActive = 1
    ORDER BY CreatedAt
  `);
  if (!result.recordset[0]) throw new Error("No active SuperAdmin found");
  return result.recordset[0].UserId;
}

async function checkExistingSurvey(pool, title) {
  const result = await pool
    .request()
    .input("title", sql.NVarChar(500), title)
    .query(`
      SELECT TOP 1 SurveyId, Status
      FROM Events
      WHERE Title = @title
      ORDER BY CreatedAt DESC
    `);
  return result.recordset[0] || null;
}

async function deleteSurveyFully(pool, surveyId) {
  // Hapus bertahap dengan foreign key yang benar
  await pool.request().input("surveyId", sql.UniqueIdentifier, surveyId).query(`
    -- BestCommentFeedback via QuestionResponseId
    DELETE FROM BestCommentFeedback
    WHERE QuestionResponseId IN (
      SELECT qr.QuestionResponseId FROM QuestionResponses qr
      INNER JOIN Responses r ON r.ResponseId = qr.ResponseId
      WHERE r.SurveyId = @surveyId
    );
    -- QuestionResponses via Responses
    DELETE FROM QuestionResponses
    WHERE ResponseId IN (
      SELECT ResponseId FROM Responses WHERE SurveyId = @surveyId
    );
    -- Responses
    DELETE FROM Responses WHERE SurveyId = @surveyId;
    -- Questions
    DELETE FROM Questions WHERE SurveyId = @surveyId;
    -- ScheduledOperations
    DELETE FROM ScheduledOperations WHERE SurveyId = @surveyId;
    -- EmailLogs
    DELETE FROM EmailLogs WHERE SurveyId = @surveyId;
    -- EventConfiguration
    DELETE FROM EventConfiguration WHERE SurveyId = @surveyId;
    -- EventAdminAssignments
    DELETE FROM EventAdminAssignments WHERE SurveyId = @surveyId;
    -- Events
    DELETE FROM Events WHERE SurveyId = @surveyId;
  `);
}

// ─── Create Survey ───────────────────────────────────────────────────────────

async function createSurvey(pool, createdBy, adminEventUserId) {
  const startDate = new Date("2026-01-01T00:00:00");
  const endDate = new Date("2026-12-31T23:59:59");

  const result = await pool
    .request()
    .input("title", sql.NVarChar(500), SURVEY_TITLE)
    .input("description", sql.NVarChar(sql.MAX), SURVEY_DESCRIPTION)
    .input("startDate", sql.DateTime2, startDate)
    .input("endDate", sql.DateTime2, endDate)
    .input("status", sql.NVarChar(50), "Active")
    .input("targetRespondents", sql.Int, 500)
    .input("targetScore", sql.Decimal(5, 2), 8.5)
    .input("createdBy", sql.UniqueIdentifier, createdBy)
    .query(`
      INSERT INTO Events (
        Title, Description, StartDate, EndDate, Status,
        TargetRespondents, TargetScore, DuplicatePreventionEnabled,
        CreatedBy, CreatedAt
      )
      OUTPUT INSERTED.SurveyId
      VALUES (
        @title, @description, @startDate, @endDate, @status,
        @targetRespondents, @targetScore, 1,
        @createdBy, GETDATE()
      )
    `);

  const surveyId = result.recordset[0].SurveyId;

  // EventConfiguration — multi-page ON, progress bar ON
  // HeroTitle dan HeroSubtitle dibiarkan NULL — FE akan fallback ke form.title dan form.description
  await pool
    .request()
    .input("surveyId", sql.UniqueIdentifier, surveyId)
    .input("primaryColor", sql.NVarChar(20), "#7b2b83")
    .input("secondaryColor", sql.NVarChar(20), "#6a2371")
    .query(`
      INSERT INTO EventConfiguration (
        SurveyId,
        PrimaryColor, SecondaryColor,
        ShowProgressBar, ShowPageNumbers, MultiPage,
        CreatedAt
      )
      VALUES (
        @surveyId,
        @primaryColor, @secondaryColor,
        1, 1, 1,
        GETDATE()
      )
    `);

  // Assign AdminEvent
  try {
    await pool
      .request()
      .input("surveyId", sql.UniqueIdentifier, surveyId)
      .input("userId", sql.UniqueIdentifier, adminEventUserId)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM EventAdminAssignments
          WHERE SurveyId = @surveyId AND AdminUserId = @userId
        )
        INSERT INTO EventAdminAssignments (SurveyId, AdminUserId, AssignedAt)
        VALUES (@surveyId, @userId, GETDATE())
      `);
  } catch {
    // fallback: update Events.AssignedAdminId
    await pool
      .request()
      .input("surveyId", sql.UniqueIdentifier, surveyId)
      .input("userId", sql.UniqueIdentifier, adminEventUserId)
      .query(`
        UPDATE Events SET AssignedAdminId = @userId WHERE SurveyId = @surveyId
      `);
  }

  return surveyId;
}

// ─── Insert Question ─────────────────────────────────────────────────────────

async function insertQuestion(pool, surveyId, {
  type,
  promptText,
  subtitle = null,
  isMandatory = false,
  displayOrder,
  pageNumber,
  options = null,
  imageUrl = null,
}) {
  await pool
    .request()
    .input("surveyId", sql.UniqueIdentifier, surveyId)
    .input("type", sql.NVarChar(50), type)
    .input("promptText", sql.NVarChar(sql.MAX), promptText)
    .input("subtitle", sql.NVarChar(sql.MAX), subtitle)
    .input("isMandatory", sql.Bit, isMandatory ? 1 : 0)
    .input("displayOrder", sql.Int, displayOrder)
    .input("pageNumber", sql.Int, pageNumber)
    .input("options", sql.NVarChar(sql.MAX), options ? JSON.stringify(options) : null)
    .input("imageUrl", sql.NVarChar(sql.MAX), imageUrl)
    .query(`
      INSERT INTO Questions (
        SurveyId, Type, PromptText, Subtitle,
        IsMandatory, DisplayOrder, PageNumber,
        Options, ImageUrl, CreatedAt
      )
      VALUES (
        @surveyId, @type, @promptText, @subtitle,
        @isMandatory, @displayOrder, @pageNumber,
        @options, @imageUrl, GETDATE()
      )
    `);
}

// ─── Build Questions ─────────────────────────────────────────────────────────

async function buildQuestions(pool, surveyId) {
  let order = 1;

  // ── PAGE 1: HeroCover — imageUrl dipakai sebagai hero image di layout
  // Tidak muncul sebagai question card, hanya sebagai sumber gambar header
  await insertQuestion(pool, surveyId, {
    type: "HeroCover",
    promptText: SURVEY_TITLE,
    subtitle: SURVEY_DESCRIPTION,
    isMandatory: false,
    displayOrder: order++,
    pageNumber: 1,
    options: { heroImageUrl: "" },
    // imageUrl diisi kosong — admin bisa upload via survey builder
  });

  // ── PAGE 2: Data Diri ───────────────────────────────────────────────────
  await insertQuestion(pool, surveyId, {
    type: "Text",
    promptText: "Nama",
    subtitle: "Masukkan nama lengkap Anda",
    isMandatory: true,
    displayOrder: order++,
    pageNumber: 2,
  });

  await insertQuestion(pool, surveyId, {
    type: "Dropdown",
    promptText: "Business Unit",
    subtitle: "Pilih Business Unit Anda",
    isMandatory: true,
    displayOrder: order++,
    pageNumber: 2,
    options: { dataSource: "bu" },
  });

  await insertQuestion(pool, surveyId, {
    type: "Dropdown",
    promptText: "Divisi",
    subtitle: "Pilih Divisi Anda",
    isMandatory: true,
    displayOrder: order++,
    pageNumber: 2,
    options: { dataSource: "division" },
  });

  await insertQuestion(pool, surveyId, {
    type: "Dropdown",
    promptText: "Department",
    subtitle: "Pilih Department Anda",
    isMandatory: true,
    displayOrder: order++,
    pageNumber: 2,
    options: { dataSource: "department" },
  });

  await insertQuestion(pool, surveyId, {
    type: "Dropdown",
    promptText: "Function",
    subtitle: "Pilih Function Anda",
    isMandatory: true,
    displayOrder: order++,
    pageNumber: 2,
    options: { dataSource: "function" },
  });

  await insertQuestion(pool, surveyId, {
    type: "Text",
    promptText: "NPK",
    subtitle: "Masukkan NPK Anda",
    isMandatory: true,
    displayOrder: order++,
    pageNumber: 2,
  });

  await insertQuestion(pool, surveyId, {
    type: "Text",
    promptText: "Email",
    subtitle: "Masukkan email aktif Anda (contoh: nama@astraotoparts.co.id)",
    isMandatory: true,
    displayOrder: order++,
    pageNumber: 2,
  });

  // ── PAGE 3: Pilih Aplikasi + Penilaian Layanan ─────────────────────────
  // Checkbox pilih aplikasi dari mapping Department
  await insertQuestion(pool, surveyId, {
    type: "Checkbox",
    promptText: "Pilih aplikasi yang Anda gunakan",
    subtitle: "Centang semua aplikasi yang Anda gunakan sehari-hari. Daftar aplikasi disesuaikan dengan Department Anda.",
    isMandatory: true,
    displayOrder: order++,
    pageNumber: 3,
    options: {
      dataSource: "app_department",
      layout: "vertical",
      displayCondition: "always",
    },
  });

  // Rating Likert 1-10 — muncul per aplikasi yang dipilih (after_mapped_selection)
  // 5 statement, required jika score < 7
  await insertQuestion(pool, surveyId, {
    type: "MatrixLikert",
    promptText: "Penilaian Layanan",
    subtitle: "Berikan penilaian 1-10 untuk setiap aspek layanan aplikasi berikut.",
    isMandatory: true,
    displayOrder: order++,
    pageNumber: 3,
    options: {
      variant: "likert",
      dataSource: "app_department",
      displayCondition: "after_mapped_selection",
      ratingScale: 10,
      rows: [
        "Kecepatan merespon / menyelesaikan masalah",
        "Kualitas solusi yang diberikan",
        "Kemudahan penggunaan aplikasi",
        "Ketersediaan dan stabilitas sistem",
        "Kepuasan secara keseluruhan",
      ],
      commentThreshold: 7,
    },
  });

  // ── PAGE 4: Tanda Tangan ────────────────────────────────────────────────
  await insertQuestion(pool, surveyId, {
    type: "Signature",
    promptText: "Tanda Tangan",
    subtitle: "Tanda tangani di area bawah ini sebagai konfirmasi pengisian survey.",
    isMandatory: true,
    displayOrder: order++,
    pageNumber: 4,
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  const pool = await db.getPool();

  // Cek data master
  const [buCount, divCount, deptCount, fnCount, appCount, mappingDeptCount, mappingFnCount] =
    await Promise.all([
      pool.request().query("SELECT COUNT(1) AS N FROM BusinessUnits WHERE IsActive = 1"),
      pool.request().query("SELECT COUNT(1) AS N FROM Divisions WHERE IsActive = 1"),
      pool.request().query("SELECT COUNT(1) AS N FROM Departments WHERE IsActive = 1"),
      pool.request().query("SELECT COUNT(1) AS N FROM Functions WHERE IsActive = 1"),
      pool.request().query("SELECT COUNT(1) AS N FROM Applications WHERE IsActive = 1"),
      pool.request().query("SELECT COUNT(1) AS N FROM ApplicationDepartmentMappings"),
      pool.request().query("SELECT COUNT(1) AS N FROM FunctionApplicationMappings"),
    ]);

  console.log("Master data di DB:");
  console.log(`  BusinessUnits (active): ${buCount.recordset[0].N}`);
  console.log(`  Divisions (active):     ${divCount.recordset[0].N}`);
  console.log(`  Departments (active):   ${deptCount.recordset[0].N}`);
  console.log(`  Functions (active):     ${fnCount.recordset[0].N}`);
  console.log(`  Applications (active):  ${appCount.recordset[0].N}`);
  console.log(`  Dept→App mappings:      ${mappingDeptCount.recordset[0].N}`);
  console.log(`  Fn→App mappings:        ${mappingFnCount.recordset[0].N}`);

  if (appCount.recordset[0].N === 0) {
    throw new Error(
      "Tidak ada aplikasi aktif di DB. Jalankan seed-mockup-master-data.js dan seed-dummy-mappings.js terlebih dahulu."
    );
  }

  const superAdminId = await getSuperAdmin(pool);
  const adminEventUser = await getOrCreateAdminEvent(pool);
  console.log(`\nCreatedBy (SuperAdmin): ${superAdminId}`);
  console.log(`AdminEvent assigned:    ${adminEventUser.DisplayName} (${adminEventUser.Username})`);

  // Hapus survey lama jika ada
  const existing = await checkExistingSurvey(pool, SURVEY_TITLE);
  if (existing) {
    console.log(`\nSurvey "${SURVEY_TITLE}" sudah ada (${existing.SurveyId}), menghapus dan membuat ulang...`);
    await deleteSurveyFully(pool, existing.SurveyId);
  }

  // Buat survey baru
  console.log(`\nMembuat survey "${SURVEY_TITLE}"...`);
  const surveyId = await createSurvey(pool, superAdminId, adminEventUser.UserId);
  console.log(`Survey ID: ${surveyId}`);

  // Insert questions
  console.log("Menambahkan questions (5 halaman)...");
  await buildQuestions(pool, surveyId);

  // Verifikasi
  const qCount = await pool
    .request()
    .input("surveyId", sql.UniqueIdentifier, surveyId)
    .query("SELECT COUNT(1) AS N FROM Questions WHERE SurveyId = @surveyId");

  console.log(`\n✅ Selesai!`);
  console.log(`   Survey ID : ${surveyId}`);
  console.log(`   Questions : ${qCount.recordset[0].N}`);
  console.log(`   URL       : http://localhost:3001/survey/${surveyId}`);
  console.log(`\nStruktur halaman:`);
  console.log(`   Page 1 — HeroCover (sumber hero image, tidak tampil sebagai question)`);
  console.log(`            → setelah filter: Page 1 = Data Diri`);
  console.log(`   Page 2 — Data Diri (Nama, BU, Divisi, Dept, Function, NPK, Email)`);
  console.log(`   Page 3 — Pilih Aplikasi + Rating Likert per app (komentar per statement, wajib jika < 7)`);
  console.log(`   Page 4 — Tanda Tangan`);

  await db.close();
}

run()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("\n❌ Gagal:", error.message);
    await db.close().catch(() => {});
    process.exit(1);
  });
