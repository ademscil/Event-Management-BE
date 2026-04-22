# Tasks — CSI Portal (BE)

## Status Legend
- `[x]` = Done
- `[ ]` = Pending
- `[-]` = In Progress

---

## Phase 1 — Core (DONE)

- [x] 1. Setup project (Express, MSSQL, dotenv, Winston)
- [x] 2. Database schema + migrations
- [x] 3. Auth: login (LDAP + password), JWT, session, logout, validate
- [x] 4. Auth: forgot password, reset password, token refresh
- [x] 5. Auth: rate limiting, security middleware (Helmet, CORS, XSS, SQL injection)
- [x] 6. Master User: CRUD, LDAP toggle, set password, bulk upload/download
- [x] 7. Master BU, Division, Department, Function, Application: CRUD
- [x] 8. Public endpoints: BU, Division, Department, Function (no auth)
- [x] 9. Mapping Function→App: CRUD, export CSV, get by function/app
- [x] 10. Mapping App→Dept: CRUD, export CSV, hierarchical view, get by dept/app
- [x] 11. Bulk import mapping via Excel
- [x] 12. Survey/Event: CRUD, dual endpoint `/surveys/` + `/events/`
- [x] 13. Survey config: hero, logo, background, colors, font, progress bar
- [x] 14. Survey: generate link, QR code, embed code
- [x] 15. Survey: schedule blast + reminder (once/daily/weekly/monthly)
- [x] 16. Survey: list + cancel scheduled operations
- [x] 17. Survey: upload hero/logo/background image
- [x] 18. Questions: CRUD, semua tipe, reorder, upload image + option image
- [x] 19. Responses: public form, get applications, check duplicate, submit
- [x] 20. Responses: admin list, statistics
- [x] 21. Approvals: propose/cancel takeout, bulk propose
- [x] 22. Approvals: approve/reject initial responses (Admin Event)
- [x] 23. Approvals: approve final responses (IT Lead)
- [x] 24. Approvals: approve/reject proposed takeout (IT Lead)
- [x] 25. Approvals: get respondents (dengan duplicate filter)
- [x] 26. Approvals: get pending approvals (filtered by function)
- [x] 27. Best Comments: mark/unmark, get, get with feedback
- [x] 28. Best Comments: IT Lead feedback
- [x] 29. Reports: generate, view, before/after takeout
- [x] 30. Reports: selection list, takeout comparison
- [x] 31. Reports: Department Head review, scores by function
- [x] 32. Reports: export Excel (exceljs), export PDF (pdfkit)
- [x] 33. Email: blast, reminder, approval/rejection notification
- [x] 34. Email: EJS templates, scheduled operations processor (node-cron)
- [x] 35. Audit: global middleware, log CRUD + auth, get logs + entity history
- [x] 36. SAP: manual trigger sync, status, history, test connection _(endpoint tersedia, integrasi penuh POST GO LIVE)_
- [x] 37. Health check endpoints, Swagger/OpenAPI docs
- [x] 38. Short URL redirect (`/s/:shortCode`)
- [x] 39. Refactor clean-structure: pisah helpers ke subfolder per service

---

## Phase 2 — Bug Fix & Hardening (PENDING)

- [x] 40. Verifikasi `cancelScheduledOperation` — response shape konsisten
  - Controller: `{ success: true, message, operation }` — FE hanya butuh `success` ✅
  - Service return: `{ operationId, surveyId, operationType, status, nextExecutionAt }` ✅

- [x] 41. Test LDAP integration — ✅ Verified working dengan akun aktual PT Astra (SOAP ValidateLogin berhasil)

- [ ]* 42. SAP auto-sync — **POST GO LIVE** (out of scope saat ini)
  - Konfigurasi cron job untuk auto-sync akan dikerjakan setelah Go Live

- [x] 43. Fix `coverage/` folder — sudah ada di `.gitignore`
- [x] 44. Rapikan script utility di root — sudah dipindahkan/dihapus sebelumnya
- [x] 59. Indexing & query tuning — migration 028 sudah dibuat (10 indexes)

