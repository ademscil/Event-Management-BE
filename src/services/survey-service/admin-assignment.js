const sql = require('../../database/sql-client');
const { ValidationError } = require('./errors');

function normalizeAssignedAdminIds(data) {
  const listFromArray = Array.isArray(data.assignedAdminIds) ? data.assignedAdminIds : [];
  const listFromLegacy = data.assignedAdminId ? [data.assignedAdminId] : [];
  const merged = [...listFromArray, ...listFromLegacy].filter(Boolean).map((item) => String(item).trim());
  return [...new Set(merged)];
}

async function validateAssignedAdmins(pool, assignedAdminIds) {
  for (const adminId of assignedAdminIds) {
    const adminCheck = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, adminId)
      .query("SELECT UserId FROM Users WHERE UserId = @userId AND IsActive = 1 AND Role = 'AdminEvent'");

    if (adminCheck.recordset.length === 0) {
      throw new ValidationError('Assigned admin user not found, inactive, or not Admin Event');
    }
  }
}

async function syncSurveyAdminAssignments(connection, surveyId, assignedAdminIds) {
  const makeRequest = () => {
    if (connection && typeof connection.request === 'function') {
      return connection.request();
    }
    return new sql.Request(connection);
  };

  await makeRequest()
    .input('surveyId', sql.UniqueIdentifier, surveyId)
    .query('DELETE FROM SurveyAdminAssignments WHERE SurveyId = @surveyId');

  for (const adminId of assignedAdminIds) {
    await makeRequest()
      .input('surveyId', sql.UniqueIdentifier, surveyId)
      .input('adminUserId', sql.UniqueIdentifier, adminId)
      .query(`
        INSERT INTO SurveyAdminAssignments (SurveyId, AdminUserId, CreatedAt)
        VALUES (@surveyId, @adminUserId, GETDATE())
      `);
  }
}

module.exports = {
  normalizeAssignedAdminIds,
  syncSurveyAdminAssignments,
  validateAssignedAdmins
};
