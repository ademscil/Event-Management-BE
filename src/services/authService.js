const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../config/logger');
const ldapService = require('./ldapService');
const db = require('../database/connection');
const { verifyPassword } = require('../utils/passwordHash');

/**
 * @typedef {Object} LoginResult
 * @property {boolean} success - Whether login was successful
 * @property {string} token - JWT access token
 * @property {string} refreshToken - JWT refresh token
 * @property {UserInfo} user - User information
 * @property {string} errorMessage - Error message if login failed
 */

/**
 * @typedef {Object} UserInfo
 * @property {string} userId - User's database ID
 * @property {string} username - User's login name
 * @property {string} displayName - User's full display name
 * @property {string} email - User's email address
 * @property {string} role - User's role (SuperAdmin, AdminEvent, ITLead, DepartmentHead)
 */

/**
 * @typedef {Object} TokenValidationResult
 * @property {boolean} isValid - Whether token is valid
 * @property {UserInfo} user - User information from token
 * @property {string} errorMessage - Error message if validation failed
 */

/**
 * Authentication Service for login, logout, and token management
 */
class AuthService {
  constructor() {
    this.jwtSecret = config.jwt.secret;
    this.jwtExpiration = config.jwt.expiration;
    this.refreshExpiration = config.jwt.refreshExpiration;
    this.sessionTimeoutMinutes = config.session.timeoutMinutes;
    this.sessionMaxDurationHours = config.session.maxDurationHours;
    this.loginLockoutMaxAttempts = Number(config.security?.loginLockoutMaxAttempts || 5);
    this.loginLockoutWindowMinutes = Number(config.security?.loginLockoutWindowMinutes || 15);
    this.loginLockoutDurationMinutes = Number(config.security?.loginLockoutDurationMinutes || 15);
    this.passwordResetExpirationMinutes = Number(process.env.PASSWORD_RESET_EXPIRATION_MINUTES || 30);
  }

  normalizePhoneNumber(phoneNumber) {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    if (!digits) {
      return '';
    }

    if (digits.startsWith('62')) {
      return digits;
    }

    if (digits.startsWith('0')) {
      return `62${digits.slice(1)}`;
    }

    return digits;
  }

  /**
   * Get temporary lockout status based on recent failed login attempts.
   * Uses AuditLogs to avoid schema changes and keeps logic centralized.
   * @private
   * @param {string} username - Username attempting to login
   * @returns {Promise<{isLocked:boolean, failedCount:number, retryAfterMinutes:number}>}
   */
  async getLoginLockoutStatus(username) {
    const normalizedUsername = String(username || '').trim();
    if (!normalizedUsername) {
      return { isLocked: false, failedCount: 0, retryAfterMinutes: 0 };
    }

    if (this.loginLockoutMaxAttempts <= 0) {
      return { isLocked: false, failedCount: 0, retryAfterMinutes: 0 };
    }

    try {
      const pool = await db.getPool();
      const now = new Date();
      const windowStart = new Date(now.getTime() - this.loginLockoutWindowMinutes * 60 * 1000);
      const fallbackPast = new Date('1900-01-01T00:00:00.000Z');

      const result = await pool.request()
        .input('username', db.sql.NVarChar, normalizedUsername)
        .input('windowStart', db.sql.DateTime2, windowStart)
        .input('fallbackPast', db.sql.DateTime2, fallbackPast)
        .query(`
          WITH LastSuccess AS (
            SELECT TOP 1 [Timestamp] AS LastSuccessAt
            FROM AuditLogs
            WHERE Username = @username
              AND [Action] = 'Login'
            ORDER BY [Timestamp] DESC
          ),
          FailedWindow AS (
            SELECT [Timestamp]
            FROM AuditLogs
            WHERE Username = @username
              AND [Action] = 'LoginFailed'
              AND [Timestamp] >= @windowStart
              AND [Timestamp] > ISNULL((SELECT LastSuccessAt FROM LastSuccess), @fallbackPast)
          )
          SELECT
            COUNT(1) AS FailedCount,
            MAX([Timestamp]) AS LastFailedAt
          FROM FailedWindow
        `);

      const row = result.recordset?.[0] || {};
      const failedCount = Number(row.FailedCount || 0);
      const lastFailedAt = row.LastFailedAt ? new Date(row.LastFailedAt) : null;

      if (failedCount < this.loginLockoutMaxAttempts || !lastFailedAt) {
        return { isLocked: false, failedCount, retryAfterMinutes: 0 };
      }

      const lockoutUntil = new Date(lastFailedAt.getTime() + this.loginLockoutDurationMinutes * 60 * 1000);
      if (now >= lockoutUntil) {
        return { isLocked: false, failedCount, retryAfterMinutes: 0 };
      }

      const retryAfterMinutes = Math.max(
        1,
        Math.ceil((lockoutUntil.getTime() - now.getTime()) / 60000)
      );

      return { isLocked: true, failedCount, retryAfterMinutes };
    } catch (error) {
      logger.error('Failed to evaluate login lockout status:', error);
      return { isLocked: false, failedCount: 0, retryAfterMinutes: 0 };
    }
  }