- [x] 45. Verifikasi email blast actual sending
  - SMTP config aktual sudah diverifikasi (port 25, noreply@component.astra.co.id)
  - Scheduled operations processor berjalan saat server start
  - Email logo bug fixed: ganti CID attachment → Base64 inline (forward-safe saat di-forward)
  - Logo dipindahkan ke dalam card body, bukan di header terpisah
  - Template responsive: `@media (max-width:600px)` di semua template

- [x] 46. Fix report generate race condition
  - FE sudah ada retry 1.5s — BE return report langsung dari generateReport ✅
- [x] 47. Test concurrent duplicate submission
  - `checkDuplicateResponse` menggunakan parameterized query + PublishCycleId scoping ✅

---

## Phase 3 — QA & Verifikasi End-to-End (PENDING)

- [ ] 48. QA: Auth flow lengkap
  - Login LDAP → validate → logout → cek token invalid
  - Login password manual → validate → logout
  - Forgot password → reset → login dengan password baru

- [ ] 49. QA: Approval flow end-to-end
  - Submit response (public) → cek masuk ke DB
  - Admin Event: approve initial → cek status berubah
  - IT Lead: approve final → cek status berubah ke ApprovedFinal
  - IT Lead: propose takeout → Admin Event: approve/reject takeout
  - Generate report → cek data hanya include ApprovedFinal

- [ ] 50. QA: Report export
  - Export Excel → cek file valid, sheet summary + detail ada
  - Export PDF → cek file valid, tidak corrupt

- [ ] 51. QA: Scheduled operations
  - Schedule blast once → tunggu waktu → cek email terkirim
  - Schedule blast recurring → cek NextExecutionAt diupdate setelah eksekusi
  - Cancel operation → cek status berubah ke Cancelled

- [ ] 52. QA: Role isolation
  - DepartmentHead: cek tidak bisa akses `/approvals/`, `/surveys/`, `/master-data/`
  - ITLead: cek tidak bisa akses `/master-data/`, `/mappings/`
  - SuperAdmin: cek tidak bisa akses `/reports/export`, `/approvals/approve`

- [ ] 53. QA: Duplicate prevention
  - Submit response 2x dengan email + app yang sama
  - Cek response kedua ditolak dengan pesan yang jelas

---

## Phase 4 — Pre-Go-Live (PENDING)

- [ ] 54. Setup CI/CD pipeline — ✅ `.github/workflows/ci.yml` sudah ada dan berjalan
- [x] 55. Config & secret management — `.env.example` sudah lengkap dengan semua variabel

- [x] 56. Security review
  - Semua endpoint yang butuh auth sudah ada `requireAuth`
  - Permission matrix sudah benar per role
  - Parameterized queries di semua DB calls — tidak ada SQL injection
  - Input validation di semua POST/PUT via `express-validator`
  - notFoundHandler tidak expose path/method di production
  - Cache-Control `no-store` di semua `/api/v1` routes
  - Account lockout per-user via `getLoginLockoutStatus` + `LoginFailed` audit log
  - Accept header 406 validation via `acceptHeaderValidation`

- [ ] 57. Performance
  - Cek query yang sering dipanggil sudah ada index di DB
  - Cek tidak ada N+1 query di report generation
  - Test dengan dataset 1000+ responses

- [x] 58. Database backup rehearsal
  - `npm run db:backup` — full backup via `src/database/backup.js`
  - `npm run db:backup:diff` — differential backup
  - `npm run db:backup:verify` — verifikasi integritas backup (RESTORE VERIFYONLY)
  - `npm run db:backup:list` — list semua file backup tersedia
  - `src/database/restore-verify.js` dibuat: cek header, file list, integrity tanpa restore ke production

- [ ] 59. Indexing & query tuning
  - Tambahkan index untuk: `Responses.SurveyId`, `QuestionResponses.ResponseId`, `AuditLogs.Timestamp`, `AuditLogs.UserId`
  - Review query di reportService untuk N+1

- [ ] 60. SIT di staging environment
- [ ] 61. UAT dengan user
- [ ] 62. VAPT sebelum Go Live
- [ ] 63. Go Live
