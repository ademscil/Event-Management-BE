const request = require('supertest');
const express = require('express');
const authRoutes = require('../../routes/authRoutes');
const authService = require('../../services/authService');
const { requireAuth } = require('../../middleware/authMiddleware');

// Mock dependencies
jest.mock('../../services/authService');
jest.mock('../../config/logger');

describe('Auth API Integration Tests', () => {
  let app;

  beforeAll(() => {
    // Create Express app for testing
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return 200 and tokens on successful login', async () => {
      authService.login.mockResolvedValue({
        success: true,
        token: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          role: 'AdminEvent'
        },
        errorMessage: null
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBe('mock-access-token');
      expect(response.body.refreshToken).toBe('mock-refresh-token');
      expect(response.body.user.username).toBe('testuser');
    });

    it('should return 401 on invalid credentials', async () => {
      authService.login.mockResolvedValue({
        success: false,
        token: null,
        refreshToken: null,
        user: null,
        errorMessage: 'Invalid username or password'
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication failed');
      expect(response.body.message).toBe('Invalid username or password');
    });

    it('should return 400 on missing username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'password123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 on missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return 200 and new tokens on successful refresh', async () => {
      authService.refreshToken.mockResolvedValue({
        success: true,
        token: 'new-access-token',
        refreshToken: 'new-refresh-token',
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          role: 'AdminEvent'
        },
        errorMessage: null
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'valid-refresh-token'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBe('new-access-token');
    });

    it('should return 401 on invalid refresh token', async () => {
      authService.refreshToken.mockResolvedValue({
        success: false,
        token: null,
        refreshToken: null,
        user: null,
        errorMessage: 'Invalid refresh token'
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-token'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Token refresh failed');
    });

    it('should return 400 on missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return 200 on successful logout', async () => {
      authService.validateToken.mockResolvedValue({
        isValid: true,
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          role: 'AdminEvent'
        },
        errorMessage: null
      });

      authService.logout.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logged out successfully');
    });

    it('should return 401 on missing token', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('GET /api/auth/validate', () => {
    it('should return 200 and user info on valid token', async () => {
      authService.validateToken.mockResolvedValue({
        isValid: true,
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          role: 'AdminEvent'
        },
        errorMessage: null
      });

      const response = await request(app)
        .get('/api/auth/validate')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.user.username).toBe('testuser');
    });

    it('should return 401 on invalid token', async () => {
      authService.validateToken.mockResolvedValue({
        isValid: false,
        user: null,
        errorMessage: 'Invalid token'
      });

      const response = await request(app)
        .get('/api/auth/validate')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication failed');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user info', async () => {
      authService.validateToken.mockResolvedValue({
        isValid: true,
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          role: 'AdminEvent'
        },
        errorMessage: null
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.user.username).toBe('testuser');
      expect(response.body.user.role).toBe('AdminEvent');
    });
  });
});
