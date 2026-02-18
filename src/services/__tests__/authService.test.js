const authService = require('../authService');
const ldapService = require('../ldapService');
const db = require('../../database/connection');

// Mock dependencies
jest.mock('../ldapService');
jest.mock('../../database/connection');
jest.mock('../../config/logger');

describe('AuthService', () => {
  let mockPool;
  let mockRequest;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock database
    mockRequest = {
      input: jest.fn().mockReturnThis(),
      query: jest.fn()
    };

    mockPool = {
      request: jest.fn().mockReturnValue(mockRequest)
    };

    db.getPool = jest.fn().mockResolvedValue(mockPool);
    db.sql = {
      VarChar: 'VarChar',
      UniqueIdentifier: 'UniqueIdentifier',
      DateTime: 'DateTime'
    };
  });

  describe('login', () => {
    it('should successfully login with LDAP credentials', async () => {
      // Mock user from database
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          UserId: '123e4567-e89b-12d3-a456-426614174000',
          Username: 'testuser',
          DisplayName: 'Test User',
          Email: 'test@example.com',
          Role: 'AdminEvent',
          IsActive: 1,
          UseLDAP: true,
          PasswordHash: null
        }]
      });

      // Mock LDAP authentication
      ldapService.authenticate.mockResolvedValue({
        success: true,
        user: {
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com'
        }
      });

      // Mock session creation (invalidate old sessions)
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      // Mock session creation (insert new session)
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{ SessionId: '456e4567-e89b-12d3-a456-426614174000' }]
      });

      const result = await authService.login('testuser', 'password123', '127.0.0.1', 'test-agent');

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.username).toBe('testuser');
      expect(result.user.role).toBe('AdminEvent');
      expect(ldapService.authenticate).toHaveBeenCalledWith('testuser', 'password123');
    });

    it('should fail login with invalid credentials', async () => {
      // Mock user from database
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          UserId: '123e4567-e89b-12d3-a456-426614174000',
          Username: 'testuser',
          DisplayName: 'Test User',
          Email: 'test@example.com',
          Role: 'AdminEvent',
          IsActive: 1,
          UseLDAP: true,
          PasswordHash: null
        }]
      });

      // Mock LDAP authentication failure
      ldapService.authenticate.mockResolvedValue({
        success: false,
        errorMessage: 'Invalid username or password'
      });

      const result = await authService.login('testuser', 'wrongpassword', '127.0.0.1', 'test-agent');

      expect(result.success).toBe(false);
      expect(result.token).toBeNull();
      expect(result.errorMessage).toBe('Invalid username or password');
    });

    it('should fail login for non-existent user', async () => {
      // Mock user not found
      mockRequest.query.mockResolvedValueOnce({
        recordset: []
      });

      const result = await authService.login('nonexistent', 'password123', '127.0.0.1', 'test-agent');

      expect(result.success).toBe(false);
      expect(result.token).toBeNull();
      expect(result.errorMessage).toBe('Invalid username or password');
    });

    it('should require username and password', async () => {
      const result = await authService.login('', '', '127.0.0.1', 'test-agent');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Username and password are required');
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      const jwt = require('jsonwebtoken');
      const config = require('../../config');

      // Create a valid token
      const token = jwt.sign(
        {
          sub: '123e4567-e89b-12d3-a456-426614174000',
          username: 'testuser',
          role: 'AdminEvent',
          email: 'test@example.com',
          type: 'access'
        },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

      // Mock session lookup
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          SessionId: '456e4567-e89b-12d3-a456-426614174000',
          UserId: '123e4567-e89b-12d3-a456-426614174000',
          LastActivity: new Date(),
          ExpiresAt: new Date(Date.now() + 3600000),
          MaxExpiresAt: new Date(Date.now() + 28800000),
          IsActive: 1
        }]
      });

      // Mock user lookup
      mockRequest.query.mockResolvedValueOnce({
        recordset: [{
          UserId: '123e4567-e89b-12d3-a456-426614174000',
          Username: 'testuser',
          DisplayName: 'Test User',
          Email: 'test@example.com',
          Role: 'AdminEvent',
          IsActive: 1,
          UseLDAP: true
        }]
      });

      // Mock session update
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      const result = await authService.validateToken(token);

      expect(result.isValid).toBe(true);
      expect(result.user.username).toBe('testuser');
    });

    it('should reject an expired token', async () => {
      const jwt = require('jsonwebtoken');
      const config = require('../../config');

      // Create an expired token
      const token = jwt.sign(
        {
          sub: '123e4567-e89b-12d3-a456-426614174000',
          username: 'testuser',
          role: 'AdminEvent',
          email: 'test@example.com',
          type: 'access'
        },
        config.jwt.secret,
        { expiresIn: '-1h' }
      );

      const result = await authService.validateToken(token);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Token has expired');
    });

    it('should reject an invalid token', async () => {
      const result = await authService.validateToken('invalid-token');

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Invalid token');
    });
  });

  describe('logout', () => {
    it('should successfully logout and invalidate session', async () => {
      const jwt = require('jsonwebtoken');
      const config = require('../../config');

      const token = jwt.sign(
        {
          sub: '123e4567-e89b-12d3-a456-426614174000',
          username: 'testuser',
          role: 'AdminEvent',
          email: 'test@example.com',
          type: 'access'
        },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

      // Mock session invalidation
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      const result = await authService.logout(token);

      expect(result).toBe(true);
      expect(mockRequest.query).toHaveBeenCalled();
    });
  });
});