  /**
   * Get user from database by username
   * @private
   * @param {string} username - Username to search for
   * @returns {Promise<Object>}
   */
  async getUserByUsername(username) {
    const pool = await db.getPool();
    const result = await pool.request()
      .input('username', db.sql.VarChar, username)
      .query(`
        SELECT 
          UserId, Username, DisplayName, Email, Role, 
          IsActive, UseLDAP, PasswordHash
        FROM Users
        WHERE Username = @username AND IsActive = 1
      `);

    if (result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0];
  }

  /**
   * Get user from database by ID
   * @private
   * @param {string} userId - User ID to search for
   * @returns {Promise<Object>}
   */
  async getUserById(userId) {
    const pool = await db.getPool();
    const result = await pool.request()
      .input('userId', db.sql.UniqueIdentifier, userId)
      .query(`
        SELECT 
          UserId, Username, DisplayName, Email, Role, 
          IsActive, UseLDAP
        FROM Users
        WHERE UserId = @userId AND IsActive = 1
      `);

    if (result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0];
  }

  /**
   * Authenticate user with password (non-LDAP users)
   * @private
   * @param {Object} user - User record from database
   * @param {string} password - Password to verify
   * @returns {Promise<boolean>}
   */
  async authenticateWithPassword(user, password) {
    if (!user.PasswordHash) {
      return false;
    }

    try {
      return await verifyPassword(password, user.PasswordHash);
    } catch (error) {
      logger.error('Password comparison error:', error);
      return false;
    }
  }

  async getLocalUserByRecovery(method, identifier) {
    const pool = await db.getPool();
    const normalizedMethod = String(method || '').trim().toLowerCase();
    const request = pool.request();

    let whereClause = '';
    if (normalizedMethod === 'phone') {
      const normalizedPhone = this.normalizePhoneNumber(identifier);
      if (!normalizedPhone) {
        return null;
      }
      whereClause = 'PhoneNumber = @identifier';
      request.input('identifier', db.sql.NVarChar, normalizedPhone);
    } else {
      const normalizedEmail = String(identifier || '').trim().toLowerCase();
      if (!normalizedEmail) {
        return null;
      }
      whereClause = 'LOWER(LTRIM(RTRIM(Email))) = @identifier';
      request.input('identifier', db.sql.NVarChar, normalizedEmail);
    }

    const result = await request.query(`
      SELECT TOP 1 UserId, Username, DisplayName, Email, PhoneNumber, UseLDAP, IsActive
      FROM Users
      WHERE ${whereClause}
        AND IsActive = 1
        AND UseLDAP = 0
    `);

    return result.recordset[0] || null;
  }

  hashOneTimeToken(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
  }

  async invalidateOutstandingResetTokens(userId) {
    const pool = await db.getPool();
    await pool.request()
      .input('userId', db.sql.UniqueIdentifier, userId)
      .query(`
        UPDATE PasswordResetTokens
        SET UsedAt = GETDATE()
        WHERE UserId = @userId
          AND UsedAt IS NULL
          AND ExpiresAt > GETDATE()
      `);
  }

