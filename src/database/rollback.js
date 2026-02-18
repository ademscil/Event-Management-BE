const fs = require('fs').promises;
const path = require('path');
const sql = require('mssql');
const config = require('../config');
const logger = require('../config/logger');
const readline = require('readline');

/**
 * Database rollback script
 * Rolls back the last applied migration
 */
class MigrationRollback {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
  }

  /**
   * Get last applied migration
   * @param {sql.ConnectionPool} pool
   * @returns {Promise<Object|null>}
   */
  async getLastMigration(pool) {
    try {
      const result = await pool.request().query(`
        SELECT TOP 1 MigrationId, MigrationName, AppliedAt
        FROM Migrations
        ORDER BY MigrationId DESC
      `);
      
      return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (error) {
      logger.error('Failed to get last migration:', error);
      throw error;
    }
  }

  /**
   * Check if rollback script exists
   * @param {string} migrationName
   * @returns {Promise<boolean>}
   */
  async hasRollbackScript(migrationName) {
    const rollbackFile = migrationName.replace('.sql', '.rollback.sql');
    const filepath = path.join(this.migrationsDir, rollbackFile);
    
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute rollback script
   * @param {sql.ConnectionPool} pool
   * @param {string} migrationName
   */
  async executeRollback(pool, migrationName) {
    const rollbackFile = migrationName.replace('.sql', '.rollback.sql');
    const filepath = path.join(this.migrationsDir, rollbackFile);
    
    try {
      logger.info(`Executing rollback: ${rollbackFile}`);
      
      // Read rollback file
      const sqlContent = await fs.readFile(filepath, 'utf8');
      
      // Split by GO statements and execute each batch
      const batches = sqlContent
        .split(/^\s*GO\s*$/mi)
        .map(batch => batch.trim())
        .filter(batch => batch.length > 0);

      for (const batch of batches) {
        await pool.request().query(batch);
      }

      // Remove migration record
      await pool.request()
        .input('migrationName', sql.NVarChar, migrationName)
        .query('DELETE FROM Migrations WHERE MigrationName = @migrationName');

      logger.info(`Rollback completed: ${rollbackFile}`);
    } catch (error) {
      logger.error(`Rollback failed: ${rollbackFile}`, error);
      throw error;
    }
  }

  /**
   * Prompt user for confirmation
   * @param {string} question
   * @returns {Promise<boolean>}
   */
  async confirm(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question(`${question} (yes/no): `, answer => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
      });
    });
  }

  /**
   * Rollback last migration
   * @param {boolean} force - Skip confirmation
   */
  async rollback(force = false) {
    let pool;

    try {
      logger.info('Starting migration rollback...');
      
      // Connect to database
      logger.info('Connecting to database...');
      pool = await new sql.ConnectionPool(config.database).connect();
      logger.info('Database connected');

      // Get last migration
      const lastMigration = await this.getLastMigration(pool);
      
      if (!lastMigration) {
        logger.info('No migrations to rollback');
        return { success: true, rolledBack: false };
      }

      logger.info(`Last migration: ${lastMigration.MigrationName}`);
      logger.info(`Applied at: ${lastMigration.AppliedAt}`);

      // Check if rollback script exists
      const hasRollback = await this.hasRollbackScript(lastMigration.MigrationName);
      
      if (!hasRollback) {
        throw new Error(`Rollback script not found for: ${lastMigration.MigrationName}`);
      }

      // Confirm rollback
      if (!force) {
        const confirmed = await this.confirm(
          `Are you sure you want to rollback migration: ${lastMigration.MigrationName}?`
        );
        
        if (!confirmed) {
          logger.info('Rollback cancelled by user');
          return { success: false, cancelled: true };
        }
      }

      // Execute rollback
      await this.executeRollback(pool, lastMigration.MigrationName);

      logger.info('Migration rollback completed successfully');
      
      return {
        success: true,
        rolledBack: true,
        migrationName: lastMigration.MigrationName
      };
    } catch (error) {
      logger.error('Migration rollback failed:', error);
      throw error;
    } finally {
      if (pool) {
        await pool.close();
        logger.info('Database connection closed');
      }
    }
  }
}

// Run rollback if executed directly
if (require.main === module) {
  const rollback = new MigrationRollback();
  const force = process.argv.includes('--force');
  
  rollback.rollback(force)
    .then(result => {
      if (result.cancelled) {
        console.log('\n✓ Rollback cancelled');
      } else if (result.rolledBack) {
        console.log('\n✓ Migration rolled back successfully');
        console.log(`  Migration: ${result.migrationName}`);
      } else {
        console.log('\n✓ No migrations to rollback');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ Rollback failed:', error.message);
      process.exit(1);
    });
}

module.exports = MigrationRollback;
