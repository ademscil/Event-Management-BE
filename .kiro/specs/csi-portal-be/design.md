# Design Document — CSI Portal (BE)

## Stack Aktual

| Layer | Teknologi |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express 4.x |
| Database | SQL Server via `mssql` + `tedious` |
| Auth | JWT + LDAP (ldapjs) |
| Logging | Winston |
| Testing | Jest + fast-check + supertest |

---

## Struktur Direktori

```
csi-dev-BE/
├── src/
│   ├── app.js                    # Express app setup, middleware, routes
│   ├── config/
│   │   ├── index.js              # Config dari .env
│   │   ├── logger.js             # Winston logger
│   │   └── security.js           # Helmet, CORS, rate limit config
│   ├── controllers/              # Route handlers (thin layer)
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── surveyController.js
│   │   ├── questionController.js
│   │   ├── responseController.js
│   │   ├── approvalController.js
│   │   ├── reportController.js
│   │   ├── mappingController.js
│   │   ├── emailController.js
│   │   ├── auditController.js
│   │   ├── integrationController.js
│   │   └── [master data controllers...]
│   ├── services/                 # Business logic
│   │   ├── authService.js
│   │   ├── ldapService.js
│   │   ├── userService.js
│   │   ├── surveyService.js
│   │   ├── responseService.js
│   │   ├── approvalService.js
│   │   ├── reportService.js
│   │   ├── emailService.js
│   │   ├── auditService.js
│   │   ├── mappingService.js
│   │   ├── scheduledOperationsProcessor.js
│   │   ├── sapClient.js
│   │   ├── sapSyncService.js
│   │   ├── baseRepository.js
│   │   ├── bulkImportService.js
│   │   ├── templateParser.js
│   │   └── [master data services...]
│   │   ├── approval-service/     # Refactored helpers
│   │   ├── auth-service/
│   │   ├── report-service/
│   │   ├── response-service/
│   │   └── survey-service/
│   ├── middleware/
│   │   ├── authMiddleware.js     # requireAuth, requirePermission
│   │   ├── auditLogger.js        # Global audit logging middleware
│   │   ├── errorHandler.js       # Global error handler + 404
│   │   ├── security.js           # XSS, SQL injection, content-type validation
│   │   └── validators.js         # express-validator schemas
│   ├── routes/
│   │   ├── apiRoutes.js          # Semua API routes
│   │   ├── authRoutes.js         # Auth routes
│   │   └── monitoringRoutes.js   # Health/monitoring
│   ├── database/
│   │   ├── connection.js         # MSSQL connection pool
│   │   ├── sql-client.js         # SQL type helpers
│   │   ├── migrate.js            # Migration runner
│   │   ├── seed.js               # Data seeding
│   │   └── migrations/           # SQL migration scripts
│   ├── utils/
│   │   ├── auditHelpers.js
│   │   └── passwordHash.js
│   └── templates/
│       └── email/                # EJS email templates
├── public/
│   ├── admin/                    # Static HTML mockup (legacy)
│   ├── survey/                   # Static survey HTML (legacy)
│   └── uploads/                  # Uploaded files (images)
├── docs/
│   ├── openapi.yaml              # OpenAPI spec
│   └── postman/                  # Postman collections
└── scripts/                      # Utility scripts (seed, switch-db)
```

---

## Auth Flow

```
POST /api/v1/auth/login
  → authController.login
  → authService.login(username, password)
    → ldapService.authenticate(username, password)  [jika useLDAP=true]
    → bcrypt.compare(password, hash)                [jika useLDAP=false]
  → JWT token generated (payload: userId, username, role, email)
  → Set httpOnly cookie: csi_token
  → Response: { success: true, user: { userId, username, role, ... } }

GET /api/v1/auth/validate
  → requireAuth middleware
  → Verify JWT dari cookie atau Authorization header
  → Response: { valid: true, user: {...} }
```

**Token storage:**
- JWT disimpan di httpOnly cookie (`csi_token`)
- FE juga bisa kirim via `Authorization: Bearer <token>` header
- Session data disimpan di DB (tabel Sessions) untuk invalidation

---

## Permission Matrix

```javascript
const PERMISSIONS = {
  SuperAdmin: [
    'users:read', 'users:create', 'users:update', 'users:delete',
    'audit:read', 'surveys:read', 'master-data:read'
  ],
  AdminEvent: [
    'surveys:*', 'master-data:*', 'mappings:*',
    'reports:read', 'reports:export',
    'approvals:read', 'responses:approve-initial', 'responses:reject-initial',
    'responses:propose-takeout',
    'best-comments:*', 'emails:send'
  ],
  ITLead: [
    'approvals:read', 'approvals:approve', 'approvals:reject',
    'responses:approve-final', 'responses:propose-takeout',
    'best-comments:read', 'best-comments:feedback',
    'reports:read'
  ],
  DepartmentHead: [
    'reports:read', 'best-comments:read'
  ]
}
```

