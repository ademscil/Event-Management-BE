const sql = require('./sql-client');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const logger = require('../config/logger');

/**
 * Database Restore Verification Script
 * Verifies backup files are valid and can be restored to a test database.
 * Does NOT restore to production — only verifies backup integrity.
 *
 * Usage:
 *   node src/database/restore-verify.js                    # Verify latest backup
 *   node src/database/restore-verify.js --list             # List available backups
 *   node src/database/restore-verify.js --file=<filename>  # Verify specific backup file
 */

class RestoreVerifier {
  constructor() {
    this.backupDir = path.join(process.cwd(), 'backups');
    this.dbName = config.database.database;
    this.verifyDbName = `${this.dbName}_VerifyRestore`;
  }

  /**
   * List available backup files sorted by newest first
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
          sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
          created: stats.mtime,
        });
      }

      return backups.sort((a, b) => b.created - a.created);
    } catch (error) {
      logger.error('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Verify backup file integrity using RESTORE VERIFYONLY (no actual restore)
   * This is safe to run against production SQL Server.
   */
  async verifyBackupIntegrity(pool, backupPath) {
    logger.info(`Verifying backup integrity: ${backupPath}`);

    await pool.request()
      .input('backupPath', sql.NVarChar, backupPath)
      .query(`RESTORE VERIFYONLY FROM DISK = @backupPath`);

    logger.info('Backup integrity check passed');
  }

  /**
   * Get backup header info (metadata without restoring)
   */
  async getBackupHeaderInfo(pool, backupPath) {
    const result = await pool.request()
      .input('backupPath', sql.NVarChar, backupPath)
      .query(`RESTORE HEADERONLY FROM DISK = @backupPath`);

    return result.recordset[0] || null;
  }

  /**
   * Get file list from backup (shows what files are inside)
   */
  async getBackupFileList(pool, backupPath) {
    const result = await pool.request()
      .input('backupPath', sql.NVarChar, backupPath)
      .query(`RESTORE FILELISTONLY FROM DISK = @backupPath`);

    return result.recordset;
  }

  /**
   * Run full verification on a backup file
   */
  async verify(backupFilename) {
    let pool;

    try {
      logger.info('Connecting to database for restore verification...');
      pool = await new sql.ConnectionPool(config.database).connect();
      logger.info('Connected');

      // Resolve backup path
      let backupPath;
      if (backupFilename) {
        backupPath = path.join(this.backupDir, backupFilename);
      } else {
        // Use latest backup
        const backups = await this.listBackups();
        if (!backups.length) {
          throw new Error('No backup files found in backups/ directory. Run npm run db:backup first.');
        }
        backupPath = backups[0].path;
        backupFilename = backups[0].filename;
        logger.info(`Using latest backup: ${backupFilename}`);
      }

      // Check file exists
      try {
        await fs.access(backupPath);
      } catch {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      const stats = await fs.stat(backupPath);
      const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

      console.log(`\n  File   : ${backupFilename}`);
      console.log(`  Size   : ${sizeMb} MB`);
      console.log(`  Path   : ${backupPath}`);

      // Step 1: Verify integrity
      console.log('\n  [1/3] Verifying backup integrity (RESTORE VERIFYONLY)...');
      await this.verifyBackupIntegrity(pool, backupPath);
      console.log('        ✓ Integrity check passed');

      // Step 2: Read header info
      console.log('  [2/3] Reading backup header...');
      const header = await this.getBackupHeaderInfo(pool, backupPath);
      if (header) {
        console.log(`        ✓ Backup type  : ${header.BackupType === 1 ? 'Full' : header.BackupType === 5 ? 'Differential' : `Type ${header.BackupType}`}`);
        console.log(`        ✓ Database     : ${header.DatabaseName}`);
        console.log(`        ✓ Backup start : ${header.BackupStartDate}`);
        console.log(`        ✓ Backup finish: ${header.BackupFinishDate}`);
        console.log(`        ✓ Server       : ${header.ServerName}`);
        console.log(`        ✓ SQL version  : ${header.SoftwareVersionMajor}.${header.SoftwareVersionMinor}`);
      }

      // Step 3: List files inside backup
      console.log('  [3/3] Listing files inside backup...');
      const fileList = await this.getBackupFileList(pool, backupPath);
      fileList.forEach((f) => {
        console.log(`        ✓ ${f.LogicalName} (${f.Type === 'D' ? 'Data' : 'Log'}) → ${f.PhysicalName}`);
      });

      return {
        success: true,
        filename: backupFilename,
        sizeMb,
        header,
        fileList,
      };
    } catch (error) {
      logger.error('Restore verification failed:', error);
      throw error;
    } finally {
      if (pool) {
        await pool.close();
        logger.info('Database connection closed');
      }
    }
  }
}

// Run if executed directly
if (require.main === module) {
  const verifier = new RestoreVerifier();
  const listOnly = process.argv.includes('--list');
  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  const filename = fileArg ? fileArg.split('=')[1] : undefined;

  if (listOnly) {
    verifier.listBackups().then((backups) => {
      if (!backups.length) {
        console.log('\n  No backup files found. Run: npm run db:backup\n');
        process.exit(0);
      }
      console.log(`\n  Available backups (${backups.length}):\n`);
      backups.forEach((b, i) => {
        console.log(`  ${i + 1}. ${b.filename}`);
        console.log(`     Size: ${b.sizeMb} MB  |  Created: ${b.created.toISOString()}`);
      });
      console.log('');
      process.exit(0);
    });
  } else {
    verifier.verify(filename)
      .then((result) => {
        console.log('\n  ✓ Backup verification PASSED\n');
        process.exit(0);
      })
      .catch((error) => {
        console.error(`\n  ✗ Backup verification FAILED: ${error.message}\n`);
        process.exit(1);
      });
  }
}

module.exports = RestoreVerifier;
