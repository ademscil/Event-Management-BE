# CSI Portal — Database Diagram

> Database: SQL Server | Schema: dbo | Last updated: 23 Apr 2026

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          MASTER DATA                                            │
│                                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                   │
│  │ BusinessUnits│1───*│  Divisions   │1───*│ Departments  │                   │
│  │──────────────│     │──────────────│     │──────────────│                   │
│  │ BusinessUnitId PK  │ DivisionId PK│     │DepartmentId PK                  │
│  │ Code (UNIQUE)│     │BusinessUnitId FK   │ DivisionId FK│                   │
│  │ Name         │     │ Code (UNIQUE)│     │ Code (UNIQUE)│                   │
│  │ IsActive     │     │ Name         │     │ Name         │                   │
│  └──────────────┘     │ IsActive     │     │ IsActive     │                   │
│                        └──────────────┘     └──────┬───────┘                   │
│                                                     │*                          │
│  ┌──────────────┐     ┌──────────────┐             │                           │
│  │  Functions   │     │ Applications │             │                           │
│  │──────────────│     │──────────────│             │                           │
│  │ FunctionId PK│     │ApplicationId PK            │                           │
│  │ Code (UNIQUE)│     │ Code (UNIQUE)│             │                           │
│  │ Name         │     │ Name         │             │                           │
│  │ ITLeadUserId FK    │ Description  │             │                           │
│  │ DeptId FK    │     │ IsActive     │             │                           │
│  │ IsActive     │     └──────┬───────┘             │                           │
│  └──────┬───────┘            │                     │                           │
│         │                    │                     │                           │
└─────────┼────────────────────┼─────────────────────┼───────────────────────────┘
          │                    │                     │
          │    ┌───────────────┼─────────────────────┼──────────────────────────┐
          │    │               MAPPING TABLES         │                          │
          │    │                                      │                          │
          │    │  ┌────────────────────────────┐      │                          │
          │    │  │ FunctionApplicationMappings│      │                          │
          │    │  │────────────────────────────│      │                          │
          │*   │  │ MappingId PK               │      │                          │
          └────┼──│ FunctionId FK              │      │                          │
               │  │ ApplicationId FK           │      │                          │
               │  │ MappingNo (BIGINT seq)     │      │                          │
               │  └────────────────────────────┘      │                          │
               │                                      │                          │
               │  ┌────────────────────────────┐      │                          │
               │  │ApplicationDepartmentMappings│     │                          │
               │  │────────────────────────────│      │                          │
               │  │ MappingId PK               │      │                          │
               │  │ ApplicationId FK           │      │                          │
               │  │ DepartmentId FK            │──────┘                          │
               │  │ MappingNo (BIGINT seq)     │                                 │
               │  └────────────────────────────┘                                 │
               └─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                          USERS & AUTH                                           │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                              Users                                        │  │
