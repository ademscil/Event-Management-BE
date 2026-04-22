# CSI Schema Identifier Audit

Tanggal audit: 2026-04-06

## Prinsip

- `UNIQUEIDENTIFIER` dipertahankan sebagai internal primary key.
- Identifier pendek dipakai untuk kebutuhan bisnis, operasional, dan tampilan UI.
- Tidak semua tabel perlu business identifier.
- Tabel transaksi, audit, mapping, dan session umumnya tidak perlu short ID yang dilihat user.

## Keputusan standar

### 1. Master data

- `Users`
  - Internal key: `UserId`
  - Business identifier:
    - `Username` untuk login dan identifier operasional
    - `NPK` bila tersedia untuk identifier kepegawaian
  - Catatan: `UserId` tidak boleh diganti menjadi `Username` karena direferensikan luas oleh FK.

- `BusinessUnits`
  - Internal key: `BusinessUnitId`
  - Business identifier: `Code`

- `Divisions`
  - Internal key: `DivisionId`
  - Business identifier: `Code`

- `Departments`
  - Internal key: `DepartmentId`
  - Business identifier: `Code`

- `Functions`
  - Internal key: `FunctionId`
  - Business identifier: `Code`
  - Catatan: `Function` adalah ownership/service domain, bukan pengganti `Department`.

- `Applications`
  - Internal key: `ApplicationId`
  - Business identifier: `Code`

### 2. Survey / event domain

- `Events` / `Surveys`
  - Internal key: `SurveyId`
  - Human-facing identifier saat ini:
    - `Title`
    - `SurveyLink` / `ShortenedLink`
  - Catatan:
    - belum ada event number pendek yang formal
    - bila dibutuhkan ke depan, tambahkan `EventCode` atau `SurveyCode`

- `SurveyConfiguration`
  - Internal key: `ConfigId`
  - Tidak perlu business identifier

- `Questions`
  - Internal key: `QuestionId`
  - Tidak perlu business identifier umum
  - Human-facing reference cukup:
    - `PromptText`
    - `DisplayOrder`
    - `PageNumber`

- `Responses`
  - Internal key: `ResponseId`
  - Tidak perlu business identifier umum
  - Human-facing context:
    - `RespondentName`
    - `RespondentEmail`
    - `SubmittedAt`
    - `ApplicationId` / `ApplicationName`
  - Catatan:
    - response adalah record transaksi, bukan master

- `QuestionResponses`
  - Internal key: `QuestionResponseId`
  - Tidak perlu business identifier umum

- `SurveyPublishCycles` / `EventPublishCycles`
  - Internal key: `PublishCycleId`
  - Tidak perlu business identifier umum
  - Human-facing reference bisa memakai:
    - period publish
    - `GeneratedAt`
    - `PublishedAt`

- `SurveyAdminAssignments` / `EventAdminAssignments`
  - Composite reference:
    - `SurveyId`
    - `AdminUserId`
  - Tidak perlu short ID tambahan

### 3. Mapping tables

- `FunctionApplicationMappings`
  - Internal key: `MappingId`
  - Tidak perlu business identifier
  - Human-facing context:
    - `Function.Code`
    - `Application.Code`

- `ApplicationDepartmentMappings`
  - Internal key: `MappingId`
  - Tidak perlu business identifier
  - Human-facing context:
    - `Department.Code`
    - `Application.Code`

### 4. Operational / scheduling / approval

- `ScheduledOperations`
  - Internal key: `OperationId`
  - Tidak perlu business identifier

- `BestCommentFeedback`
  - Internal key: `FeedbackId`
  - Tidak perlu business identifier

- `ApprovalHistory`
  - Internal key: `HistoryId`
  - Tidak perlu business identifier

### 5. Audit / config / security

- `AuditLogs`
  - Internal key: `LogId`
  - Tidak perlu business identifier

- `EmailLogs`
  - Internal key: `EmailLogId`
  - Tidak perlu business identifier

- `Configuration`
  - Gunakan `ConfigKey` sebagai business identifier

- `Sessions`
  - Internal key: `SessionId`
  - Tidak perlu business identifier

- `PasswordResetTokens`
  - Internal key: `PasswordResetTokenId`
  - Tidak perlu business identifier

- `SAPSyncLogs`
  - Internal key: `SyncLogId`
  - Tidak perlu business identifier

## Temuan penting

### Sudah sesuai

