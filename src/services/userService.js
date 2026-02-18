const sql = require('mssql');
const bcrypt = require('bcrypt');
const BaseRepository = require('./baseRepository');
const db = require('../database/connection');
const logger = require('../config/logger');

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 422;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

/**
 * User Management Service with LDAP toggle support
 */
class UserService {
  constructor() {
    this.repository = new BaseRepository('Users', 'UserId');
    this.saltRounds = 10;
  }

  /**
   * Validate hierarchy Business Unit -> Division -> Department.
   * When one field is provided, all fields must be provided.
   */
  async validateOrgHierarchy(pool, businessUnitId, divisionId, departmentId) {
    const hasAnyField =
      businessUnitId !== undefined ||
      divisionId !== undefined ||
      departmentId !== undefined;

    if (!hasAnyField) {
      return {
        businessUnitId: undefined,
        divisionId: undefined,
        departmentId: undefined
      };
    }

    const normalizedBusinessUnitId = businessUnitId ?? null;
    const normalizedDivisionId = divisionId ?? null;
    const normalizedDepartmentId = departmentId ?? null;

    if (!normalizedBusinessUnitId || !normalizedDivisionId || !normalizedDepartmentId) {
      throw new ValidationError('Business Unit, Division, and Department must be filled together');
    }

    const businessUnitCheck = await pool.request()
      .input('businessUnitId', sql.UniqueIdentifier, normalizedBusinessUnitId)
      .query(`
        SELECT BusinessUnitId
        FROM BusinessUnits
        WHERE BusinessUnitId = @businessUnitId AND IsActive = 1
      `);

    if (businessUnitCheck.recordset.length === 0) {
      throw new ValidationError('Business Unit not found or inactive');
    }

    const divisionCheck = await pool.request()
      .input('divisionId', sql.UniqueIdentifier, normalizedDivisionId)
      .input('businessUnitId', sql.UniqueIdentifier, normalizedBusinessUnitId)
      .query(`
        SELECT DivisionId
        FROM Divisions
        WHERE DivisionId = @divisionId
          AND BusinessUnitId = @businessUnitId
          AND IsActive = 1
      `);

    if (divisionCheck.recordset.length === 0) {
      throw new ValidationError('Division is not found, inactive, or outside selected Business Unit');
    }

    const departmentCheck = await pool.request()
      .input('departmentId', sql.UniqueIdentifier, normalizedDepartmentId)
      .input('divisionId', sql.UniqueIdentifier, normalizedDivisionId)
      .query(`
        SELECT DepartmentId
        FROM Departments
        WHERE DepartmentId = @departmentId
          AND DivisionId = @divisionId
          AND IsActive = 1
      `);

    if (departmentCheck.recordset.length === 0) {
      throw new ValidationError('Department is not found, inactive, or outside selected Division');
    }

    return {
      businessUnitId: normalizedBusinessUnitId,
      divisionId: normalizedDivisionId,
      departmentId: normalizedDepartmentId
    };
  }

  /**
   * Validate email format
   * @param {string} email - Email address
   * @returns {boolean} True if valid
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate username format
   * @param {string} username - Username
   * @returns {boolean} True if valid
   */
  validateUsername(username) {
    // 3-50 characters, alphanumeric and underscore only
    const usernameRegex = /^[a-zA-Z0-9_]{3,50}$/;
    return usernameRegex.test(username);
  }

