const { ValidationError } = require('./errors');

function validateOrganizationalSelections(respondent) {
  if (!respondent) {
    throw new ValidationError('Respondent information is required');
  }
}

function normalizeRespondent(respondent) {
  const safeName = String(respondent?.name || '').trim().slice(0, 200) || 'Respondent';
  const rawEmail = String(respondent?.email || '').trim().toLowerCase();

  return {
    ...respondent,
    name: safeName,
    email: rawEmail || null
  };
}

async function getOrgHierarchyByApplication(createRequest, sql, applicationId) {
  const result = await (await createRequest())
    .input('applicationId', sql.UniqueIdentifier, applicationId)
    .query(`
      SELECT TOP 1
        bu.BusinessUnitId,
        div.DivisionId,
        dept.DepartmentId
      FROM ApplicationDepartmentMappings adm
      INNER JOIN Departments dept ON adm.DepartmentId = dept.DepartmentId
      INNER JOIN Divisions div ON dept.DivisionId = div.DivisionId
      INNER JOIN BusinessUnits bu ON div.BusinessUnitId = bu.BusinessUnitId
      WHERE adm.ApplicationId = @applicationId
        AND bu.IsActive = 1
        AND div.IsActive = 1
        AND dept.IsActive = 1
    `);

  if (result.recordset.length === 0) {
    return null;
  }

  return {
    businessUnitId: result.recordset[0].BusinessUnitId,
    divisionId: result.recordset[0].DivisionId,
    departmentId: result.recordset[0].DepartmentId
  };
}

async function resolveRespondentOrg(createRequest, sql, respondent, applicationId) {
  const resolved = {
    businessUnitId: respondent.businessUnitId || null,
    divisionId: respondent.divisionId || null,
    departmentId: respondent.departmentId || null
  };

  if (resolved.businessUnitId && resolved.divisionId && resolved.departmentId) {
    return resolved;
  }

  const mappedOrg = await getOrgHierarchyByApplication(createRequest, sql, applicationId);
  if (!mappedOrg) {
    throw new ValidationError(`Application mapping is incomplete for applicationId: ${applicationId}`);
  }

  return {
    businessUnitId: resolved.businessUnitId || mappedOrg.businessUnitId,
    divisionId: resolved.divisionId || mappedOrg.divisionId,
    departmentId: resolved.departmentId || mappedOrg.departmentId
  };
}

module.exports = {
  getOrgHierarchyByApplication,
  normalizeRespondent,
  resolveRespondentOrg,
  validateOrganizationalSelections
};
