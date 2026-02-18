# Middleware Documentation

This directory contains all Express middleware for the CSI Portal application.

## Middleware Files

### 1. errorHandler.js
Global error handling middleware with custom error classes and consistent error responses.

**Features:**
- Custom error classes (ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, DatabaseError, ExternalServiceError)
- Automatic HTTP status code mapping
- Environment-aware error responses (detailed in dev, sanitized in production)
- Process-level error handlers (unhandledRejection, uncaughtException)
- Async error wrapper for route handlers

**Usage:**
```javascript
const { errorHandler, notFoundHandler, asyncHandler, ValidationError } = require('./middleware/errorHandler');

// In routes
app.get('/api/users', asyncHandler(async (req, res) => {
  // Errors are automatically caught and passed to error handler
  const users = await userService.getUsers();
  res.json(users);
}));

// Throw custom errors
throw new ValidationError('Invalid input', [{ field: 'email', message: 'Invalid format' }]);

// In app.js (must be last)
app.use(notFoundHandler);
app.use(errorHandler);
```

### 2. validators.js
Request validation middleware using express-validator.

**Features:**
- Comprehensive validation rules for all DTOs
- Reusable validation chains
- Automatic error formatting
- Type validation, format validation, range validation
- Custom validation rules

**Available Validators:**
- Authentication: validateLogin, validateRefreshToken
- Users: validateCreateUser, validateUpdateUser
- Master Data: validateCreateBusinessUnit, validateUpdateBusinessUnit, etc.
- Surveys: validateCreateSurvey, validateUpdateSurvey
- Questions: validateCreateQuestion
- Responses: validateSubmitResponse
- Approvals: validateProposeTakeout, validateApproveReject
- Email: validateSendBlast, validateScheduleOperation
- Reports: validateGenerateReport

**Usage:**
```javascript
const { validateCreateUser, validateUpdateUser } = require('./middleware/validators');

// In routes
router.post('/users', validateCreateUser, userController.createUser);
router.put('/users/:id', validateUpdateUser, userController.updateUser);
```

### 3. security.js
Security middleware for input sanitization and attack prevention.

**Features:**
- CSRF token generation and validation
- SQL injection prevention
- XSS protection (input sanitization)
- Content-Type validation
- Request size validation
- IP whitelist/blacklist
- Security headers
- File upload security

**Usage:**
```javascript
const { 
  csrfProtection, 
  xssProtection, 
  sqlInjectionProtection,
  fileUploadSecurity 
} = require('./middleware/security');

// In app.js (global)
app.use(xssProtection);
app.use(sqlInjectionProtection);

// In routes (specific)
router.post('/upload', fileUploadSecurity(['image/jpeg', 'image/png']), uploadController.upload);
router.post('/data', csrfProtection, dataController.create);
```

### 4. authMiddleware.js
Authentication and authorization middleware.

**Features:**
- JWT token validation
- Role-based access control (RBAC)
- Permission-based access control
- User context injection
- Optional authentication

**Available Middleware:**
- requireAuth - Require valid JWT token
- requireRole(...roles) - Require specific role(s)
- requirePermission(permission) - Require specific permission
- requireSuperAdmin - Require SuperAdmin role
- requireAdminEvent - Require AdminEvent role
- requireITLead - Require ITLead role
- requireDepartmentHead - Require DepartmentHead role
- optionalAuth - Validate token if present

**Usage:**
```javascript
const { requireAuth, requireRole, requirePermission } = require('./middleware/authMiddleware');

// Require authentication
router.get('/profile', requireAuth, userController.getProfile);

// Require specific role
router.post('/users', requireAuth, requireRole('SuperAdmin'), userController.createUser);

// Require permission
router.post('/surveys', requireAuth, requirePermission('surveys:create'), surveyController.create);
```

### 5. auditLogger.js
Automatic audit logging middleware.

**Features:**
- Automatic logging of state-changing operations
- Authentication attempt logging
- Logout logging
- Export logging
- IP address and user agent tracking
- Asynchronous logging (non-blocking)