- Semua master utama selain `Users` sudah punya `Code`.
- `Users` sudah punya `Username` sebagai identifier bisnis.
- `Functions` sudah punya `ITLeadUserId`, sesuai ownership routing ke approval IT Lead.
- Banyak tabel operasional memang seharusnya tetap internal dan tidak perlu short ID.

### Masih kurang

- `Events` / `Surveys` belum punya kode bisnis pendek formal.
- Beberapa UI masih berpotensi menampilkan UUID jika payload mentah dipakai langsung.
- Belum ada aturan eksplisit bahwa UI harus menampilkan `Username` / `Code`, bukan PK internal.

## Fase migrasi yang disetujui

### Fase 1

- Tambahkan alternate key non-UUID di seluruh tabel.
- UUID lama tetap dipakai sebagai PK/FK internal.
- Gunakan existing business key bila sudah ada:
  - `Users.Username`
  - `BusinessUnits.Code`
  - `Divisions.Code`
  - `Departments.Code`
  - `Functions.Code`
  - `Applications.Code`
  - `EventTypes.Code`
  - `Configuration.ConfigKey`
- Untuk tabel lain, tambahkan nomor berurutan non-UUID:
  - `Surveys.SurveyNo`
  - `SurveyConfiguration.ConfigNo`
  - `Questions.QuestionNo`
  - `Responses.ResponseNo`
  - `QuestionResponses.QuestionResponseNo`
  - `FunctionApplicationMappings.MappingNo`
  - `ApplicationDepartmentMappings.MappingNo`
  - `ScheduledOperations.OperationNo`
  - `BestCommentFeedback.FeedbackNo`
  - `AuditLogs.LogNo`
  - `EmailLogs.EmailNo`
  - `ApprovalHistory.HistoryNo`
  - `Sessions.SessionNo`
  - `EventAdminAssignments.AssignmentNo`
  - `EventPublishCycles.PublishCycleNo`
  - `PasswordResetTokens.ResetTokenNo`
  - `SAPSyncLogs.SyncLogNo`

### Fase 2

- Tambah relasi paralel berbasis key baru.
- Ubah codebase ke dual-read dan dual-write.

### Fase 3

- Cutover PK/FK utama ke key non-UUID.
- Hapus UUID hanya setelah semua relasi dan test hijau.

## Perbaikan yang benar

### Jangan dilakukan

- Mengganti semua PK `UNIQUEIDENTIFIER` menjadi `Username` atau string pendek.
- Menggunakan `Username` sebagai FK lintas seluruh schema.

Alasan:

- `Users.UserId` direferensikan secara luas oleh banyak tabel transaksi, audit, approval, scheduling, mapping, dan session.
- Mengganti PK akan memaksa migrasi total FK dan codebase.
- Risiko corruption dan regression sangat tinggi.

### Harus dilakukan

- UI hanya menampilkan business identifier:
  - `Username`
  - `NPK`
  - `Code`
  - `Title`
- API response untuk kebutuhan UI sebaiknya selalu menyertakan label bisnis, bukan hanya UUID.
- Jika entitas belum punya identifier bisnis pendek, tambahkan alternate key baru di fase 1.

## Status implementasi

- Fase 1 sudah mulai diimplementasikan lewat migration:
  - `src/database/migrations/026_add_phase1_alternate_keys.sql`
- Migration ini bersifat additive:
  - menambah alternate key
  - backfill data existing
  - menambah unique index
  - menambah default/sequence untuk insert berikutnya
- Migration ini belum menghapus UUID lama.
- Fase 2 sudah mulai diimplementasikan di codebase backend untuk domain prioritas:
  - `Users`
  - `Surveys`
- Cakupan fase 2 yang sudah aktif:
  - endpoint user menerima `UserId` atau `Username`
  - endpoint survey menerima `SurveyId` atau `SurveyNo`
  - response auth dan master user menyertakan `UserKey`
  - response survey menyertakan `SurveyNo`
  - filter survey by assigned admin menerima `UserId` atau `Username`
- Cakupan fase 2 yang belum selesai:
  - dual-write FK paralel lintas seluruh tabel
  - cutover read/write path untuk domain selain `Users` dan `Surveys`

## Ringkasan

- `UserId` tidak perlu dan tidak boleh diganti menjadi `Username`.
- Solusi standar adalah dual identifier:
  - internal surrogate key = UUID
  - human-facing identifier = `Username`, `Code`, atau nomor referensi bisnis
- Untuk schema CSI saat ini, arah yang benar adalah merapikan business identifier exposure, bukan mengganti seluruh PK.