  /**
   * Create a new user
   * @param {Object} data - User data
   * @param {string} data.username - Username (3-50 chars, alphanumeric + underscore)
   * @param {string} data.displayName - Display name
   * @param {string} data.email - Email address
   * @param {string} data.role - User role (SuperAdmin, AdminEvent, ITLead, DepartmentHead)
   * @param {boolean} [data.useLDAP=true] - Whether to use LDAP authentication
   * @param {string} [data.password] - Password (required if useLDAP is false)
   * @returns {Promise<Object>} Created user
   */
  async createUser(data) {
    try {
      // Validate username
      if (!this.validateUsername(data.username)) {
        throw new ValidationError('Username must be 3-50 characters, alphanumeric and underscore only');
      }

      // Validate email
      if (!this.validateEmail(data.email)) {
        throw new ValidationError('Invalid email format');
      }

      // Validate role
      const validRoles = ['SuperAdmin', 'AdminEvent', 'ITLead', 'DepartmentHead'];
      if (!validRoles.includes(data.role)) {
        throw new ValidationError(`Role must be one of: ${validRoles.join(', ')}`);
      }

      const pool = await db.getPool();
      const orgHierarchy = await this.validateOrgHierarchy(
        pool,
        data.businessUnitId,
        data.divisionId,
        data.departmentId
      );

      // Check for duplicate username
      const usernameCheck = await pool.request()
        .input('username', sql.NVarChar(50), data.username)
        .query('SELECT UserId FROM Users WHERE Username = @username');

      if (usernameCheck.recordset.length > 0) {
        throw new ConflictError(`Username '${data.username}' already exists`);
      }

      // Check for duplicate email
      const emailCheck = await pool.request()
        .input('email', sql.NVarChar(200), data.email)
        .query('SELECT UserId FROM Users WHERE Email = @email');

      if (emailCheck.recordset.length > 0) {
        throw new ConflictError(`Email '${data.email}' already exists`);
      }

      // Handle password hashing for non-LDAP users
      let passwordHash = null;
      const useLDAP = data.useLDAP !== false; // Default to true

      if (!useLDAP) {
        if (!data.password) {
          throw new ValidationError('Password is required for non-LDAP users');
        }
        if (data.password.length < 8) {
          throw new ValidationError('Password must be at least 8 characters');
        }
        passwordHash = await bcrypt.hash(data.password, this.saltRounds);
      }

      // Create user
      const result = await pool.request()
        .input('username', sql.NVarChar(50), data.username)
        .input('displayName', sql.NVarChar(200), data.displayName)
        .input('email', sql.NVarChar(200), data.email)
        .input('role', sql.NVarChar(50), data.role)
        .input('useLDAP', sql.Bit, useLDAP)
        .input('passwordHash', sql.NVarChar(255), passwordHash)
        .input('businessUnitId', sql.UniqueIdentifier, orgHierarchy.businessUnitId ?? null)
        .input('divisionId', sql.UniqueIdentifier, orgHierarchy.divisionId ?? null)
        .input('departmentId', sql.UniqueIdentifier, orgHierarchy.departmentId ?? null)
        .query(`
          INSERT INTO Users (
            Username, DisplayName, Email, Role, UseLDAP, PasswordHash,
            BusinessUnitId, DivisionId, DepartmentId, IsActive, CreatedAt
          )
          OUTPUT INSERTED.*
          VALUES (
            @username, @displayName, @email, @role, @useLDAP, @passwordHash,
            @businessUnitId, @divisionId, @departmentId, 1, GETDATE()
          )
        `);

      logger.info('User created', { username: data.username, useLDAP });
      
      // Remove password hash from response
      const user = result.recordset[0];
      delete user.PasswordHash;
      return user;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError') {
        throw error;
      }
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update user information
   * @param {string} userId - User ID
   * @param {Object} data - Updated user data
   * @returns {Promise<Object>} Updated user
   */
  async updateUser(userId, data) {
    try {
      const pool = await db.getPool();

      // Check if user exists
      const userCheck = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
          SELECT UserId, Username, BusinessUnitId, DivisionId, DepartmentId
          FROM Users
          WHERE UserId = @userId
        `);

      if (userCheck.recordset.length === 0) {
        throw new NotFoundError('User not found');
      }

      // Validate email if provided
      if (data.email && !this.validateEmail(data.email)) {
        throw new ValidationError('Invalid email format');
      }

      // Check for duplicate email if email is being changed
      if (data.email) {
        const emailCheck = await pool.request()
          .input('email', sql.NVarChar(200), data.email)
          .input('userId', sql.UniqueIdentifier, userId)
          .query('SELECT UserId FROM Users WHERE Email = @email AND UserId != @userId');

        if (emailCheck.recordset.length > 0) {
          throw new ConflictError(`Email '${data.email}' already exists`);
        }
      }

      // Validate role if provided
      if (data.role) {
        const validRoles = ['SuperAdmin', 'AdminEvent', 'ITLead', 'DepartmentHead'];
        if (!validRoles.includes(data.role)) {
          throw new ValidationError(`Role must be one of: ${validRoles.join(', ')}`);
        }
      }

      const currentUser = userCheck.recordset[0];
      const hasOrgPayload =
        data.businessUnitId !== undefined ||
        data.divisionId !== undefined ||
        data.departmentId !== undefined;

      if (hasOrgPayload) {
        const nextBusinessUnitId = data.businessUnitId !== undefined ? data.businessUnitId : currentUser.BusinessUnitId;
        const nextDivisionId = data.divisionId !== undefined ? data.divisionId : currentUser.DivisionId;
        const nextDepartmentId = data.departmentId !== undefined ? data.departmentId : currentUser.DepartmentId;

        await this.validateOrgHierarchy(pool, nextBusinessUnitId, nextDivisionId, nextDepartmentId);
      }

      // Build update query dynamically
      const updateFields = [];
      const request = pool.request();
      request.input('userId', sql.UniqueIdentifier, userId);

      if (data.displayName !== undefined) {
        updateFields.push('DisplayName = @displayName');
        request.input('displayName', sql.NVarChar(200), data.displayName);
      }
      if (data.email !== undefined) {
        updateFields.push('Email = @email');
        request.input('email', sql.NVarChar(200), data.email);
      }
      if (data.role !== undefined) {
        updateFields.push('Role = @role');
        request.input('role', sql.NVarChar(50), data.role);
      }
      if (data.businessUnitId !== undefined) {
        updateFields.push('BusinessUnitId = @businessUnitId');
        request.input('businessUnitId', sql.UniqueIdentifier, data.businessUnitId);
      }
      if (data.divisionId !== undefined) {
        updateFields.push('DivisionId = @divisionId');
        request.input('divisionId', sql.UniqueIdentifier, data.divisionId);
      }
      if (data.departmentId !== undefined) {
        updateFields.push('DepartmentId = @departmentId');
        request.input('departmentId', sql.UniqueIdentifier, data.departmentId);
      }

      if (updateFields.length === 0) {
        throw new ValidationError('No fields to update');
      }

      updateFields.push('UpdatedAt = GETDATE()');

      const result = await request.query(`
        UPDATE Users
        SET ${updateFields.join(', ')}
        OUTPUT INSERTED.*
        WHERE UserId = @userId
      `);

      logger.info('User updated', { userId });
      
      // Remove password hash from response
      const user = result.recordset[0];
      delete user.PasswordHash;
      return user;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'ConflictError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Deactivate a user (soft delete)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Deactivated user
   */
  async deactivateUser(userId) {
    try {
      const pool = await db.getPool();

      const result = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
          UPDATE Users
          SET IsActive = 0, UpdatedAt = GETDATE()
          OUTPUT INSERTED.*
          WHERE UserId = @userId
        `);

      if (result.recordset.length === 0) {
        throw new NotFoundError('User not found');
      }

      logger.info('User deactivated', { userId });
      
      // Remove password hash from response
      const user = result.recordset[0];
      delete user.PasswordHash;
      return user;
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error deactivating user:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User data or null
   */
  async getUserById(userId) {
    try {
      const pool = await db.getPool();
      const result = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
          SELECT
            u.UserId,
            u.Username,
            u.DisplayName,
            u.Email,
            u.Role,
            u.UseLDAP,
            u.IsActive,
            u.BusinessUnitId,
            u.DivisionId,
            u.DepartmentId,
            bu.Name AS BusinessUnitName,
            d.Name AS DivisionName,
            dept.Name AS DepartmentName,
            u.CreatedAt,
            u.UpdatedAt
          FROM Users u
          LEFT JOIN BusinessUnits bu ON bu.BusinessUnitId = u.BusinessUnitId
          LEFT JOIN Divisions d ON d.DivisionId = u.DivisionId
          LEFT JOIN Departments dept ON dept.DepartmentId = u.DepartmentId
          WHERE u.UserId = @userId
        `);

      if (result.recordset.length === 0) {
        return null;
      }

      return result.recordset[0];
    } catch (error) {
      logger.error('Error getting user by ID:', error);
      throw error;
    }
  }

  /**
   * Get users with optional filtering
   * @param {Object} [filter] - Filter options
   * @param {boolean} [filter.includeInactive=false] - Include inactive users
   * @param {string} [filter.role] - Filter by role
   * @returns {Promise<Array>} Array of users
   */
  async getUsers(filter = {}) {
    try {
      const pool = await db.getPool();
      const conditions = [];
      const request = pool.request();

      if (typeof filter.isActive === 'boolean') {
        conditions.push('u.IsActive = @isActive');
        request.input('isActive', sql.Bit, filter.isActive);
      } else if (!filter.includeInactive) {
        conditions.push('u.IsActive = 1');
      }

      if (filter.role) {
        conditions.push('u.Role = @role');
        request.input('role', sql.NVarChar(50), filter.role);
      }

      if (filter.search) {
        conditions.push('(u.Username LIKE @search OR u.DisplayName LIKE @search OR u.Email LIKE @search)');
        request.input('search', sql.NVarChar(210), `%${filter.search}%`);
      }

      if (filter.departmentId) {
        conditions.push('u.DepartmentId = @departmentId');
        request.input('departmentId', sql.UniqueIdentifier, filter.departmentId);
      }

      let query = `
        SELECT
          u.UserId,
          u.Username,
          u.DisplayName,
          u.Email,
          u.Role,
          u.UseLDAP,
          u.IsActive,
          u.BusinessUnitId,
          u.DivisionId,
          u.DepartmentId,
          bu.Name AS BusinessUnitName,
          d.Name AS DivisionName,
          dept.Name AS DepartmentName,
          u.CreatedAt,
          u.UpdatedAt
        FROM Users u
        LEFT JOIN BusinessUnits bu ON bu.BusinessUnitId = u.BusinessUnitId
        LEFT JOIN Divisions d ON d.DivisionId = u.DivisionId
        LEFT JOIN Departments dept ON dept.DepartmentId = u.DepartmentId
      `;
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ' ORDER BY u.DisplayName';

      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting users:', error);
      throw error;
    }
  }

  /**
   * Toggle LDAP authentication for a user
   * @param {string} userId - User ID
   * @param {boolean} useLDAP - Whether to use LDAP
   * @returns {Promise<Object>} Updated user
   */
  async toggleUserLDAP(userId, useLDAP) {
    try {
      const pool = await db.getPool();

      // If switching to non-LDAP, ensure password is set
      if (!useLDAP) {
        const userCheck = await pool.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .query('SELECT PasswordHash FROM Users WHERE UserId = @userId');

        if (userCheck.recordset.length === 0) {
          throw new NotFoundError('User not found');
        }

        if (!userCheck.recordset[0].PasswordHash) {
          throw new ValidationError('Cannot disable LDAP: user has no password set. Set a password first.');
        }
      }

      const result = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('useLDAP', sql.Bit, useLDAP)
        .query(`
          UPDATE Users
          SET UseLDAP = @useLDAP, UpdatedAt = GETDATE()
          OUTPUT INSERTED.*
          WHERE UserId = @userId
        `);

      if (result.recordset.length === 0) {
        throw new NotFoundError('User not found');
      }

      logger.info('User LDAP toggle updated', { userId, useLDAP });
      
      // Remove password hash from response
      const user = result.recordset[0];
      delete user.PasswordHash;
      return user;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error toggling user LDAP:', error);
      throw error;
    }
  }

  /**
   * Set or update user password (for non-LDAP users)
   * @param {string} userId - User ID
   * @param {string} password - New password
   * @returns {Promise<Object>} Updated user
   */
  async setUserPassword(userId, password) {
    try {
      if (!password || password.length < 8) {
        throw new ValidationError('Password must be at least 8 characters');
      }

      const pool = await db.getPool();

      // Check if user exists
      const userCheck = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query('SELECT UserId FROM Users WHERE UserId = @userId');

      if (userCheck.recordset.length === 0) {
        throw new NotFoundError('User not found');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, this.saltRounds);

      const result = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('passwordHash', sql.NVarChar(255), passwordHash)
        .query(`
          UPDATE Users
          SET PasswordHash = @passwordHash, UpdatedAt = GETDATE()
          OUTPUT INSERTED.*
          WHERE UserId = @userId
        `);

      logger.info('User password updated', { userId });
      
      // Remove password hash from response
      const user = result.recordset[0];
      delete user.PasswordHash;
      return user;
    } catch (error) {
      if (error.name === 'ValidationError' || error.name === 'NotFoundError') {
        throw error;
      }
      logger.error('Error setting user password:', error);
      throw error;
    }
  }

  /**
   * Verify user password (for non-LDAP users)
   * @param {string} userId - User ID
   * @param {string} password - Password to verify
   * @returns {Promise<boolean>} True if password matches
   */
  async verifyPassword(userId, password) {
    try {
      const pool = await db.getPool();

      const result = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query('SELECT PasswordHash, UseLDAP FROM Users WHERE UserId = @userId AND IsActive = 1');

      if (result.recordset.length === 0) {
        return false;
      }

      const user = result.recordset[0];

      if (user.UseLDAP) {
        throw new ValidationError('User is configured for LDAP authentication');
      }

      if (!user.PasswordHash) {
        return false;
      }

      return await bcrypt.compare(password, user.PasswordHash);
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw error;
      }
      logger.error('Error verifying password:', error);
      throw error;
    }
  }
}

const userService = new UserService();

module.exports = userService;
module.exports.UserService = UserService;
module.exports.ValidationError = ValidationError;
module.exports.ConflictError = ConflictError;
module.exports.NotFoundError = NotFoundError;