│  │──────────────────────────────────────────────────────────────────────────│  │
│  │ UserId          UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()            │  │
│  │ Username        NVARCHAR(50)  UNIQUE                                      │  │
│  │ DisplayName     NVARCHAR(200)                                             │  │
│  │ Email           NVARCHAR(255)                                             │  │
│  │ Role            NVARCHAR(50)  CHECK IN (SuperAdmin, AdminEvent,           │  │
│  │                               ITLead, DepartmentHead)                     │  │
│  │ UseLDAP         BIT                                                       │  │
│  │ PasswordHash    NVARCHAR(255) NULL                                        │  │
│  │ NPK             NVARCHAR(50)  NULL                                        │  │
│  │ Phone           NVARCHAR(20)  NULL                                        │  │
│  │ DepartmentId    UNIQUEIDENTIFIER FK -> Departments                        │  │
│  │ DivisionId      UNIQUEIDENTIFIER FK -> Divisions                          │  │
│  │ BusinessUnitId  UNIQUEIDENTIFIER FK -> BusinessUnits                      │  │
│  │ IsActive        BIT                                                       │  │
│  │ CreatedAt       DATETIME2                                                 │  │
│  │ UpdatedAt       DATETIME2 NULL                                            │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│         │1                                                                      │
│         │                                                                       │
│  ┌──────┴───────────────────────────────────────────────────────────────────┐  │
│  │                             Sessions                                      │  │
│  │──────────────────────────────────────────────────────────────────────────│  │
│  │ SessionId       UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()            │  │
│  │ SessionNo       BIGINT (sequential, human-readable)                       │  │
│  │ UserId          UNIQUEIDENTIFIER FK -> Users                              │  │
│  │ TokenHash       NVARCHAR(255) UNIQUE                                      │  │
│  │ RefreshTokenHash NVARCHAR(255) NULL                                       │  │
│  │ CreatedAt       DATETIME2                                                 │  │
│  │ LastActivity    DATETIME2                                                 │  │
│  │ ExpiresAt       DATETIME2                                                 │  │
│  │ MaxExpiresAt    DATETIME2                                                 │  │
│  │ IsActive        BIT                                                       │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        PasswordResetTokens                                │  │
│  │──────────────────────────────────────────────────────────────────────────│  │
│  │ PasswordResetTokenId  UNIQUEIDENTIFIER PK                                 │  │
│  │ ResetTokenNo          BIGINT (sequential)                                 │  │
│  │ UserId                UNIQUEIDENTIFIER FK -> Users                        │  │
│  │ TokenHash             NVARCHAR(255) UNIQUE                                │  │
│  │ ExpiresAt             DATETIME2                                           │  │
│  │ IsUsed                BIT                                                 │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                          SURVEY / EVENT CORE                                    │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                         Events (alias: Surveys)                           │  │
│  │──────────────────────────────────────────────────────────────────────────│  │
│  │ SurveyId        UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()            │  │
│  │ SurveyNo        BIGINT (sequential, human-readable)                       │  │
│  │ Title           NVARCHAR(500)                                             │  │
│  │ Description     NVARCHAR(MAX) NULL                                        │  │
│  │ StartDate       DATETIME2 NULL                                            │  │
│  │ EndDate         DATETIME2 NULL                                            │  │
│  │ Status          NVARCHAR(50) CHECK IN (Draft, Active, Closed, Archived)   │  │
│  │ AssignedAdminId UNIQUEIDENTIFIER FK -> Users NULL                         │  │
│  │ TargetRespondents INT NULL                                                │  │
│  │ TargetScore     DECIMAL(5,2) NULL                                         │  │
│  │ SurveyLink      NVARCHAR(500) NULL                                        │  │
│  │ ShortenedLink   NVARCHAR(500) NULL                                        │  │
│  │ CreatedAt       DATETIME2                                                 │  │
│  │ CreatedBy       UNIQUEIDENTIFIER FK -> Users NULL                         │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│         │1                                                                      │
│         ├──────────────────────────────────────────────────────────────────┐   │
│         │                                                                   │   │
│  ┌──────┴───────────────────────────────────────────────────────────────┐  │   │
│  │              EventConfiguration (alias: SurveyConfiguration)         │  │   │
│  │──────────────────────────────────────────────────────────────────────│  │   │
│  │ ConfigId        UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()        │  │   │
│  │ ConfigNo        BIGINT (sequential)                                   │  │   │
│  │ SurveyId        UNIQUEIDENTIFIER FK -> Events UNIQUE                  │  │   │
│  │ HeroTitle       NVARCHAR(500) NULL                                    │  │   │
│  │ HeroImageUrl    NVARCHAR(500) NULL                                    │  │   │
│  │ LogoUrl         NVARCHAR(500) NULL                                    │  │   │
│  │ BackgroundColor NVARCHAR(50) NULL                                     │  │   │
│  │ PrimaryColor    NVARCHAR(50) NULL                                     │  │   │
│  │ FontFamily      NVARCHAR(100) NULL                                    │  │   │
│  │ ShowProgressBar BIT                                                   │  │   │
│  │ MultiPage       BIT                                                   │  │   │
│  └──────────────────────────────────────────────────────────────────────┘  │   │
│                                                                              │   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │   │
│  │                           Questions                                    │  │   │
│  │───────────────────────────────────────────────────────────────────────│  │   │
│  │ QuestionId      UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()         │  │   │
│  │ QuestionNo      BIGINT (sequential)                                    │  │   │
│  │ SurveyId        UNIQUEIDENTIFIER FK -> Events                          │  │   │
│  │ Type            NVARCHAR(50) CHECK IN (HeroCover, Text, MultipleChoice,│  │   │
│  │                  Checkbox, Dropdown, MatrixLikert, Rating, Date)        │  │   │
│  │ PromptText      NVARCHAR(MAX)                                           │  │   │
│  │ IsMandatory     BIT                                                     │  │   │
│  │ DisplayOrder    INT                                                     │  │   │
│  │ PageNumber      INT                                                     │  │   │
│  │ Options         NVARCHAR(MAX) NULL (JSON)                               │  │   │
│  └───────────────────────────────────────────────────────────────────────┘  │   │
│                                                                              │   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │   │
│  │                    EventAdminAssignments                               │  │   │
│  │───────────────────────────────────────────────────────────────────────│  │   │
│  │ SurveyId        UNIQUEIDENTIFIER FK -> Events                          │  │   │
│  │ AdminUserId     UNIQUEIDENTIFIER FK -> Users                           │  │   │
│  │ AssignmentNo    BIGINT (sequential)                                    │  │   │
│  │ AssignedAt      DATETIME2                                              │  │   │
│  └───────────────────────────────────────────────────────────────────────┘  │   │
│                                                                              │   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │   │
│  │                    ScheduledOperations                                 │◄─┘   │
│  │───────────────────────────────────────────────────────────────────────│      │
│  │ OperationId     UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()         │      │
│  │ OperationNo     BIGINT (sequential)                                    │      │
│  │ SurveyId        UNIQUEIDENTIFIER FK -> Events                          │      │
│  │ OperationType   NVARCHAR(50) CHECK IN (Blast, Reminder)                │      │
│  │ Frequency       NVARCHAR(50) CHECK IN (once, daily, weekly, monthly)   │      │
│  │ ScheduledDate   DATETIME2                                              │      │
│  │ Status          NVARCHAR(50) CHECK IN (Pending, Running, Completed,    │      │
│  │                  Failed, Cancelled)                                    │      │
│  │ NextExecutionAt DATETIME2 NULL                                         │      │
│  │ ExecutionCount  INT                                                    │      │
│  └───────────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                       RESPONSE & APPROVAL FLOW                                  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                            Responses                                      │  │
│  │──────────────────────────────────────────────────────────────────────────│  │
│  │ ResponseId      UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()            │  │
│  │ ResponseNo      BIGINT (sequential, human-readable)                       │  │
│  │ SurveyId        UNIQUEIDENTIFIER FK -> Events                             │  │
│  │ RespondentEmail NVARCHAR(255)                                             │  │
│  │ RespondentName  NVARCHAR(200)                                             │  │
│  │ BusinessUnitId  UNIQUEIDENTIFIER FK -> BusinessUnits                      │  │
│  │ DivisionId      UNIQUEIDENTIFIER FK -> Divisions                          │  │
│  │ DepartmentId    UNIQUEIDENTIFIER FK -> Departments                        │  │
│  │ ApplicationId   UNIQUEIDENTIFIER FK -> Applications                       │  │
│  │ ResponseApprovalStatus NVARCHAR(50) CHECK IN (                            │  │
│  │   Submitted, RejectedByAdmin, PendingITLead,                              │  │
│  │   PendingAdminTakeoutDecision, ApprovedFinal)                             │  │
│  │ AdminReviewedBy UNIQUEIDENTIFIER FK -> Users NULL                         │  │
│  │ ITLeadReviewedBy UNIQUEIDENTIFIER FK -> Users NULL                        │  │
│  │ SubmittedAt     DATETIME2                                                 │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│         │1                                                                      │
│         │*                                                                      │
│  ┌──────┴───────────────────────────────────────────────────────────────────┐  │
│  │                         QuestionResponses                                 │  │
│  │──────────────────────────────────────────────────────────────────────────│  │
│  │ QuestionResponseId UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()         │  │
│  │ QuestionResponseNo BIGINT (sequential)                                    │  │
│  │ ResponseId      UNIQUEIDENTIFIER FK -> Responses                          │  │
│  │ QuestionId      UNIQUEIDENTIFIER FK -> Questions                          │  │
│  │ TextValue       NVARCHAR(MAX) NULL                                        │  │
│  │ NumericValue    DECIMAL(10,2) NULL                                        │  │
│  │ CommentValue    NVARCHAR(MAX) NULL                                        │  │
│  │ TakeoutStatus   NVARCHAR(50) CHECK IN (Active, ProposedTakeout,           │  │
│  │                  TakenOut, Rejected)                                      │  │
│  │ TakeoutReason   NVARCHAR(MAX) NULL                                        │  │
│  │ IsBestComment   BIT                                                       │  │
│  │ ProposedBy      UNIQUEIDENTIFIER FK -> Users NULL                         │  │
│  │ ReviewedBy      UNIQUEIDENTIFIER FK -> Users NULL                         │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│         │1                                                                      │
│         ├──────────────────────────────────────────────────────────────────┐   │
│         │                                                                   │   │
│  ┌──────┴───────────────────────────────────────────────────────────────┐  │   │
│  │                        ApprovalHistory                                │  │   │
│  │──────────────────────────────────────────────────────────────────────│  │   │
│  │ HistoryId       UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()        │  │   │
│  │ HistoryNo       BIGINT (sequential)                                   │  │   │
│  │ QuestionResponseId FK -> QuestionResponses                            │  │   │
│  │ Action          NVARCHAR(50) CHECK IN (Proposed, Approved,            │  │   │
│  │                  Rejected, Cancelled)                                 │  │   │
│  │ PerformedBy     UNIQUEIDENTIFIER FK -> Users                          │  │   │
│  │ Reason          NVARCHAR(MAX) NULL                                    │  │   │
│  │ PreviousStatus  NVARCHAR(50) NULL                                     │  │   │
│  │ NewStatus       NVARCHAR(50)                                          │  │   │
│  │ PerformedAt     DATETIME2                                             │  │   │
│  └──────────────────────────────────────────────────────────────────────┘  │   │
│                                                                              │   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │   │
│  │                       BestCommentFeedback                              │◄─┘   │
│  │───────────────────────────────────────────────────────────────────────│      │
│  │ FeedbackId      UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()         │      │
│  │ FeedbackNo      BIGINT (sequential)                                    │      │
│  │ QuestionResponseId FK -> QuestionResponses                             │      │
│  │ ITLeadUserId    UNIQUEIDENTIFIER FK -> Users                           │      │
│  │ FeedbackText    NVARCHAR(MAX)                                          │      │
│  │ CreatedAt       DATETIME2                                              │      │
│  │ UpdatedAt       DATETIME2 NULL                                         │      │
│  └───────────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                          LOGGING & AUDIT                                        │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                            AuditLogs                                      │  │
│  │──────────────────────────────────────────────────────────────────────────│  │
│  │ LogId           UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()            │  │
│  │ LogNo           BIGINT (sequential, human-readable)                       │  │
│  │ Timestamp       DATETIME2                                                 │  │
│  │ UserId          UNIQUEIDENTIFIER FK -> Users NULL                         │  │
│  │ Username        NVARCHAR(50) NULL                                         │  │
│  │ Action          NVARCHAR(50) CHECK IN (Create, Update, Delete, Access,    │  │
│  │                  Login, Logout, LoginFailed, Approve, Reject, Export)     │  │
│  │ EntityType      NVARCHAR(100) NULL                                        │  │
│  │ EntityId        UNIQUEIDENTIFIER NULL                                     │  │
│  │ OldValues       NVARCHAR(MAX) NULL (JSON)                                 │  │
│  │ NewValues       NVARCHAR(MAX) NULL (JSON)                                 │  │
│  │ IPAddress       NVARCHAR(50) NULL                                         │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                             EmailLogs                                     │  │
│  │──────────────────────────────────────────────────────────────────────────│  │
│  │ EmailLogId      UNIQUEIDENTIFIER PK  DEFAULT NEWSEQUENTIALID()            │  │
│  │ EmailNo         BIGINT (sequential)                                       │  │
│  │ SurveyId        UNIQUEIDENTIFIER FK -> Events NULL                        │  │
│  │ RecipientEmail  NVARCHAR(255)                                             │  │
│  │ Subject         NVARCHAR(500)                                             │  │
│  │ EmailType       NVARCHAR(50) CHECK IN (Blast, Reminder, Notification)     │  │
│  │ Status          NVARCHAR(50) CHECK IN (Sent, Failed, Pending)             │  │
│  │ SentAt          DATETIME2                                                 │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Approval Flow