---

## API Routes Summary

### Auth (`/api/v1/auth/`)
| Method | Path | Auth | Keterangan |
|--------|------|------|------------|
| POST | `/login` | No | Login |
| POST | `/logout` | Yes | Logout |
| GET | `/validate` | Yes | Validate session |
| POST | `/refresh` | No | Refresh token |
| GET | `/me` | Yes | Get current user |
| POST | `/forgot-password` | No | Request reset |
| POST | `/reset-password` | No | Reset password |

### Users (`/api/v1/users/`)
| Method | Path | Permission |
|--------|------|------------|
| GET | `/users` | users:read |
| POST | `/users` | users:create |
| GET | `/users/:id` | users:read |
| PUT | `/users/:id` | users:update |
| DELETE | `/users/:id` | users:delete (soft delete) |
| PATCH | `/users/:id/ldap` | users:update |
| PATCH | `/users/:id/password` | users:update |
| GET | `/users/template` | users:read |
| GET | `/users/download` | users:read |
| POST | `/users/upload` | users:create |

### Master Data (pattern sama untuk BU, Division, Department, Function, Application)
| Method | Path | Permission |
|--------|------|------------|
| GET | `/{entity}` | master-data:read |
| GET | `/{entity}/:id` | master-data:read |
| POST | `/{entity}` | master-data:create |
| PUT | `/{entity}/:id` | master-data:update |
| DELETE | `/{entity}/:id` | master-data:delete |

### Public (no auth)
| Method | Path |
|--------|------|
| GET | `/public/business-units` |
| GET | `/public/divisions` |
| GET | `/public/departments` |
| GET | `/public/functions` |

### Surveys/Events (dual endpoint)
| Method | Path | Permission |
|--------|------|------------|
| GET | `/events` | surveys:read |
| POST | `/events` | surveys:create |
| GET | `/events/:id` | surveys:read |
| PUT | `/events/:id` | surveys:update |
| DELETE | `/events/:id` | surveys:delete |
| PATCH | `/events/:id/config` | surveys:update |
| POST | `/events/:id/link` | surveys:read |
| POST | `/events/:id/qrcode` | surveys:read |
| POST | `/events/:id/schedule-blast` | surveys:update |
| POST | `/events/:id/schedule-reminder` | surveys:update |
| GET | `/events/:id/scheduled-operations` | surveys:read |
| DELETE | `/surveys/scheduled-operations/:opId` | surveys:update |

### Responses
| Method | Path | Auth |
|--------|------|------|
| GET | `/responses/survey/:id/form` | No |
| GET | `/responses/survey/:id/applications` | No |
| POST | `/responses/check-duplicate` | No |
| POST | `/responses` | No |
| GET | `/responses` | Yes (responses:read) |
| GET | `/responses/survey/:id/statistics` | Yes |

### Reports
| Method | Path | Permission |
|--------|------|------------|
| POST | `/reports/generate` | reports:read |
| POST | `/reports/view` | reports:read |
| GET | `/reports/selection-list` | reports:read |
| GET | `/reports/takeout-comparison/:surveyId` | reports:read |
| POST | `/reports/export/excel` | reports:export |
| POST | `/reports/export/pdf` | reports:export |

### Approvals
| Method | Path | Permission |
|--------|------|------------|
| GET | `/approvals/respondents` | approvals:read |
| POST | `/approvals/respondents/approve` | responses:approve-initial |
| POST | `/approvals/respondents/reject` | responses:reject-initial |
| POST | `/approvals/respondents/final-approve` | responses:approve-final |
| GET | `/approvals/pending` | approvals:read |
| GET | `/approvals/proposed-takeouts` | approvals:read |
| POST | `/approvals/propose-takeout` | responses:propose-takeout |
| POST | `/approvals/approve` | approvals:approve |
| POST | `/approvals/reject` | approvals:reject |
| GET | `/approvals/comments` | best-comments:read |
| POST | `/approvals/best-comments` | best-comments:create |
| DELETE | `/approvals/best-comments` | best-comments:delete |
| GET | `/approvals/best-comments` | best-comments:read |
| GET | `/approvals/best-comments-with-feedback` | best-comments:read |
| POST | `/approvals/best-comments/feedback` | best-comments:feedback |

---

## Database Schema (Tabel Utama)

