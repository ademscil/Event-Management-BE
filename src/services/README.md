# Authentication Service Implementation

This document describes the authentication service implementation for the CSI Portal.

## Overview

The authentication system provides secure user authentication using LDAP integration and JWT tokens, with comprehensive session management and role-based authorization.

## Components

### 1. LDAP Service (`ldapService.js`)

Handles LDAP authentication and user attribute retrieval.

**Features:**
- LDAP connection with retry logic for transient failures
- User credential validation against LDAP server
- User attribute retrieval (username, display name, email)
- Automatic retry on connection failures (up to 3 attempts)

**Key Functions:**
- `authenticate(username, password)` - Authenticate user with LDAP credentials
- `getUserAttributes(username)` - Retrieve user attributes from LDAP

**Configuration:**
- LDAP URL, Base DN, Bind DN, and Bind Password configured via environment variables
- See `.env.example` for required configuration

### 2. Auth Service (`authService.js`)

Manages JWT token generation, validation, and session management.

**Features:**
- Dual authentication support (LDAP and local password)
- JWT token generation with user claims
- Session management with database storage
- Token validation with automatic session extension
- Single session per user (previous sessions invalidated on new login)
- Session timeout (30 minutes inactivity) and max duration (8 hours)
- Refresh token support for seamless token renewal

**Key Functions:**
- `login(username, password, ipAddress, userAgent)` - Login and generate tokens
- `validateToken(token)` - Validate JWT token and extend session
- `logout(token)` - Invalidate session
- `refreshToken(refreshToken, ipAddress, userAgent)` - Refresh access token

**Session Management:**
- Sessions stored in database with token hash
- Automatic session extension on activity (sliding expiration)
- Maximum session duration enforced
- IP address and user agent tracking

### 3. Auth Middleware (`authMiddleware.js`)

Provides Express middleware for authentication and authorization.

**Features:**
- JWT token extraction from Authorization header
- Token validation middleware
- Role-based authorization middleware
- Permission-based authorization middleware
- Comprehensive permission matrix for all system resources

**Key Middleware:**
- `requireAuth` - Require valid authentication
- `requireRole(...roles)` - Require specific role(s)
- `requirePermission(permission)` - Require specific permission
- `optionalAuth` - Optional authentication (doesn't fail if no token)

**Predefined Middleware:**
- `requireSuperAdmin` - Super Admin only
- `requireAdminEvent` - Admin Event only
- `requireITLead` - IT Lead only
- `requireDepartmentHead` - Department Head only
- `requireAdminOrSuperAdmin` - Admin Event or Super Admin

**Roles:**
- `SuperAdmin` - System-wide management and user administration
- `AdminEvent` - Survey creation, approval management, master data management
- `ITLead` - Review and approve/reject proposed takeouts by function
- `DepartmentHead` - View reports and best comments (read-only)

### 4. Auth Controller (`authController.js`)

Handles HTTP requests for authentication endpoints.

**Endpoints:**
- `POST /api/auth/login` - Login with username and password
- `POST /api/auth/logout` - Logout and invalidate session
- `GET /api/auth/validate` - Validate current token
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user information

**Request Validation:**
- Input validation using express-validator
- Comprehensive error messages
- Security best practices (no sensitive data in error messages)

## Database Schema

### Sessions Table

```sql
CREATE TABLE Sessions (
    SessionId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserId UNIQUEIDENTIFIER NOT NULL,
    TokenHash NVARCHAR(255) NOT NULL UNIQUE,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    LastActivity DATETIME2 NOT NULL DEFAULT GETDATE(),
    ExpiresAt DATETIME2 NOT NULL,
    MaxExpiresAt DATETIME2 NOT NULL,
    IPAddress NVARCHAR(50) NULL,
    UserAgent NVARCHAR(500) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    InvalidatedAt DATETIME2 NULL,
    FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE
);
```

## Usage Examples

### Login

```javascript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'john.doe',
    password: 'password123'
  })
});

const data = await response.json();
// data.token - Access token
// data.refreshToken - Refresh token
// data.user - User information
```

### Protected Route

```javascript
const authRoutes = require('./middleware/authMiddleware');

// Require authentication
app.get('/api/protected', requireAuth, (req, res) => {
  // req.user contains authenticated user info
  res.json({ message: 'Protected resource', user: req.user });
});

// Require specific role
app.post('/api/admin', requireAuth, requireAdminEvent, (req, res) => {
  res.json({ message: 'Admin only resource' });
});

// Require specific permission
app.delete('/api/surveys/:id', requireAuth, requirePermission('surveys:delete'), (req, res) => {
  res.json({ message: 'Survey deleted' });
});
```

### Token Validation

```javascript
const response = await fetch('/api/auth/validate', {
  method: 'GET',
  headers: { 
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
// data.valid - true/false
// data.user - User information if valid
```

### Token Refresh

```javascript
const response = await fetch('/api/auth/refresh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    refreshToken: refreshToken
  })
});

const data = await response.json();
// data.token - New access token
// data.refreshToken - New refresh token
```

## Security Features

1. **Password Security**
   - LDAP authentication for enterprise users
   - bcrypt hashing for local passwords
   - No passwords stored in plain text

2. **Token Security**
   - JWT tokens with expiration
   - Token hash stored in database (not full token)
   - Automatic token invalidation on logout
   - Single session per user

3. **Session Security**
   - Session timeout on inactivity (30 minutes)
   - Maximum session duration (8 hours)
   - IP address and user agent tracking
   - Automatic session extension on activity

4. **Authorization**
   - Role-based access control
   - Permission-based access control
   - Comprehensive permission matrix
   - Middleware-based enforcement

## Testing

### Unit Tests

```bash
npm test -- src/services/__tests__/authService.test.js
```

### Integration Tests

```bash
npm test -- src/controllers/__tests__/authController.integration.test.js
```

## Configuration

Required environment variables:

```env
# JWT Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=8h
JWT_REFRESH_EXPIRATION=7d

# LDAP Configuration
LDAP_URL=ldap://your-ldap-server:389
LDAP_BASE_DN=dc=example,dc=com
LDAP_BIND_DN=cn=admin,dc=example,dc=com
LDAP_BIND_PASSWORD=your-bind-password

# Session Configuration
SESSION_TIMEOUT_MINUTES=30
SESSION_MAX_DURATION_HOURS=8
```

## Requirements Satisfied

This implementation satisfies the following requirements:

- **Requirement 1.1**: LDAP authentication with JWT token generation
- **Requirement 1.2**: Invalid credentials rejection
- **Requirement 1.3**: JWT token validation and role verification
- **Requirement 1.4**: Four distinct roles support
- **Requirement 1.5**: JWT token expiration and re-authentication
- **Requirement 1.6**: Session invalidation on logout
- **Requirement 1.7**: Role-based UI element restriction
- **Requirement 1.8**: Unauthorized access denial
- **Requirement 29.1**: 8-hour session expiration
- **Requirement 29.2**: 30-minute inactivity timeout
- **Requirement 29.3**: Session extension on activity
- **Requirement 29.5**: Single session per user
- **Requirement 29.6**: Previous session invalidation on new login

## Next Steps

1. Implement Master Data Service (Task 5)
2. Add property-based tests for authentication (Tasks 3.2, 3.3, 3.5, 3.6, 3.8, 3.9)
3. Implement frontend authentication utilities
4. Add audit logging for authentication events