  async requestPasswordReset(method, identifier, requestMeta = {}) {
    const normalizedMethod = String(method || 'email').trim().toLowerCase() === 'phone' ? 'phone' : 'email';
    const genericMessage = normalizedMethod === 'phone'
      ? 'Jika nomor telepon terdaftar untuk user local, link reset akan dikirim ke email akun yang terhubung.'
      : 'Jika email terdaftar untuk user local, link reset password akan dikirim.';

    try {
      const user = await this.getLocalUserByRecovery(normalizedMethod, identifier);
      if (!user || !user.Email) {
        return {
          success: true,
          message: genericMessage
        };
      }

      const crypto = require('crypto');
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = this.hashOneTimeToken(rawToken);
      const expiresAt = new Date(Date.now() + this.passwordResetExpirationMinutes * 60 * 1000);
      const pool = await db.getPool();
      const frontendBaseUrl = process.env.FRONTEND_BASE_URL
        || process.env.PUBLIC_SURVEY_BASE_URL
        || (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : process.env.BASE_URL)
        || 'http://localhost:3000';
      const resetLink = `${String(frontendBaseUrl).replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;

      await this.invalidateOutstandingResetTokens(user.UserId);

      await pool.request()
        .input('userId', db.sql.UniqueIdentifier, user.UserId)
        .input('tokenHash', db.sql.NVarChar, tokenHash)
        .input('requestedByMethod', db.sql.NVarChar, normalizedMethod)
        .input('requestedTo', db.sql.NVarChar, normalizedMethod === 'phone' ? (user.PhoneNumber || '') : user.Email)
        .input('expiresAt', db.sql.DateTime2, expiresAt)
        .input('createdByIp', db.sql.NVarChar, requestMeta.ipAddress || null)
        .query(`
          INSERT INTO PasswordResetTokens (
            UserId, TokenHash, RequestedByMethod, RequestedTo, ExpiresAt, CreatedByIp
          )
          VALUES (
            @userId, @tokenHash, @requestedByMethod, @requestedTo, @expiresAt, @createdByIp
          )
        `);

      const emailService = require('./emailService');
      const sendResult = await emailService.sendEmail({
        to: user.Email,
        subject: 'Reset Password CSI Web App',
        template: 'password-reset',
        data: {
          displayName: user.DisplayName || user.Username,
          resetLink,
          expiresInMinutes: this.passwordResetExpirationMinutes,
          requestMethod: normalizedMethod,
          maskedIdentifier: normalizedMethod === 'phone'
            ? (user.PhoneNumber || '')
            : user.Email
        },
        emailType: 'Notification'
      });

      if (!sendResult.success) {
        await pool.request()
          .input('tokenHash', db.sql.NVarChar, tokenHash)
          .query(`
            UPDATE PasswordResetTokens
            SET UsedAt = GETDATE()
            WHERE TokenHash = @tokenHash
              AND UsedAt IS NULL
          `);

        logger.error('Password reset email delivery failed', {
          userId: user.UserId,
          method: normalizedMethod,
          error: sendResult.error
        });

        return {
          success: false,
          message: 'Gagal mengirim link reset password. Silakan coba lagi.'
        };
      }

      logger.info('Password reset requested', {
        userId: user.UserId,
        method: normalizedMethod
      });

      return {
        success: true,
        message: genericMessage
      };
    } catch (error) {
      logger.error('Password reset request failed:', error);
      return {
        success: false,
        message: 'Gagal memproses permintaan reset password. Silakan coba lagi.'
      };
    }
  }

  async resetPassword(token, newPassword) {
    try {
      if (!token || !newPassword) {
        return {
          success: false,
          errorMessage: 'Token dan password baru wajib diisi'
        };
      }

      if (String(newPassword).length < 8) {
        return {
          success: false,
          errorMessage: 'Password baru minimal 8 karakter'
        };
      }

      const tokenHash = this.hashOneTimeToken(token);
      const pool = await db.getPool();
      const tokenResult = await pool.request()
        .input('tokenHash', db.sql.NVarChar, tokenHash)
        .query(`
          SELECT TOP 1 prt.PasswordResetTokenId, prt.UserId, prt.ExpiresAt, prt.UsedAt,
                 u.UseLDAP, u.IsActive
          FROM PasswordResetTokens prt
          INNER JOIN Users u ON u.UserId = prt.UserId
          WHERE prt.TokenHash = @tokenHash
          ORDER BY prt.CreatedAt DESC
        `);

      const tokenRow = tokenResult.recordset[0];
      if (!tokenRow) {
        return {
          success: false,
          errorMessage: 'Token reset password tidak valid'
        };
      }

      if (tokenRow.UsedAt) {
        return {
          success: false,
          errorMessage: 'Token reset password sudah digunakan'
        };
      }

      if (!tokenRow.IsActive || tokenRow.UseLDAP) {
        return {
          success: false,
          errorMessage: 'Reset password hanya berlaku untuk user local yang aktif'
        };
      }

      if (new Date(tokenRow.ExpiresAt) <= new Date()) {
        return {
          success: false,
          errorMessage: 'Token reset password sudah kedaluwarsa'
        };
      }

      const passwordHash = require('../utils/passwordHash').hashPasswordLegacy(newPassword);

      await pool.request()
        .input('userId', db.sql.UniqueIdentifier, tokenRow.UserId)
        .input('passwordHash', db.sql.NVarChar, passwordHash)
        .query(`
          UPDATE Users
          SET PasswordHash = @passwordHash,
              UpdatedAt = GETDATE()
          WHERE UserId = @userId
        `);

      await pool.request()
        .input('passwordResetTokenId', db.sql.UniqueIdentifier, tokenRow.PasswordResetTokenId)
        .query(`
          UPDATE PasswordResetTokens
          SET UsedAt = GETDATE()
          WHERE PasswordResetTokenId = @passwordResetTokenId
        `);

      await pool.request()
        .input('userId', db.sql.UniqueIdentifier, tokenRow.UserId)
        .query(`
          UPDATE Sessions
          SET IsActive = 0, InvalidatedAt = GETDATE()
          WHERE UserId = @userId
            AND IsActive = 1
        `);

      return {
        success: true,
        message: 'Password berhasil direset'
      };
    } catch (error) {
      logger.error('Reset password failed:', error);
      return {
        success: false,
        errorMessage: 'Gagal mereset password'
      };
    }
  }

  /**
   * Create session in database
   * @private
   * @param {string} userId - User ID
   * @param {string} token - JWT access token
   * @param {string} refreshToken - JWT refresh token
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<string>} Session ID
   */
  async createSession(userId, token, refreshToken, ipAddress, userAgent) {
    const pool = await db.getPool();
    
    // Calculate expiration times
    const now = new Date();
    const lastActivity = now;
    const expiresAt = new Date(now.getTime() + this.sessionTimeoutMinutes * 60 * 1000);
    const maxExpiresAt = new Date(now.getTime() + this.sessionMaxDurationHours * 60 * 60 * 1000);

    // Invalidate previous sessions for this user (single session per user)
    await pool.request()
      .input('userId', db.sql.UniqueIdentifier, userId)
      .query(`
        UPDATE Sessions
        SET IsActive = 0, InvalidatedAt = GETDATE()
        WHERE UserId = @userId AND IsActive = 1
      `);

    // Create new session
    const result = await pool.request()
      .input('userId', db.sql.UniqueIdentifier, userId)
      .input('tokenHash', db.sql.VarChar, this.hashToken(token))
      .input('refreshTokenHash', db.sql.VarChar, this.hashToken(refreshToken))
      .input('ipAddress', db.sql.VarChar, ipAddress || 'unknown')
      .input('userAgent', db.sql.VarChar, userAgent || 'unknown')
      .input('lastActivity', db.sql.DateTime, lastActivity)
      .input('expiresAt', db.sql.DateTime, expiresAt)
      .input('maxExpiresAt', db.sql.DateTime, maxExpiresAt)
      .query(`
        INSERT INTO Sessions (UserId, TokenHash, RefreshTokenHash, IpAddress, UserAgent, LastActivity, ExpiresAt, MaxExpiresAt, IsActive)
        OUTPUT INSERTED.SessionId
        VALUES (@userId, @tokenHash, @refreshTokenHash, @ipAddress, @userAgent, @lastActivity, @expiresAt, @maxExpiresAt, 1)
      `);

    return result.recordset[0].SessionId;
  }

  /**
   * Hash token for storage
   * @private
   * @param {string} token - Token to hash
   * @returns {string}
   */
  hashToken(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate JWT token
   * @private
   * @param {UserInfo} user - User information
   * @param {string} type - Token type ('access' or 'refresh')
   * @returns {string}
   */
  generateToken(user, type = 'access') {
    const payload = {
      sub: user.userId,
      username: user.username,
      role: user.role,
      email: user.email,
      type
    };

    const expiration = type === 'refresh' ? this.refreshExpiration : this.jwtExpiration;

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: expiration
    });
  }

  /**
   * Login user with credentials
   * @param {string} username - User's login name
   * @param {string} password - User's password
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<LoginResult>}
   */
  async login(username, password, ipAddress, userAgent) {
    try {
      // Validate inputs
      if (!username || !password) {
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          errorMessage: 'Username and password are required'
        };
      }

      logger.info(`Login attempt for user: ${username}`);

      // Temporary account lockout when repeated login failures exceed threshold.
      const lockout = await this.getLoginLockoutStatus(username);
      if (lockout.isLocked) {
        logger.warn(`Login temporarily locked for user: ${username}`, {
          failedCount: lockout.failedCount,
          retryAfterMinutes: lockout.retryAfterMinutes
        });
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          errorMessage: `Too many login attempts. Try again in ${lockout.retryAfterMinutes} minute(s).`
        };
      }

      // Get user from database
      const dbUser = await this.getUserByUsername(username);

      if (!dbUser) {
        logger.warn(`Login failed: User not found - ${username}`);
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          errorMessage: 'Invalid username or password'
        };
      }

      // Check if user should use LDAP or local password
      let authenticated = false;

      if (dbUser.UseLDAP) {
        // Authenticate with LDAP
        const ldapResult = await ldapService.authenticate(username, password);
        authenticated = ldapResult.success;

        if (!authenticated) {
          logger.warn(`Login failed: LDAP authentication failed - ${username}`);
          return {
            success: false,
            token: null,
            refreshToken: null,
            user: null,
            errorMessage: ldapResult.errorMessage || 'Invalid username or password'
          };
        }
      } else {
        // Authenticate with local password
        authenticated = await this.authenticateWithPassword(dbUser, password);

        if (!authenticated) {
          logger.warn(`Login failed: Invalid password - ${username}`);
          return {
            success: false,
            token: null,
            refreshToken: null,
            user: null,
            errorMessage: 'Invalid username or password'
          };
        }
      }

      // Create user info object
      const userInfo = {
        userId: dbUser.UserId,
        username: dbUser.Username,
        displayName: dbUser.DisplayName,
        email: dbUser.Email,
        role: dbUser.Role
      };

      // Generate tokens
      const accessToken = this.generateToken(userInfo, 'access');
      const refreshToken = this.generateToken(userInfo, 'refresh');

      // Create session
      await this.createSession(dbUser.UserId, accessToken, refreshToken, ipAddress, userAgent);

      logger.info(`Login successful for user: ${username}`);

      return {
        success: true,
        token: accessToken,
        refreshToken: refreshToken,
        user: userInfo,
        errorMessage: null
      };

    } catch (error) {
      logger.error('Login error:', error);
      return {
        success: false,
        token: null,
        refreshToken: null,
        user: null,
        errorMessage: 'An error occurred during login'
      };
    }
  }

  /**
   * Validate JWT token
   * @param {string} token - JWT token to validate
   * @returns {Promise<TokenValidationResult>}
   */
  async validateToken(token) {
    try {
      // Verify JWT signature and expiration
      const decoded = jwt.verify(token, this.jwtSecret);

      // Check if token is access token
      if (decoded.type !== 'access') {
        return {
          isValid: false,
          user: null,
          errorMessage: 'Invalid token type'
        };
      }

      // Check if session exists and is active
      const pool = await db.getPool();
      const tokenHash = this.hashToken(token);

      const result = await pool.request()
        .input('tokenHash', db.sql.VarChar, tokenHash)
        .query(`
          SELECT SessionId, UserId, LastActivity, ExpiresAt, MaxExpiresAt, IsActive
          FROM Sessions
          WHERE TokenHash = @tokenHash
        `);

      if (result.recordset.length === 0) {
        return {
          isValid: false,
          user: null,
          errorMessage: 'Session not found'
        };
      }

      const session = result.recordset[0];

      if (!session.IsActive) {
        return {
          isValid: false,
          user: null,
          errorMessage: 'Session has been invalidated'
        };
      }

      // Check if session has expired
      const now = new Date();
      if (now > new Date(session.ExpiresAt) || now > new Date(session.MaxExpiresAt)) {
        // Invalidate expired session
        await pool.request()
          .input('sessionId', db.sql.UniqueIdentifier, session.SessionId)
          .query(`
            UPDATE Sessions
            SET IsActive = 0, InvalidatedAt = GETDATE()
            WHERE SessionId = @sessionId
          `);

        return {
          isValid: false,
          user: null,
          errorMessage: 'Session has expired'
        };
      }

      // Get user info
      const user = await this.getUserById(decoded.sub);

      if (!user) {
        return {
          isValid: false,
          user: null,
          errorMessage: 'User not found'
        };
      }

      // Update last activity (extend session)
      const newExpiresAt = new Date(now.getTime() + this.sessionTimeoutMinutes * 60 * 1000);
      
      // Don't extend beyond max duration
      const finalExpiresAt = newExpiresAt > new Date(session.MaxExpiresAt) 
        ? new Date(session.MaxExpiresAt) 
        : newExpiresAt;

      await pool.request()
        .input('sessionId', db.sql.UniqueIdentifier, session.SessionId)
        .input('lastActivity', db.sql.DateTime, now)
        .input('expiresAt', db.sql.DateTime, finalExpiresAt)
        .query(`
          UPDATE Sessions
          SET LastActivity = @lastActivity, ExpiresAt = @expiresAt
          WHERE SessionId = @sessionId
        `);

      return {
        isValid: true,
        user: {
          userId: user.UserId,
          username: user.Username,
          displayName: user.DisplayName,
          email: user.Email,
          role: user.Role
        },
        errorMessage: null
      };

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return {
          isValid: false,
          user: null,
          errorMessage: 'Token has expired'
        };
      } else if (error.name === 'JsonWebTokenError') {
        return {
          isValid: false,
          user: null,
          errorMessage: 'Invalid token'
        };
      }

      logger.error('Token validation error:', error);
      return {
        isValid: false,
        user: null,
        errorMessage: 'Token validation failed'
      };
    }
  }

  /**
   * Logout user (revoke token)
   * @param {string} token - JWT token to revoke
   * @returns {Promise<boolean>}
   */
  async logout(token) {
    try {
      const tokenHash = this.hashToken(token);
      const pool = await db.getPool();

      await pool.request()
        .input('tokenHash', db.sql.VarChar, tokenHash)
        .query(`
          UPDATE Sessions
          SET IsActive = 0, InvalidatedAt = GETDATE()
          WHERE TokenHash = @tokenHash
        `);

      logger.info('User logged out successfully');
      return true;

    } catch (error) {
      logger.error('Logout error:', error);
      return false;
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<LoginResult>}
   */
  async refreshToken(refreshToken, ipAddress, userAgent) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtSecret);

      // Check if token is refresh token
      if (decoded.type !== 'refresh') {
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          errorMessage: 'Invalid token type'
        };
      }

      // Require refresh token to be bound to an active server-side session
      const pool = await db.getPool();
      const refreshTokenHash = this.hashToken(refreshToken);
      const sessionResult = await pool.request()
        .input('refreshTokenHash', db.sql.VarChar, refreshTokenHash)
        .query(`
          SELECT SessionId, UserId, IsActive, ExpiresAt, MaxExpiresAt
          FROM Sessions
          WHERE RefreshTokenHash = @refreshTokenHash
        `);

      if (sessionResult.recordset.length === 0) {
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          errorMessage: 'Invalid refresh token'
        };
      }

      const session = sessionResult.recordset[0];
      const now = new Date();
      if (!session.IsActive || now > new Date(session.ExpiresAt) || now > new Date(session.MaxExpiresAt)) {
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          errorMessage: 'Refresh session has expired'
        };
      }

      if (String(session.UserId) !== String(decoded.sub)) {
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          errorMessage: 'Refresh token does not match session'
        };
      }

      // Get user
      const user = await this.getUserById(decoded.sub);

      if (!user) {
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          errorMessage: 'User not found'
        };
      }

      // Create user info object
      const userInfo = {
        userId: user.UserId,
        username: user.Username,
        displayName: user.DisplayName,
        email: user.Email,
        role: user.Role
      };

      // Generate new tokens
      const newAccessToken = this.generateToken(userInfo, 'access');
      const newRefreshToken = this.generateToken(userInfo, 'refresh');

      // Create new session
      await this.createSession(user.UserId, newAccessToken, newRefreshToken, ipAddress, userAgent);

      logger.info(`Token refreshed for user: ${user.Username}`);

      return {
        success: true,
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: userInfo,
        errorMessage: null
      };

    } catch (error) {
      logger.error('Token refresh error:', error);
      return {
        success: false,
        token: null,
        refreshToken: null,
        user: null,
        errorMessage: 'Token refresh failed'
      };
    }
  }
}

// Export singleton instance
module.exports = new AuthService();
