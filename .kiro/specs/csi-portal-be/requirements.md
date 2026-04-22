# Requirements — CSI Portal (BE)

## Konteks Proyek

Backend untuk CSI Portal — Node.js + Express + MSSQL.
Melayani FE Next.js via REST API di path `/api/v1/`.

---

## Stack Aktual

| Layer | Teknologi |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express 4.x |
| Database | SQL Server (mssql + tedious) |
| Auth | JWT (jsonwebtoken) + LDAP (ldapjs) |
| Logging | Winston |
| Email | Nodemailer + EJS templates |
| Export | ExcelJS (Excel), PDFKit (PDF) |
| QR Code | qrcode |
| Scheduler | node-cron |
| Testing | Jest + fast-check (PBT) + supertest |
| Security | Helmet, CORS, express-rate-limit, express-validator |

---

## Roles & Permissions

| Role | Kode | Permission utama |
|------|------|-----------------|
| Super Admin | `SuperAdmin` | users:*, audit:read |
| Admin Event | `AdminEvent` | surveys:*, master-data:*, mappings:*, reports:*, approvals:*, best-comments:*, emails:send |
| IT Lead | `ITLead` | approvals:read/approve/reject, best-comments:read/feedback, reports:read |
| Department Head | `DepartmentHead` | reports:read, best-comments:read |

---

## Modul & Status

### A. Auth
- [x] Login (LDAP + password manual fallback)
- [x] JWT token generation + httpOnly cookie
- [x] Session validation (`GET /auth/validate`)
- [x] Logout + token invalidation
- [x] Forgot password (email/phone OTP)
- [x] Reset password
- [x] Token refresh
- [x] Rate limiting login (5 attempts/15 min)
- [x] Rate limiting password reset (5 attempts/1 jam)

### B. Master Data
- [x] Users — CRUD, LDAP toggle, set password, bulk upload (Excel/CSV), download template, download list
- [x] Business Units — CRUD, status toggle
- [x] Divisions — CRUD, relasi ke BU
- [x] Departments — CRUD, relasi ke Division
- [x] Functions — CRUD
- [x] Applications — CRUD
- [x] Public endpoints (no auth): BU, Division, Department, Function untuk form responden

### C. Mapping
- [x] Function → Application (CRUD, export CSV, get by function/application)
- [x] Application → Department (CRUD, export CSV, hierarchical view, get by dept/app)
- [x] Bulk import mapping via Excel
- [x] Alias endpoints: `/mappings/function-app/details`, `/mappings/app-dept/hierarchical`

### D. Survey / Event
- [x] CRUD survey event (title, desc, start/end date, status, target respondents/score)
- [x] Dual endpoint: `/surveys/:id` dan `/events/:id` (alias, backward compat)
- [x] Update survey config (hero, logo, background, colors, font, progress bar, multi-page)
- [x] Generate survey link (dengan opsi shorten URL)
- [x] Generate QR code (data URL)
- [x] Generate embed code (iframe)
- [x] Schedule blast (once/daily/weekly/monthly)
- [x] Schedule reminder (once/daily/weekly/monthly)
- [x] List scheduled operations per survey
- [x] Cancel scheduled operation
- [x] Upload hero image, logo, background image
- [x] Preview survey

### E. Questions
- [x] CRUD questions per survey
- [x] Semua tipe: Text, Dropdown, Rating, MatrixLikert, Date, HeroCover, MultipleChoice, Checkbox
- [x] Reorder questions
- [x] Upload question image
- [x] Upload option image (per index)

### F. Responses (Public)
- [x] Get survey form (no auth)
- [x] Get available applications by department (no auth)
- [x] Check duplicate response (no auth)
- [x] Submit response (no auth) — validasi mandatory, comment threshold, duplicate prevention
- [x] Get responses (admin, dengan filter)
- [x] Get response statistics per survey

### G. Approvals
- [x] Propose takeout per question (Admin Event)
- [x] Bulk propose takeout
- [x] Cancel proposed takeout
- [x] Approve initial responses (Admin Event)
- [x] Reject initial responses (Admin Event)
- [x] Approve final responses (IT Lead)
- [x] Approve/reject proposed takeout (IT Lead)
- [x] Get pending approvals (IT Lead, filtered by function)
- [x] Get respondents (dengan duplicate filter: all/duplicate/unique)
- [x] Get proposed takeouts

### H. Best Comments
- [x] Get comments for selection
- [x] Mark/unmark best comment
- [x] Get best comments
- [x] Get best comments with IT Lead feedback
- [x] Submit IT Lead feedback

### I. Reports
- [x] Generate report (POST, simpan ke DB)
- [x] View report (POST, baca dari DB)
- [x] Before/after takeout report
- [x] Report selection list (list surveys dengan metadata)
- [x] Takeout comparison table (before vs after per question)
- [x] Department Head review
- [x] Scores by function
- [x] Approved takeouts by department
- [x] Export Excel (exceljs)
- [x] Export PDF (pdfkit)
- [x] Aggregate statistics

### J. Email
- [x] Send survey blast (dengan target criteria)
- [x] Get target recipients
- [x] Send reminders (ke non-respondents)
- [x] Get non-respondents
- [x] Approval/rejection notification emails
- [x] EJS email templates
- [x] Scheduled operations processor (node-cron)

### K. Audit Trail
- [x] Log semua state-changing operations (middleware global)
- [x] Log auth attempts
- [x] Get audit logs (dengan filter: date, user, action, entity)
- [x] Get entity history

### L. SAP Integration — POST GO LIVE
- [x] Manual trigger sync, status, history, test connection _(endpoint tersedia)_
- [ ] Scheduled auto-sync — **dikerjakan setelah Go Live**

### M. Infrastructure
- [x] Database migrations (SQL scripts)
- [x] Database seeding (initial data)
- [x] Database backup/restore scripts
- [x] Health check endpoint (`/health`, `/api/v1/health`)
- [x] Swagger/OpenAPI docs (`/api-docs`)
- [x] Short URL redirect (`/s/:shortCode`)
- [x] Static file serving (public/admin, public/survey, public/uploads)
- [x] Security middleware (Helmet, CORS, rate limit, XSS protection, SQL injection protection)
- [x] Winston logging (app.log, error.log, exceptions.log)

---

## Known Issues / Belum Diverifikasi

1. **cancelScheduledOperation** — FE memanggil `/surveys/scheduled-operations/:id` (DELETE), BE sudah ada route ini. Perlu verifikasi apakah response shape konsisten
2. **Email blast actual sending** — Scheduled operations processor ada, tapi belum dikonfirmasi email benar-benar terkirim di environment aktual
3. **LDAP integration** — Kode ada, tapi belum ditest dengan LDAP server PT Astra yang aktual
4. **SAP sync scheduled** — Manual trigger sudah ada, tapi auto-schedule (cron) belum dikonfigurasi
5. **PDF export** — Menggunakan pdfkit, belum ditest dengan data real yang besar
6. **Duplicate prevention** — Logic ada di responseService, belum ditest skenario concurrent submission
7. **Token refresh** — Route ada (`POST /auth/refresh`), belum ditest apakah FE menggunakannya
8. **Report generate race condition** — Jika generate lambat, FE mungkin cek `hasGeneratedReport` sebelum BE selesai update flag
