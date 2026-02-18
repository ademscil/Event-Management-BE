const os = require('os');
const logger = require('../config/logger');
const db = require('../database/connection');

/**
 * Monitoring Service
 * Provides system health checks and metrics
 */
class MonitoringService {
  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      requests: 0,
      errors: 0,
      dbQueries: 0,
      dbErrors: 0
    };
  }

  /**
   * Get system health status
   * @returns {Promise<Object>}
   */
  async getHealthStatus() {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: this.getUptime(),
        system: this.getSystemMetrics(),
        database: await this.getDatabaseHealth(),
        application: this.getApplicationMetrics()
      };

      // Determine overall health
      if (health.database.status !== 'connected') {
        health.status = 'unhealthy';
      } else if (health.system.memory.percentUsed > 90 || health.system.cpu.percentUsed > 90) {
        health.status = 'degraded';
      }

      return health;
    } catch (error) {
      logger.error('Failed to get health status:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Get application uptime
   * @returns {Object}
   */
  getUptime() {
    const uptimeMs = Date.now() - this.startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    return {
      milliseconds: uptimeMs,
      seconds: uptimeSeconds,
      formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`
    };
  }

  /**
   * Get system metrics
   * @returns {Object}
   */
  getSystemMetrics() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    const cpus = os.cpus();
    const cpuUsage = this.getCPUUsage();

    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      nodeVersion: process.version,
      memory: {
        total: this.formatBytes(totalMemory),
        used: this.formatBytes(usedMemory),
        free: this.formatBytes(freeMemory),
        percentUsed: ((usedMemory / totalMemory) * 100).toFixed(2)
      },
      cpu: {
        model: cpus[0]?.model || 'Unknown',
        cores: cpus.length,
        percentUsed: cpuUsage.toFixed(2)
      },
      loadAverage: os.loadavg().map(load => load.toFixed(2))
    };
  }

  /**
   * Get CPU usage percentage
   * @returns {number}
   */
  getCPUUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    return usage;
  }

  /**
   * Get database health
   * @returns {Promise<Object>}
   */
  async getDatabaseHealth() {
    try {
      const startTime = Date.now();
      const pool = await db.getPool();
      const responseTime = Date.now() - startTime;

      // Test query
      await pool.request().query('SELECT 1 as test');

      return {
        status: 'connected',
        responseTime: `${responseTime}ms`,
        poolSize: pool.size,
        poolAvailable: pool.available,
        poolPending: pool.pending
      };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return {
        status: 'disconnected',
        error: error.message
      };
    }
  }

  /**
   * Get application metrics
   * @returns {Object}
   */
  getApplicationMetrics() {
    const memUsage = process.memoryUsage();

    return {
      pid: process.pid,
      memory: {
        rss: this.formatBytes(memUsage.rss),
        heapTotal: this.formatBytes(memUsage.heapTotal),
        heapUsed: this.formatBytes(memUsage.heapUsed),
        external: this.formatBytes(memUsage.external)
      },
      metrics: {
        totalRequests: this.metrics.requests,
        totalErrors: this.metrics.errors,
        errorRate: this.metrics.requests > 0 
          ? ((this.metrics.errors / this.metrics.requests) * 100).toFixed(2) + '%'
          : '0%',
        dbQueries: this.metrics.dbQueries,
        dbErrors: this.metrics.dbErrors
      }
    };
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes
   * @returns {string}
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Increment request counter
   */
  incrementRequests() {
    this.metrics.requests++;
  }

  /**
   * Increment error counter
   */
  incrementErrors() {
    this.metrics.errors++;
  }

  /**
   * Increment database query counter
   */
  incrementDbQueries() {
    this.metrics.dbQueries++;
  }

  /**
   * Increment database error counter
   */
  incrementDbErrors() {
    this.metrics.dbErrors++;
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      requests: 0,
      errors: 0,
      dbQueries: 0,
      dbErrors: 0
    };
    logger.info('Metrics reset');
  }

  /**
   * Get detailed metrics report
   * @returns {Object}
   */
  getMetricsReport() {
    return {
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
      metrics: this.metrics,
      system: this.getSystemMetrics(),
      application: this.getApplicationMetrics()
    };
  }

  /**
   * Log metrics periodically
   * @param {number} intervalMs - Interval in milliseconds
   */
  startPeriodicLogging(intervalMs = 300000) { // Default: 5 minutes
    setInterval(() => {
      const report = this.getMetricsReport();
      logger.info('Periodic metrics report', report);
    }, intervalMs);

    logger.info(`Started periodic metrics logging (interval: ${intervalMs}ms)`);
  }
}

// Export singleton instance
module.exports = new MonitoringService();
