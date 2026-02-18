const sql = require('mssql');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Database initialization script
 * Creates database if not exists and sets up initial configuration
 */
class DatabaseInitializer {
  constructor() {
    this.masterConfig = {
      ...config.database,
      database: 'master'
    };
    this.dbName = config.database.database;
  }

  /**
   * Validate SQL identifier (database/login/user name)
   * Only allow safe identifier characters.
   * @param {string} identifier
   * @returns {string}
   */
  validateIdentifier(identifier) {
    const value = String(identifier || '').trim();
    if (!/^[A-Za-z0-9_]+$/.test(value)) {
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }
    return value;
  }

  /**
   * Escape single quotes in SQL string literal.
   * @param {string} value
   * @returns {string}
   */
  escapeSqlString(value) {
    return String(value || '').replace(/'/g, "''");
  }

  /**
   * Check if database exists
   * @param {sql.ConnectionPool} pool
   * @returns {Promise<boolean>}
   */
  async databaseExists(pool) {
    try {
      const result = await pool.request()
        .input('dbName', sql.NVarChar, this.dbName)
        .query('SELECT name FROM sys.databases WHERE name = @dbName');
      
      return result.recordset.length > 0;
    } catch (error) {
      logger.error('Failed to check database existence:', error);
      throw error;
    }
  }

  /**
   * Create database
   * @param {sql.ConnectionPool} pool
   */
  async createDatabase(pool) {
    try {
      const safeDbName = this.validateIdentifier(this.dbName);
      logger.info(`Creating database: ${safeDbName}`);
      
      await pool.request().query(`
        CREATE DATABASE [${safeDbName}]
        COLLATE SQL_Latin1_General_CP1_CI_AS
      `);
      
      logger.info(`Database created: ${safeDbName}`);
    } catch (error) {
      logger.error('Failed to create database:', error);
      throw error;
    }
  }

  /**
   * Configure database settings
   * @param {sql.ConnectionPool} pool
   */
  async configureDatabaseSettings(pool) {
    try {
      const safeDbName = this.validateIdentifier(this.dbName);
      logger.info('Configuring database settings...');
      
      // Set recovery model to SIMPLE for development, FULL for production
      const recoveryModel = config.isProduction() ? 'FULL' : 'SIMPLE';
      
      await pool.request().query(`
        ALTER DATABASE [${safeDbName}]
        SET RECOVERY ${recoveryModel}
      `);
      
      // Enable snapshot isolation for better concurrency
      await pool.request().query(`
        ALTER DATABASE [${safeDbName}]
        SET ALLOW_SNAPSHOT_ISOLATION ON
      `);
      
      await pool.request().query(`
        ALTER DATABASE [${safeDbName}]
        SET READ_COMMITTED_SNAPSHOT ON
      `);
      
      logger.info('Database settings configured');
    } catch (error) {
      logger.error('Failed to configure database settings:', error);
      throw error;
    }
  }

  /**
   * Create database user if not exists
   * @param {sql.ConnectionPool} pool
   */
  async createDatabaseUser(pool) {
    try {
      const safeDbName = this.validateIdentifier(this.dbName);
      const safeLogin = this.validateIdentifier(config.database.user);
      const escapedPassword = this.escapeSqlString(config.database.password);
      logger.info('Setting up database user...');
      
      // Check if login exists
      const loginExists = await pool.request()
        .input('loginName', sql.NVarChar, safeLogin)
        .query('SELECT name FROM sys.server_principals WHERE name = @loginName');
      
      if (loginExists.recordset.length === 0) {
        logger.info(`Creating login: ${safeLogin}`);
        
        await pool.request().query(`
          CREATE LOGIN [${safeLogin}]
          WITH PASSWORD = '${escapedPassword}'
        `);
      }
      
      // Switch to target database
      await pool.request().query(`USE [${safeDbName}]`);
      
      // Check if user exists
      const userExists = await pool.request()
        .input('userName', sql.NVarChar, safeLogin)
        .query('SELECT name FROM sys.database_principals WHERE name = @userName');
      
      if (userExists.recordset.length === 0) {
        logger.info(`Creating database user: ${safeLogin}`);
        
        await pool.request().query(`
          CREATE USER [${safeLogin}]
          FOR LOGIN [${safeLogin}]
        `);
        
        // Grant permissions
        await pool.request().query(`
          ALTER ROLE db_owner ADD MEMBER [${safeLogin}]
        `);
      }
      
      logger.info('Database user configured');
    } catch (error) {
      logger.error('Failed to create database user:', error);
      // Don't throw - user might already exist or we might not have permissions
      logger.warn('Continuing without user creation');
    }
  }

  /**
   * Initialize database
   */
  async initialize() {
    let pool;

    try {
      logger.info('Starting database initialization...');
      
      // Connect to master database
      logger.info('Connecting to master database...');
      pool = await new sql.ConnectionPool(this.masterConfig).connect();
      logger.info('Connected to master database');

      // Check if database exists
      const exists = await this.databaseExists(pool);
      
      if (exists) {
        logger.info(`Database ${this.dbName} already exists`);
      } else {
        // Create database
        await this.createDatabase(pool);
        
        // Configure database settings
        await this.configureDatabaseSettings(pool);
      }

      // Create database user (optional, might fail if no permissions)
      await this.createDatabaseUser(pool);

      logger.info('Database initialization completed successfully');
      
      return {
        success: true,
        databaseCreated: !exists,
        databaseName: this.dbName
      };
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    } finally {
      if (pool) {
        await pool.close();
        logger.info('Connection closed');
      }
    }
  }
}

// Run initialization if executed directly
if (require.main === module) {
  const initializer = new DatabaseInitializer();
  
  initializer.initialize()
    .then(result => {
      console.log('\n✓ Database initialization completed');
      console.log(`  Database: ${result.databaseName}`);
      console.log(`  Created: ${result.databaseCreated ? 'Yes' : 'No (already exists)'}`);
      console.log('\nNext steps:');
      console.log('  1. Run migrations: npm run migrate');
      console.log('  2. Seed data (optional): node src/database/seed.js');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ Database initialization failed:', error.message);
      process.exit(1);
    });
}

module.exports = DatabaseInitializer;
