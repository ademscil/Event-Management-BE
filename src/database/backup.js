const sql = require('mssql');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const logger = require('../config/logger');

/**
 * Database backup script
 * Creates database backups for disaster recovery
 */
class DatabaseBackup {
  constructor() {
    this.backupDir = path.join(process.cwd(), 'backups');
    this.dbName = config.database.database;
  }

  /**
   * Ensure backup directory exists
   */
  async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      logger.info(`Backup directory ready: ${this.backupDir}`);
    } catch (error) {
      logger.error('Failed to create backup directory:', error);
      throw error;
    }
  }

  /**
   * Generate backup filename
   * @returns {string}
   */
  generateBackupFilename() {
    const timestamp = new Date().toISOString()
      .replace(/:/g, '-')
      .replace(/\..+/, '');
    
    return `${this.dbName}_${timestamp}.bak`;
  }

  /**
   * Create full database backup
   * @param {sql.ConnectionPool} pool
   * @param {string} backupPath
   */
  async createFullBackup(pool, backupPath) {
    try {
      logger.info('Creating full database backup...');
      
      await pool.request()
        .input('dbName', sql.NVarChar, this.dbName)
        .input('backupPath', sql.NVarChar, backupPath)
        .query(`
          BACKUP DATABASE @dbName
          TO DISK = @backupPath
          WITH FORMAT,
               MEDIANAME = 'CSI_Portal_Backup',
               NAME = 'Full Backup of CSI Portal Database';
        `);
      
      logger.info(`Backup created: ${backupPath}`);
    } catch (error) {
      logger.error('Failed to create backup:', error);
      throw error;
    }
  }

  /**
   * Create differential backup
   * @param {sql.ConnectionPool} pool
   * @param {string} backupPath
   */
  async createDifferentialBackup(pool, backupPath) {
    try {
      logger.info('Creating differential database backup...');
      
      await pool.request()
        .input('dbName', sql.NVarChar, this.dbName)
        .input('backupPath', sql.NVarChar, backupPath)
        .query(`
          BACKUP DATABASE @dbName
          TO DISK = @backupPath
          WITH DIFFERENTIAL,
               MEDIANAME = 'CSI_Portal_Backup',
               NAME = 'Differential Backup of CSI Portal Database';
        `);
      
      logger.info(`Differential backup created: ${backupPath}`);
    } catch (error) {
      logger.error('Failed to create differential backup:', error);
      throw error;
    }
  }

  /**
   * Get backup file size
   * @param {string} filepath
   * @returns {Promise<number>} Size in MB
   */
  async getBackupSize(filepath) {
    try {
      const stats = await fs.stat(filepath);
      return (stats.size / (1024 * 1024)).toFixed(2);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Clean old backups
   * @param {number} retentionDays - Number of days to keep backups
   */
  async cleanOldBackups(retentionDays = 30) {
    try {
      logger.info(`Cleaning backups older than ${retentionDays} days...`);
      
      const files = await fs.readdir(this.backupDir);
      const now = Date.now();
      const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
      
      let deletedCount = 0;
      
      for (const file of files) {
        if (!file.endsWith('.bak')) continue;
        
        const filepath = path.join(this.backupDir, file);
        const stats = await fs.stat(filepath);
        const age = now - stats.mtimeMs;
        
        if (age > retentionMs) {
          await fs.unlink(filepath);
          logger.info(`Deleted old backup: ${file}`);
          deletedCount++;
        }
      }
      
      logger.info(`Cleaned ${deletedCount} old backup(s)`);
    } catch (error) {
      logger.error('Failed to clean old backups:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * List existing backups
   * @returns {Promise<Array>}
   */
  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = [];
      
      for (const file of files) {
        if (!file.endsWith('.bak')) continue;
        
        const filepath = path.join(this.backupDir, file);
        const stats = await fs.stat(filepath);
        
        backups.push({
          filename: file,
          path: filepath,
          size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
          created: stats.mtime
        });
      }
      
      return backups.sort((a, b) => b.created - a.created);
    } catch (error) {
      logger.error('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Perform database backup
   * @param {Object} options
   * @param {boolean} options.differential - Create differential backup
   * @param {number} options.retentionDays - Backup retention period
   */
  async backup(options = {}) {
    const { differential = false, retentionDays = 30 } = options;
    let pool;

    try {
      logger.info('Starting database backup...');
      
      // Ensure backup directory exists
      await this.ensureBackupDirectory();
      
      // Connect to database
      logger.info('Connecting to database...');
      pool = await new sql.ConnectionPool(config.database).connect();
      logger.info('Database connected');

      // Generate backup filename
      const filename = this.generateBackupFilename();
      const backupPath = path.join(this.backupDir, filename);

      // Create backup
      if (differential) {
        await this.createDifferentialBackup(pool, backupPath);
      } else {
        await this.createFullBackup(pool, backupPath);
      }

      // Get backup size
      const size = await this.getBackupSize(backupPath);

      // Clean old backups
      await this.cleanOldBackups(retentionDays);

      logger.info('Database backup completed successfully');
      
      return {
        success: true,
        filename,
        path: backupPath,
        size: `${size} MB`,
        type: differential ? 'differential' : 'full'
      };
    } catch (error) {
      logger.error('Database backup failed:', error);
      throw error;
    } finally {
      if (pool) {
        await pool.close();
        logger.info('Database connection closed');
      }
    }
  }
}

// Run backup if executed directly
if (require.main === module) {
  const backup = new DatabaseBackup();
  const differential = process.argv.includes('--differential');
  const retentionDays = parseInt(process.argv.find(arg => arg.startsWith('--retention='))?.split('=')[1]) || 30;
  
  backup.backup({ differential, retentionDays })
    .then(result => {
      console.log('\n✓ Database backup completed');
      console.log(`  Type: ${result.type}`);
      console.log(`  File: ${result.filename}`);
      console.log(`  Size: ${result.size}`);
      console.log(`  Path: ${result.path}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ Backup failed:', error.message);
      process.exit(1);
    });
}

module.exports = DatabaseBackup;
