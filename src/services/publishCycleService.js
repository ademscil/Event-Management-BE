const sql = require('mssql');
const { randomUUID } = require('crypto');
const db = require('../database/connection');

class PublishCycleService {
  constructor() {
    this.supportCache = null;
  }

  async getConnection(connection) {
    if (connection && typeof connection.request === 'function') {
      return connection;
    }
    return db.getPool();
  }

  async makeRequest(connection) {
    const resolved = await this.getConnection(connection);
    return resolved.request();
  }

  async hasSupport(connection) {
    if (typeof this.supportCache === 'boolean') {
      return this.supportCache;
    }

    const request = await this.makeRequest(connection);
    const tableResult = await request.query(`
      SELECT COUNT(1) AS Cnt
      FROM sys.tables
      WHERE name = 'SurveyPublishCycles'
    `);

    if (Number(tableResult.recordset?.[0]?.Cnt || 0) === 0) {
      this.supportCache = false;
      return false;
    }

    const columnResult = await (await this.makeRequest(connection))
      .input('tableName', sql.NVarChar(128), 'Responses')
      .input('columnName', sql.NVarChar(128), 'PublishCycleId')
      .query(`
        SELECT COUNT(1) AS Cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName
          AND COLUMN_NAME = @columnName
      `);

    this.supportCache = Number(columnResult.recordset?.[0]?.Cnt || 0) > 0;
    return this.supportCache;
  }

  async getCurrentCycle(connection, surveyId) {
    if (!surveyId) return null;
    if (!(await this.hasSupport(connection))) return null;

    const result = await (await this.makeRequest(connection))
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .query(`
        SELECT TOP 1
          PublishCycleId,
          SurveyId,
          CycleNumber,
          PublishedAt,
          PublishedBy,
          IsCurrent,
          GeneratedAt,
          GeneratedBy
        FROM SurveyPublishCycles
        WHERE SurveyId = @surveyId
        ORDER BY IsCurrent DESC, CycleNumber DESC, PublishedAt DESC
      `);

    return result.recordset?.[0] || null;
  }

  async ensureCurrentCycle(connection, surveyId, publishedBy = null) {
    const currentCycle = await this.getCurrentCycle(connection, surveyId);
    if (currentCycle) return currentCycle;
    return this.createCycle(connection, surveyId, publishedBy, true);
  }

  async activateNewCycle(connection, surveyId, publishedBy = null) {
    return this.createCycle(connection, surveyId, publishedBy, true);
  }

  async createCycle(connection, surveyId, publishedBy = null, setCurrent = true) {
    if (!surveyId) return null;
    if (!(await this.hasSupport(connection))) return null;

    const nextCycleResult = await (await this.makeRequest(connection))
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .query(`
        SELECT ISNULL(MAX(CycleNumber), 0) + 1 AS NextCycle
        FROM SurveyPublishCycles
        WHERE SurveyId = @surveyId
      `);

    const nextCycleNumber = Number(nextCycleResult.recordset?.[0]?.NextCycle || 1);

    if (setCurrent) {
      await (await this.makeRequest(connection))
        .input('surveyId', sql.UniqueIdentifier, surveyId)
        .query(`
          UPDATE SurveyPublishCycles
          SET IsCurrent = 0,
              UpdatedAt = GETDATE()
          WHERE SurveyId = @surveyId
            AND IsCurrent = 1
        `);
    }

    const result = await (await this.makeRequest(connection))
      .input('publishCycleId', sql.UniqueIdentifier, randomUUID())
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .input('cycleNumber', sql.Int, nextCycleNumber)
      .input('publishedBy', sql.UniqueIdentifier, publishedBy || null)
      .input('isCurrent', sql.Bit, setCurrent)
      .query(`
        INSERT INTO SurveyPublishCycles (
          PublishCycleId, SurveyId, CycleNumber, PublishedAt, PublishedBy, IsCurrent, CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES (
          @publishCycleId, @surveyId, @cycleNumber, GETDATE(), @publishedBy, @isCurrent, GETDATE()
        )
      `);

    return result.recordset?.[0] || null;
  }

  async markGenerated(connection, publishCycleId, generatedBy = null) {
    if (!publishCycleId) return;
    if (!(await this.hasSupport(connection))) return;

    await (await this.makeRequest(connection))
      .input('publishCycleId', sql.UniqueIdentifier, publishCycleId)
      .input('generatedBy', sql.UniqueIdentifier, generatedBy || null)
      .query(`
        UPDATE SurveyPublishCycles
        SET GeneratedAt = GETDATE(),
            GeneratedBy = @generatedBy,
            UpdatedAt = GETDATE()
        WHERE PublishCycleId = @publishCycleId
      `);
  }
}

module.exports = new PublishCycleService();