```sql
-- Auth
Users (UserId, Username, NPK, DisplayName, Email, PhoneNumber, PasswordHash, Role, 
       UseLDAP, IsActive, BusinessUnitId, DivisionId, DepartmentId, CreatedAt, UpdatedAt)
Sessions (SessionId, UserId, TokenHash, ExpiresAt, CreatedAt, IsRevoked)

-- Master Data
BusinessUnits (BusinessUnitId, Code, Name, IsActive, CreatedAt, UpdatedAt)
Divisions (DivisionId, BusinessUnitId, Code, Name, IsActive, CreatedAt, UpdatedAt)
Departments (DepartmentId, DivisionId, Code, Name, IsActive, CreatedAt, UpdatedAt)
Functions (FunctionId, Code, Name, IsActive, CreatedAt, UpdatedAt)
Applications (ApplicationId, Code, Name, Description, IsActive, CreatedAt, UpdatedAt)

-- Mapping
FunctionApplicationMappings (MappingId, FunctionId, ApplicationId, CreatedAt)
ApplicationDepartmentMappings (MappingId, ApplicationId, DepartmentId, CreatedAt)

-- Survey
Surveys (SurveyId, Title, Description, StartDate, EndDate, Status, 
         AssignedAdminId, TargetRespondents, TargetScore,
         SurveyLink, ShortenedLink, QRCodeDataUrl, EmbedCode,
         DuplicatePreventionEnabled, CreatedAt, UpdatedAt)
SurveyConfiguration (ConfigId, SurveyId, HeroTitle, HeroSubtitle, HeroImageUrl,
                     LogoUrl, BackgroundColor, BackgroundImageUrl,
                     PrimaryColor, SecondaryColor, FontFamily, ButtonStyle,
                     ShowProgressBar, ShowPageNumbers, MultiPage)
Questions (QuestionId, SurveyId, Type, PromptText, Subtitle, ImageUrl,
           IsMandatory, DisplayOrder, PageNumber, LayoutOrientation,
           OptionsJson, CommentRequiredBelowRating, CreatedBy, CreatedAt, UpdatedAt)

-- Responses
Responses (ResponseId, SurveyId, RespondentEmail, RespondentName,
           BusinessUnitId, DivisionId, DepartmentId, ApplicationId,
           ResponseApprovalStatus, SubmittedAt, IPAddress)
QuestionResponses (QuestionResponseId, ResponseId, QuestionId,
                   TextValue, NumericValue, DateValue, MatrixValues, CommentValue,
                   TakeoutStatus, TakeoutReason, ProposedAt, ProposedBy,
                   ApprovedAt, ApprovedBy, RejectedAt, RejectedBy)

-- Operations
ScheduledOperations (OperationId, SurveyId, OperationType, Status,
                     ScheduledDate, ScheduledTime, DayOfWeek, Frequency,
                     EmailTemplate, TargetCriteriaJson, EmbedCoverInEmail,
                     NextExecutionAt, LastExecutedAt, CreatedAt)

-- Best Comments
BestCommentFeedback (FeedbackId, ResponseId, QuestionId, ITLeadUserId,
                     FeedbackText, CreatedAt)

-- Audit
AuditLogs (LogId, Timestamp, UserId, Username, Action, EntityType, EntityId,
           OldValues, NewValues, IPAddress, UserAgent)
```

---

## Pola Service Layer

Semua business logic ada di `src/services/`. Controllers hanya handle request/response parsing.

```javascript
// Pattern standar service function
async function doSomething(input) {
  try {
    const pool = await db.getPool();
    const result = await pool.request()
      .input('param', sql.NVarChar, input.value)
      .query('SELECT ... WHERE Column = @param');
    
    return { success: true, data: result.recordset };
  } catch (error) {
    logger.error('doSomething error:', error);
    throw error; // Controller akan catch dan return 500
  }
}
```

**Refactored modules** (helpers dipindah ke subfolder):
- `src/services/approval-service/` — workflow helpers, cycle filter, access guard
- `src/services/auth-service/` — phone/token OTP helpers
- `src/services/report-service/` — Excel style helpers, score formatters
- `src/services/response-service/` — mandatory validation helpers
- `src/services/survey-service/` — question/image validators

---

## Catatan Inkonsistensi yang Ditemukan

### 1. Dual endpoint `/surveys/` vs `/events/`
BE sudah handle keduanya via alias routes. Tapi `cancelScheduledOperation` hanya ada di `/surveys/scheduled-operations/:id`, tidak ada alias `/events/`. FE sudah pakai path yang benar.

### 2. `public/admin/` dan `public/survey/` — legacy HTML
Folder ini berisi HTML mockup statis yang masih di-serve oleh BE. Tidak dipakai oleh FE Next.js, tapi masih ada. Bisa dihapus setelah Go Live jika tidak diperlukan.

### 3. `create-database.js`, `create-test-users.js`, `insert-test-users.js` di root
File-file ini adalah script utility yang seharusnya ada di `scripts/` atau `src/database/`. Tidak berbahaya tapi perlu dirapikan.

### 4. Multiple `.env` files
Ada `.env`, `.env.development`, `.env.development.localdb`, `.env.development.office`, `.env.production`, `.env.staging`. Perlu dipastikan `.env` yang aktif sudah benar sebelum deploy.

### 5. `coverage/` folder di-commit
Folder coverage test ada di repo. Seharusnya di `.gitignore`.
