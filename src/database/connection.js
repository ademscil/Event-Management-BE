const sql = require('mssql');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Database connection pool manager
 */
class DatabaseConnection {
  constructor() {
    this.pool = null;
    this.connecting = false;
  }

  /**
   * Get or create database connection pool
   * @returns {Promise<sql.ConnectionPool>}
   */
  async getPool() {
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    if (this.connecting) {
      // Wait for existing connection attempt
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.getPool();
    }

    this.connecting = true;

    try {
      logger.info('Connecting to database...', {
        server: config.database.server,
        database: config.database.database
      });

      this.pool = await new sql.ConnectionPool(config.database).connect();
      
      logger.info('Database connection established');
      
      // Handle connection errors
      this.pool.on('error', err => {
        logger.error('Database pool error:', err);
        this.pool = null;
      });

      this.connecting = false;
      return this.pool;
    } catch (error) {
      this.connecting = false;
      logger.error('Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Execute a query with parameters
   * @param {string} query - SQL query
   * @param {Object} params - Query parameters
   * @returns {Promise<sql.IResult>}
   */
  async query(query, params = {}) {
    const pool = await this.getPool();
    const request = pool.request();

    // Add parameters to request
    Object.keys(params).forEach(key => {
      request.input(key, params[key]);
    });

    try {
      const result = await request.query(query);
      return result;
    } catch (error) {
      logger.error('Query execution failed:', { query, error: error.message });
      throw error;
    }
  }

  /**
   * Execute a stored procedure
   * @param {string} procedureName - Stored procedure name
   * @param {Object} params - Procedure parameters
   * @returns {Promise<sql.IResult>}
   */
  async executeProcedure(procedureName, params = {}) {
    const pool = await this.getPool();
    const request = pool.request();

    // Add parameters to request
    Object.keys(params).forEach(key => {
      const param = params[key];
      if (param.output) {
        request.output(key, param.type, param.value);
      } else {
        request.input(key, param.type || sql.NVarChar, param.value || param);
      }
    });

    try {
      const result = await request.execute(procedureName);
      return result;
    } catch (error) {
      logger.error('Stored procedure execution failed:', { 
        procedureName, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Begin a transaction
   * @returns {Promise<sql.Transaction>}
   */
  async beginTransaction() {
    const pool = await this.getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    return transaction;
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      logger.info('Database connection closed');
    }
  }
}

// Export singleton instance and sql types
module.exports = new DatabaseConnection();
module.exports.sql = sql;
