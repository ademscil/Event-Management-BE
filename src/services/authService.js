const config = require('../config');
const logger = require('../config/logger');
const ldapService = require('./ldapService');
const phoneOtpService = require('./phoneOtpService');
const db = require('../database/connection');
const { verifyPassword } = require('../utils/passwordHash');
const {
  generateOtpCode,
  hashOneTimeToken,
  normalizePhoneChannel,
  normalizePhoneNumber
} = require('./auth-service/utils');
const {
  createPasswordResetToken,
  createPhoneOtpToken,
  getLocalUserByRecovery,
  invalidateOutstandingPhoneOtpTokens,
  invalidateOutstandingResetTokens,
  verifyStoredPhoneOtp
} = require('./auth-service/password-reset');
const {
  createSession,
  generateToken,
  hashToken,
  verifyJwt
} = require('./auth-service/tokens');
const {
  logoutSession,
  refreshAuthToken,
  validateTokenSession
} = require('./auth-service/sessions');

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

  isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  async resolveUserId(userIdentifier) {
    const normalizedIdentifier = String(userIdentifier || '').trim();
    if (!normalizedIdentifier) {
      return null;
    }

    if (this.isUuid(normalizedIdentifier)) {
      return normalizedIdentifier;
    }

    const pool = await db.getPool();
    const result = await pool.request()
      .input('username', db.sql.VarChar, normalizedIdentifier)
      .query(`
        SELECT TOP 1 UserId
        FROM Users
        WHERE Username = @username AND IsActive = 1
      `);

    return result.recordset[0]?.UserId || null;
  }

  generateOtpCode() {
    return generateOtpCode();
  }

  hashOneTimeToken(value) {
    return hashOneTimeToken(value);
  }

  normalizePhoneChannel(channel) {
    return normalizePhoneChannel(channel);
  }

  normalizePhoneNumber(phone) {
    return normalizePhoneNumber(phone);
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
    const resolvedUserId = await this.resolveUserId(userId);
    if (!resolvedUserId) {
      return null;
    }

    const pool = await db.getPool();
    const result = await pool.request()
      .input('userId', db.sql.UniqueIdentifier, resolvedUserId)
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
    return getLocalUserByRecovery(db, this.normalizePhoneNumber.bind(this), method, identifier);
  }

  async invalidateOutstandingResetTokens(userId) {
    return invalidateOutstandingResetTokens(db, userId);
  }

  async invalidateOutstandingPhoneOtpTokens(userId) {
    return invalidateOutstandingPhoneOtpTokens(db, userId);
  }

  async createPasswordResetToken(user, requestedByMethod, requestedTo, requestMeta = {}) {
    return createPasswordResetToken(
      db,
      this.hashOneTimeToken.bind(this),
      user,
      requestedByMethod,
      requestedTo,
      requestMeta,
      this.passwordResetExpirationMinutes,
    );
  }

  async createPhoneOtpToken(user, channel, code, requestMeta = {}) {
    return createPhoneOtpToken(
      db,
      this.normalizePhoneChannel.bind(this),
      this.hashOneTimeToken.bind(this),
      user,
      channel,
      code,
      requestMeta,
    );
  }

  async verifyStoredPhoneOtp(user, channel, code) {
    return verifyStoredPhoneOtp(
      db,
      this.normalizePhoneChannel.bind(this),
      this.hashOneTimeToken.bind(this),
      user,
      channel,
      code,
    );
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

      const pool = await db.getPool();
      const frontendBaseUrl = process.env.FRONTEND_BASE_URL
        || process.env.PUBLIC_SURVEY_BASE_URL
        || (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : process.env.BASE_URL)
        || 'http://localhost:3000';
      const { rawToken, tokenHash } = await this.createPasswordResetToken(
        user,
        normalizedMethod,
        normalizedMethod === 'phone' ? (user.PhoneNumber || '') : user.Email,
        requestMeta
      );
      const resetLink = `${String(frontendBaseUrl).replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;

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
    return createSession(
      db,
      this.hashToken.bind(this),
      this.sessionTimeoutMinutes,
      this.sessionMaxDurationHours,
      userId,
      token,
      refreshToken,
      ipAddress,
      userAgent,
    );
  }

  /**
   * Hash token for storage
   * @private
   * @param {string} token - Token to hash
   * @returns {string}
   */
  hashToken(token) {
    return hashToken(token);
  }

  /**
   * Generate JWT token
   * @private
   * @param {UserInfo} user - User information
   * @param {string} type - Token type ('access' or 'refresh')
   * @returns {string}
   */
  generateToken(user, type = 'access') {
    return generateToken(this.jwtSecret, this.jwtExpiration, this.refreshExpiration, user, type);
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
      return validateTokenSession({
        db,
        getUserById: this.getUserById.bind(this),
        hashToken: this.hashToken.bind(this),
        jwtSecret: this.jwtSecret,
        sessionTimeoutMinutes: this.sessionTimeoutMinutes,
        verifyJwt
      }, token);
    } catch (error) {
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
      await logoutSession(db, this.hashToken.bind(this), token);
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
      const result = await refreshAuthToken({
        createSession: this.createSession.bind(this),
        db,
        generateToken: this.generateToken.bind(this),
        getUserById: this.getUserById.bind(this),
        hashToken: this.hashToken.bind(this),
        jwtSecret: this.jwtSecret,
        verifyJwt
      }, refreshToken, ipAddress, userAgent);
      if (result.success) {
        logger.info(`Token refreshed for user: ${result.user.username}`);
      }
      return result;
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

  async requestPhoneResetOtp(identifier, channel, requestMeta = {}) {
    const normalizedChannel = this.normalizePhoneChannel(channel);
    const genericMessage = `Jika nomor telepon terdaftar untuk user local, OTP reset password akan dikirim melalui ${normalizedChannel === 'sms' ? 'SMS' : 'WhatsApp'}.`;

    try {
      const user = await this.getLocalUserByRecovery('phone', identifier);
      if (!user || !user.PhoneNumber) {
        return {
          success: true,
          message: genericMessage,
        };
      }

      const otpCode = this.generateOtpCode();
      let otpTokenHash = null;

      if (!phoneOtpService.supportsProviderVerification()) {
        const otpToken = await this.createPhoneOtpToken(user, normalizedChannel, otpCode, requestMeta);
        otpTokenHash = otpToken.tokenHash;
      }

      const deliveryResult = await phoneOtpService.sendPasswordResetOtp(user.PhoneNumber, normalizedChannel, otpCode);
      if (!deliveryResult.success) {
        if (otpTokenHash) {
          const pool = await db.getPool();
          await pool.request()
            .input('tokenHash', db.sql.NVarChar, otpTokenHash)
            .query(`
              UPDATE PasswordResetTokens
              SET UsedAt = GETDATE()
              WHERE TokenHash = @tokenHash
                AND UsedAt IS NULL
            `);
        }

        return {
          success: false,
          message: deliveryResult.error || 'Gagal mengirim OTP reset password.',
        };
      }

      logger.info('Password reset OTP requested', {
        userId: user.UserId,
        channel: normalizedChannel,
        requestedTo: user.PhoneNumber,
        ipAddress: requestMeta.ipAddress || null,
      });

      return {
        success: true,
        message: genericMessage,
      };
    } catch (error) {
      logger.error('Phone OTP request failed:', error);
      return {
        success: false,
        message: 'Gagal memproses permintaan OTP reset password.',
      };
    }
  }

  async verifyPhoneResetOtp(identifier, otp, channel, requestMeta = {}) {
    const normalizedChannel = this.normalizePhoneChannel(channel);

    try {
      const user = await this.getLocalUserByRecovery('phone', identifier);
      if (!user || !user.PhoneNumber) {
        return {
          success: false,
          errorMessage: 'OTP tidak valid atau nomor telepon tidak ditemukan.',
        };
      }

      const verificationResult = phoneOtpService.supportsProviderVerification()
        ? await phoneOtpService.verifyPasswordResetOtp(user.PhoneNumber, normalizedChannel, otp)
        : { success: await this.verifyStoredPhoneOtp(user, normalizedChannel, otp) };

      const isOtpValid = verificationResult.success;

      if (!isOtpValid) {
        return {
          success: false,
          errorMessage: verificationResult.error || 'OTP tidak valid atau sudah kedaluwarsa.',
        };
      }

      const { rawToken } = await this.createPasswordResetToken(
        user,
        'phone',
        user.PhoneNumber,
        requestMeta
      );

      logger.info('Password reset OTP verified', {
        userId: user.UserId,
        channel: normalizedChannel,
        requestedTo: user.PhoneNumber,
      });

      return {
        success: true,
        resetToken: rawToken,
        message: 'OTP valid. Silakan buat password baru.',
      };
    } catch (error) {
      logger.error('Phone OTP verification failed:', error);
      return {
        success: false,
        errorMessage: 'Gagal memverifikasi OTP reset password.',
      };
    }
  }
}

// Export singleton instance
module.exports = new AuthService();