```
Respondent Submit
      │
      ▼
Responses.ResponseApprovalStatus = "Submitted"
      │
      ▼
AdminEvent Review (Approval Admin)
      ├── Reject  → ResponseApprovalStatus = "RejectedByAdmin"
      └── Approve → ResponseApprovalStatus = "PendingITLead"
                          │
                          ▼
                   ITLead Review (Approval IT Lead)
                          ├── Approve Final → ResponseApprovalStatus = "ApprovedFinal"
                          └── Propose Takeout
                                    │
                                    ▼
                             QuestionResponses.TakeoutStatus = "ProposedTakeout"
                             ResponseApprovalStatus = "PendingAdminTakeoutDecision"
                                    │
                             AdminEvent Decision
                                    ├── Approve Takeout → TakeoutStatus = "TakenOut"
                                    │                     ResponseApprovalStatus = "ApprovedFinal"
                                    └── Reject Takeout  → TakeoutStatus = "Rejected"
                                                          ResponseApprovalStatus = "ApprovedFinal"
```

---

## Index Summary

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| Users | IX_Users_Username | Username | Login lookup |
| Users | IX_Users_Role | Role | Role filter |
| Events | IX_Events_Status_Dates | Status, StartDate, EndDate | Dashboard filter |
| Responses | IX_Responses_Survey_Status_Date | SurveyId, ResponseApprovalStatus, SubmittedAt | Report query |
| QuestionResponses | IX_QuestionResponses_Response_Takeout | ResponseId, TakeoutStatus | Approval query |
| QuestionResponses | IX_QuestionResponses_BestComment | IsBestComment, TakeoutStatus | Best comments |
| AuditLogs | IX_AuditLogs_Action_Timestamp | Action, Timestamp DESC | Audit filter |
| AuditLogs | IX_AuditLogs_Entity_Lookup | EntityType, EntityId | Detail lookup |
| Sessions | IX_Sessions_Cleanup | IsActive, ExpiresAt | Session cleanup |
| ScheduledOperations | IX_ScheduledOperations_Processor | Status, NextExecutionAt | Scheduler |
| FunctionApplicationMappings | IX_FuncAppMap_AppId_FuncId | ApplicationId, FunctionId | Approval routing |
| ApplicationDepartmentMappings | IX_AppDeptMap_DeptId_AppId | DepartmentId, ApplicationId | App selection |

---

## UUID Strategy

- **Primary Keys**: `UNIQUEIDENTIFIER` dengan `DEFAULT NEWSEQUENTIALID()`
  - Sequential UUID — tidak random, terurut berdasarkan waktu
  - Aman untuk clustered index (tidak menyebabkan page fragmentation)
- **Human-readable IDs**: Setiap tabel transaksional memiliki kolom `*No` (BIGINT sequential)
  - Contoh: `SurveyNo`, `ResponseNo`, `QuestionResponseNo`
  - Digunakan untuk referensi di UI dan laporan