**Usage:**
```javascript
const { auditLoggerMiddleware, auditAuthMiddleware, auditLogoutMiddleware } = require('./middleware/auditLogger');

// In app.js (global for all API routes)
app.use('/api/v1', auditLoggerMiddleware({
  skipPaths: ['/api/v1/auth/validate', '/api/v1/health'],
  logGetRequests: false
}));

// In auth routes (specific)
router.post('/login', auditAuthMiddleware, authController.login);
router.post('/logout', requireAuth, auditLogoutMiddleware, authController.logout);
```

## Middleware Order in app.js

The order of middleware is critical. Here's the recommended order:

```javascript
// 1. Security headers (helmet)
app.use(helmet({ ... }));

// 2. CORS
app.use(cors({ ... }));

// 3. Rate limiting
app.use('/api/', generalLimiter);
app.use('/api/v1/auth/login', authLimiter);

// 4. Additional security headers
app.use(securityHeaders);
app.use(requestSizeValidation());

// 5. Body parsing
app.use(express.json());
app.use(express.urlencoded());

// 6. Input sanitization
app.use(xssProtection);
app.use(sqlInjectionProtection);
app.use(contentTypeValidation);

// 7. Static files
app.use('/admin', express.static(...));

// 8. Request logging
app.use((req, res, next) => { logger.info(...); next(); });

// 9. Audit logging
app.use('/api/v1', auditLoggerMiddleware({ ... }));

// 10. Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
// ... other routes

// 11. 404 handler
app.use(notFoundHandler);

// 12. Error handler (MUST BE LAST)
app.use(errorHandler);
```

## Security Best Practices

### 1. Always use asyncHandler for async routes
```javascript
router.get('/users', asyncHandler(async (req, res) => {
  const users = await userService.getUsers();
  res.json(users);
}));
```

### 2. Always validate input
```javascript
router.post('/users', validateCreateUser, userController.createUser);
```

### 3. Always require authentication for protected routes
```javascript
router.get('/profile', requireAuth, userController.getProfile);
```

### 4. Use specific error classes
```javascript
if (!user) {
  throw new NotFoundError('User not found');
}

if (user.email !== req.body.email) {
  throw new AuthorizationError('Cannot modify other users');
}
```

### 5. Never expose sensitive information in errors
```javascript
// Bad
throw new Error(`Database connection failed: ${dbPassword}`);

// Good
throw new DatabaseError('Database connection failed');
```

## Testing Middleware

### Unit Testing
```javascript
const request = require('supertest');
const app = require('../app');

describe('Error Handler', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Route not found');
  });
});
```

### Integration Testing
```javascript
describe('Authentication Middleware', () => {
  it('should reject requests without token', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('should accept requests with valid token', async () => {
    const token = await getValidToken();
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
```

## Troubleshooting

### Common Issues

1. **Error: "Cannot set headers after they are sent"**
   - Cause: Multiple responses sent in middleware chain
   - Solution: Ensure only one res.json() or res.send() per request

2. **Error: "Validation failed" but no details**
   - Cause: handleValidationErrors not called after validation chain
   - Solution: Add handleValidationErrors at end of validation array

3. **Error: "User not authenticated" on protected routes**
   - Cause: requireAuth not applied before requireRole
   - Solution: Always use requireAuth before requireRole

4. **Rate limit not working**
   - Cause: Rate limiter applied after routes
   - Solution: Apply rate limiter before route definitions

5. **CSRF token invalid**
   - Cause: Token used more than once (one-time use)
   - Solution: Request new token for each state-changing operation

## Performance Considerations

1. **Audit logging is asynchronous** - doesn't block response
2. **Rate limiting uses in-memory store** - consider Redis for production
3. **CSRF tokens stored in memory** - consider Redis for production
4. **Input sanitization runs on every request** - minimal overhead
5. **Validation runs only on specified routes** - no global overhead

## Future Enhancements

1. Add Redis support for rate limiting and CSRF tokens
2. Add request ID tracking for distributed tracing
3. Add metrics collection (response times, error rates)
4. Add request/response compression
5. Add API versioning middleware
6. Add GraphQL support
7. Add WebSocket authentication
