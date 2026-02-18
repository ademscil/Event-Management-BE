const sql = require('mssql');
const db = require('../database/connection');
const logger = require('../config/logger');

/**
 * Base Repository Pattern for generic CRUD operations
 * Provides reusable database operations with transaction support
 */
class BaseRepository {
  /**
   * Create a new BaseRepository instance
   * @param {string} tableName - Name of the database table
   * @param {string} primaryKey - Name of the primary key column (default: 'Id')
   */
  constructor(tableName, primaryKey = 'Id') {
    this.tableName = tableName;
    this.primaryKey = primaryKey;
  }

  /**
   * Create a new record
   * @param {Object} data - Record data
   * @param {sql.Transaction} [transaction] - Optional transaction
   * @returns {Promise<Object>} Created record
   */
  async create(data, transaction = null) {
    try {
      const columns = Object.keys(data);
      const values = Object.values(data);
      
      const columnList = columns.join(', ');
      const paramList = columns.map(col => `@${col}`).join(', ');
      
      const query = `
        INSERT INTO ${this.tableName} (${columnList})
        OUTPUT INSERTED.*
        VALUES (${paramList})
      `;

      let request;
      if (transaction) {
        request = new sql.Request(transaction);
      } else {
        const pool = await db.getPool();
        request = pool.request();
      }

      // Add parameters
      columns.forEach((col, index) => {
        request.input(col, values[index]);
      });

      const result = await request.query(query);
      logger.info(`Record created in ${this.tableName}`, { data });
      return result.recordset[0];
    } catch (error) {
      logger.error(`Error creating record in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Find a record by primary key
   * @param {string|number} id - Primary key value
   * @param {sql.Transaction} [transaction] - Optional transaction
   * @returns {Promise<Object|null>} Found record or null
   */
  async findById(id, transaction = null) {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = @id`;

      let request;
      if (transaction) {
        request = new sql.Request(transaction);
      } else {
        const pool = await db.getPool();
        request = pool.request();
      }

      request.input('id', id);
      const result = await request.query(query);
      
      return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (error) {
      logger.error(`Error finding record in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Find all records with optional filtering
   * @param {Object} [filter] - Filter conditions
   * @param {sql.Transaction} [transaction] - Optional transaction
   * @returns {Promise<Array>} Array of records
   */
  async findAll(filter = {}, transaction = null) {
    try {
      let query = `SELECT * FROM ${this.tableName}`;
      const conditions = [];
      const params = {};

      // Build WHERE clause from filter
      Object.keys(filter).forEach(key => {
        conditions.push(`${key} = @${key}`);
        params[key] = filter[key];
      });

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      let request;
      if (transaction) {
        request = new sql.Request(transaction);
      } else {
        const pool = await db.getPool();
        request = pool.request();
      }

      // Add parameters
      Object.keys(params).forEach(key => {
        request.input(key, params[key]);
      });

      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error(`Error finding records in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Update a record by primary key
   * @param {string|number} id - Primary key value
   * @param {Object} data - Updated data
   * @param {sql.Transaction} [transaction] - Optional transaction
   * @returns {Promise<Object>} Updated record
   */
  async update(id, data, transaction = null) {
    try {
      const columns = Object.keys(data);
      const setClause = columns.map(col => `${col} = @${col}`).join(', ');
      
      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}
        OUTPUT INSERTED.*
        WHERE ${this.primaryKey} = @id
      `;

      let request;
      if (transaction) {
        request = new sql.Request(transaction);
      } else {
        const pool = await db.getPool();
        request = pool.request();
      }

      request.input('id', id);
      columns.forEach(col => {
        request.input(col, data[col]);
      });

      const result = await request.query(query);
      
      if (result.recordset.length === 0) {
        throw new Error(`Record with ${this.primaryKey} = ${id} not found in ${this.tableName}`);
      }

      logger.info(`Record updated in ${this.tableName}`, { id, data });
      return result.recordset[0];
    } catch (error) {
      logger.error(`Error updating record in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Delete a record by primary key
   * @param {string|number} id - Primary key value
   * @param {sql.Transaction} [transaction] - Optional transaction
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(id, transaction = null) {
    try {
      const query = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = @id`;

      let request;
      if (transaction) {
        request = new sql.Request(transaction);
      } else {
        const pool = await db.getPool();
        request = pool.request();
      }

      request.input('id', id);
      const result = await request.query(query);
      
      logger.info(`Record deleted from ${this.tableName}`, { id });
      return result.rowsAffected[0] > 0;
    } catch (error) {
      logger.error(`Error deleting record from ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Execute a custom query
   * @param {string} query - SQL query
   * @param {Object} params - Query parameters
   * @param {sql.Transaction} [transaction] - Optional transaction
   * @returns {Promise<Array>} Query results
   */
  async executeQuery(query, params = {}, transaction = null) {
    try {
      let request;
      if (transaction) {
        request = new sql.Request(transaction);
      } else {
        const pool = await db.getPool();
        request = pool.request();
      }

      // Add parameters
      Object.keys(params).forEach(key => {
        request.input(key, params[key]);
      });

      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error(`Error executing query on ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Count records with optional filtering
   * @param {Object} [filter] - Filter conditions
   * @param {sql.Transaction} [transaction] - Optional transaction
   * @returns {Promise<number>} Count of records
   */
  async count(filter = {}, transaction = null) {
    try {
      let query = `SELECT COUNT(*) as total FROM ${this.tableName}`;
      const conditions = [];
      const params = {};

      // Build WHERE clause from filter
      Object.keys(filter).forEach(key => {
        conditions.push(`${key} = @${key}`);
        params[key] = filter[key];
      });

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      let request;
      if (transaction) {
        request = new sql.Request(transaction);
      } else {
        const pool = await db.getPool();
        request = pool.request();
      }

      // Add parameters
      Object.keys(params).forEach(key => {
        request.input(key, params[key]);
      });

      const result = await request.query(query);
      return result.recordset[0].total;
    } catch (error) {
      logger.error(`Error counting records in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Check if a record exists
   * @param {string|number} id - Primary key value
   * @param {sql.Transaction} [transaction] - Optional transaction
   * @returns {Promise<boolean>} True if exists
   */
  async exists(id, transaction = null) {
    try {
      const query = `SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = @id`;

      let request;
      if (transaction) {
        request = new sql.Request(transaction);
      } else {
        const pool = await db.getPool();
        request = pool.request();
      }

      request.input('id', id);
      const result = await request.query(query);
      
      return result.recordset.length > 0;
    } catch (error) {
      logger.error(`Error checking existence in ${this.tableName}:`, error);
      throw error;
    }
  }
}

module.exports = BaseRepository;
