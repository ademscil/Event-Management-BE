const fs = require('fs').promises;
const path = require('path');
const sql = require('mssql');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Database migration runner
 */
class MigrationRunner {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
  }

  /**
   * Get all migration files sorted by name
   * @returns {Promise<string[]>}
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsDir);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort();
    } catch (error) {
      logger.error('Failed to read migrations directory:', error);
      throw error;
    }
  }

  /**
   * Create migrations tracking table if not exists
   * @param {sql.ConnectionPool} pool
   */
  async createMigrationsTable(pool) {
    const query = `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Migrations')
      BEGIN
        CREATE TABLE Migrations (
          MigrationId INT IDENTITY(1,1) PRIMARY KEY,
          MigrationName NVARCHAR(255) NOT NULL UNIQUE,
          AppliedAt DATETIME2 NOT NULL DEFAULT GETDATE()
        );
      END
    `;

    try {
      await pool.request().query(query);
      logger.info('Migrations table ready');
    } catch (error) {
      logger.error('Failed to create migrations table:', error);
      throw error;
    }
  }

  /**
   * Get list of applied migrations
   * @param {sql.ConnectionPool} pool
   * @returns {Promise<string[]>}
   */
  async getAppliedMigrations(pool) {
    try {
      const result = await pool.request().query(
        'SELECT MigrationName FROM Migrations ORDER BY MigrationId'
      );
      return result.recordset.map(row => row.MigrationName);
    } catch (error) {
      logger.error('Failed to get applied migrations:', error);
      throw error;
    }
  }

  /**
   * Execute a migration file
   * @param {sql.ConnectionPool} pool
   * @param {string} filename
   */
  async executeMigration(pool, filename) {
    const filepath = path.join(this.migrationsDir, filename);
    
    try {
      logger.info(`Executing migration: ${filename}`);
      
      // Read migration file
      const sqlContent = await fs.readFile(filepath, 'utf8');
      
      // Split by GO statements and execute each batch
      const batches = sqlContent
        .split(/^\s*GO\s*$/mi)
        .map(batch => batch.trim())
        .filter(batch => batch.length > 0);

      for (const batch of batches) {
        await pool.request().query(batch);
      }

      // Record migration as applied
      await pool.request()
        .input('migrationName', sql.NVarChar, filename)
        .query('INSERT INTO Migrations (MigrationName) VALUES (@migrationName)');

      logger.info(`Migration completed: ${filename}`);
    } catch (error) {
      logger.error(`Migration failed: ${filename}`, error);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations() {
    let pool;

    try {
      // Connect to database
      logger.info('Connecting to database...');
      pool = await new sql.ConnectionPool(config.database).connect();
      logger.info('Database connected');

      // Create migrations table
      await this.createMigrationsTable(pool);

      // Get migration files and applied migrations
      const migrationFiles = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations(pool);

      // Find pending migrations
      const pendingMigrations = migrationFiles.filter(
        file => !appliedMigrations.includes(file)
      );

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      logger.info(`Found ${pendingMigrations.length} pending migration(s)`);

      // Execute pending migrations
      for (const migration of pendingMigrations) {
        await this.executeMigration(pool, migration);
      }

      logger.info('All migrations completed successfully');
    } catch (error) {
      logger.error('Migration process failed:', error);
      throw error;
    } finally {
      if (pool) {
        await pool.close();
        logger.info('Database connection closed');
      }
    }
  }
}

// Run migrations if executed directly
if (require.main === module) {
  const runner = new MigrationRunner();
  
  runner.runMigrations()
    .then(() => {
      console.log('✓ Migrations completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('✗ Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = MigrationRunner;
